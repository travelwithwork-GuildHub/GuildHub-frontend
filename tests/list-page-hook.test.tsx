import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { StrictMode } from 'react'
import { act, renderHook, waitFor } from '@testing-library/react'
import { PAGE_SIZE } from '@/api/contract/limits'
import { edgeState } from '@/list-panel/paging'
import { useListPage } from '@/list-panel/useListPage'
import { startContractServer, type ContractServer } from './support/contract-server'

// 規格：openspec/changes/fe-b01-list-container/specs/list-panel/spec.md
//   Requirement: 翻頁只用契約真正提供的參數 —— S04／S05
//   Requirement: 請求失敗 SHALL NOT 被當成翻到底 —— S11
//   Requirement: 晚到的回應不得覆蓋畫面 —— S15
//
// `tests/list-paging-state.test.ts` 驗的是狀態機的每一條規則；**這一份驗的是有沒有人驅動它**：
// identity 變了有沒有真的送出請求、重試有沒有真的再送一次、換種類之後舊請求有沒有被丟掉。
// 走的是真的 operation ＋ 真的 HTTP server（`contract-server`），**不連任何團隊共用位址**。

let server: ContractServer

const UUID = '11111111-1111-1111-1111-111111111111'
const profile = (n: number) => ({
  id: UUID,
  display_name: `人才${n}`,
  avatar_id: 0,
  skills: [],
  hours_per_week: null,
  bio: null,
  updated_at: '2026-09-09T00:00:00Z',
})
const project = (n: number) => ({
  id: UUID,
  owner_id: UUID,
  title: `案件${n}`,
  body: '內容',
  needed_skills: [],
  status: 'recruiting',
  room_template: null,
  seat_count: 4,
  expires_at: '2026-09-16T00:00:00Z',
  updated_at: '2026-09-09T00:00:00Z',
})
const many = <T,>(make: (n: number) => T, count: number) => Array.from({ length: count }, (_, i) => make(i))

/** 到目前為止送出的 query string，依序。 */
const searches = () => server.calls.map((c) => c.search)

beforeEach(async () => {
  server = await startContractServer()
  process.env.NEXT_PUBLIC_GUILDHUB_REST = server.base
  process.env.NEXT_PUBLIC_DATA_ADAPTER = 'guildhub'
})

afterEach(async () => {
  delete process.env.NEXT_PUBLIC_GUILDHUB_REST
  delete process.env.NEXT_PUBLIC_DATA_ADAPTER
  await server.close()
})

describe('驅動層：identity 變了就請求', () => {
  it('[FE-B01-S04] 掛載就送 `page=0`，回來的資料進到畫面', async () => {
    server.reply(200, many(project, 3))
    const { result } = renderHook(() => useListPage('projects'))
    await waitFor(() => expect(result.current.state.phase).toBe('ready'))
    expect(result.current.state.shown?.items).toHaveLength(3)
    expect(result.current.state.shown?.items[0]?.title).toBe('案件0')
    expect(searches()).toEqual(['?page=0'])
  })

  it('[FE-B01-S05] 前進送的是 `page=1`', async () => {
    server.reply(200, many(project, PAGE_SIZE))
    server.reply(200, many(project, 2))
    const { result } = renderHook(() => useListPage('projects'))
    await waitFor(() => expect(result.current.state.phase).toBe('ready'))
    act(() => result.current.next())
    await waitFor(() => expect(result.current.state.shown?.page).toBe(1))
    expect(searches()).toEqual(['?page=0', '?page=1'])
    expect(edgeState(result.current.state)).toBe('exhausted')
  })

  it('[FE-B01-S11] 重試會**真的**再送一次同一頁', async () => {
    // ⚠️⚠️ 重試不改 identity，只把 `error` 變回 `loading`。
    // 效果的相依少了 `phase` 的話，狀態會停在 loading，**永遠沒有第二個請求**。
    server.reply(200, many(project, PAGE_SIZE))
    server.reply(500, { detail: '壞了' })
    server.reply(200, many(project, 5))
    const { result } = renderHook(() => useListPage('projects'))
    await waitFor(() => expect(result.current.state.phase).toBe('ready'))
    act(() => result.current.next())
    await waitFor(() => expect(result.current.state.phase).toBe('error'))
    expect(result.current.state.shown?.page, '失敗清掉了原頁').toBe(0)
    expect(edgeState(result.current.state)).toBe('error')

    act(() => result.current.retry())
    await waitFor(() => expect(result.current.state.phase).toBe('ready'))
    expect(searches(), '重試沒有送出請求').toEqual(['?page=0', '?page=1', '?page=1'])
    expect(result.current.state.shown?.page).toBe(1)
  })

  it('連點兩次：只送一個請求，停在第 1 頁', async () => {
    // 探測期間 `next` 是 no-op —— 這一列沒有「上一頁」，跳過的頁回不去。
    server.reply(200, many(project, PAGE_SIZE))
    server.reply(200, many(project, PAGE_SIZE))
    const { result } = renderHook(() => useListPage('projects'))
    await waitFor(() => expect(result.current.state.phase).toBe('ready'))
    act(() => {
      result.current.next()
      result.current.next()
    })
    await waitFor(() => expect(result.current.state.phase).toBe('ready'))
    expect(searches(), '連點兩次跳到第 2 頁了').toEqual(['?page=0', '?page=1'])
    expect(result.current.state.shown?.page).toBe(1)
  })
})

describe('中止不是失敗', () => {
  it('StrictMode 掛載兩次：第一次的中止 SHALL NOT 變成錯誤狀態', async () => {
    // ⚠️ identity 沒變、效果被重跑 —— 中止的 rejection 帶著**仍然有效**的 identity，
    // reducer 的比對擋不住它。只有驅動層看 `signal.aborted` 才擋得住。
    // 兩個請求都可能到 server，所以兩個都給回應。
    server.replyFor('/api/projects', 200, many(project, 1))
    server.replyFor('/api/projects', 200, many(project, 1))
    const phases: string[] = []
    const { result } = renderHook(
      () => {
        const page = useListPage('projects')
        phases.push(page.state.phase)
        return page
      },
      { wrapper: StrictMode },
    )
    await waitFor(() => expect(result.current.state.phase).toBe('ready'))
    expect(phases, '中止第一次掛載的請求被當成了失敗').not.toContain('error')
  })
})

describe('換一種資料', () => {
  it('案件還沒回來就改開人才：舊請求被中止、沒有閃過錯誤，最後畫面上是人才', async () => {
    // ⚠️ **這一條驗不到 identity 的比對** —— 中止讓案件的回應根本不會進 reducer，
    // 把 `sameIdentity` 拿掉它照樣綠。`S15` 的葉測試在 `list-paging-state.test.ts`。
    // 這裡驗的是驅動層自己的三件事：kind 變了有沒有重開、中止有沒有被當成失敗、
    // 人才的請求有沒有真的送出去。
    //
    // ⚠️ 不能用 `reply()`：案件的請求會被中止，中止得夠早的話它根本不會到 server，
    // 排給它的回應就會被人才的請求拿走 —— 然後契約驗證失敗，紅在錯的地方。
    server.replyFor('/api/projects', 200, many(project, 3))
    server.replyFor('/api/profiles', 200, many(profile, 2))
    const phases: string[] = []
    const { result, rerender } = renderHook(
      (kind: 'projects' | 'profiles') => {
        const page = useListPage(kind)
        phases.push(page.state.phase)
        return page
      },
      { initialProps: 'projects' as 'projects' | 'profiles' },
    )
    // 案件的請求已經送出、還沒回來。
    rerender('profiles')
    await waitFor(() => expect(result.current.state.phase).toBe('ready'))
    const items = (result.current.state.shown?.items ?? []) as ReadonlyArray<Record<string, unknown>>
    expect(items.map((i) => i.display_name), '案件混進了人才清單').toEqual(['人才0', '人才1'])
    expect(result.current.state.identity).toEqual({ kind: 'profiles', page: 0 })
    // 中止案件的請求會 reject —— 那不是這個面板的錯誤。
    expect(phases, '中止前一個請求被當成了失敗').not.toContain('error')
  })

  it('[FE-B01-S15] 案件已經在畫面上才改開人才：SHALL NOT 有任何一格繪製把案件交給人才面板', async () => {
    // ⚠️ 上一條從「案件還在 loading」開始，抓不到這個：重設是在 effect 裡 dispatch 的，
    // 而 effect 在繪製**之後**才跑 —— 換種類的那一格，hook 回的還是案件的 `shown`。
    // 症狀是人才面板先閃一下案件卡。這一條記下每一格「prop 是哪種、回的是什麼」。
    server.replyFor('/api/projects', 200, many(project, 3))
    server.replyFor('/api/profiles', 200, many(profile, 2))
    const frames: Array<{ kind: string; items: ReadonlyArray<Record<string, unknown>> }> = []
    const { result, rerender } = renderHook(
      (kind: 'projects' | 'profiles') => {
        const page = useListPage(kind)
        frames.push({ kind, items: (page.state.shown?.items ?? []) as ReadonlyArray<Record<string, unknown>> })
        return page
      },
      { initialProps: 'projects' as 'projects' | 'profiles' },
    )
    await waitFor(() => expect(result.current.state.shown?.items).toHaveLength(3))
    rerender('profiles')
    // 同步斷言，不等 effect：換種類的那一格回的就要是人才的（空的）狀態。
    expect(result.current.state.identity.kind).toBe('profiles')
    expect(result.current.state.shown).toBeNull()
    await waitFor(() => expect(result.current.state.shown?.items).toHaveLength(2))
    const leaked = frames.filter((f) => f.kind === 'profiles' && f.items.some((i) => 'title' in i))
    expect(leaked, 'prop 已經是人才、回的卻還是案件 —— 舊種類的狀態多活了一格').toEqual([])
  })
})
