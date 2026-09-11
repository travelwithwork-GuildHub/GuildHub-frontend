import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { PAGE_SIZE } from '@/api/contract/limits'
import { ListPanel } from '@/list-panel/ListPanel'
import type { ListKind } from '@/list-panel/paging'
import { startContractServer, type ContractServer } from './support/contract-server'

// 規格：openspec/changes/fe-b01-list-container/specs/list-panel/spec.md
//   Requirement: 案件與人才共用同一個容器 —— S03
//   Requirement: 只做狀態，不做文案 —— S12／S13
//   Requirement: Escape 關閉面板 —— S16
//
// 走真的 operation ＋ 真的 HTTP server，**不連任何團隊共用位址**。

let server: ContractServer

const UUID = (n: number) => `11111111-1111-1111-1111-${String(n).padStart(12, '0')}`
const profile = (n: number) => ({
  id: UUID(n),
  display_name: `人才${n}`,
  avatar_id: 0,
  skills: [],
  hours_per_week: null,
  bio: null,
  updated_at: '2026-09-09T00:00:00Z',
})
const project = (n: number) => ({
  id: UUID(n),
  owner_id: UUID(0),
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
const ITEMS: Record<ListKind, (count: number) => unknown[]> = {
  projects: (count) => many(project, count),
  profiles: (count) => many(profile, count),
}

const LABELS = { next: '下一頁', close: '關閉' }
/** 呼叫端的卡片：只把 `id` 印出來，讓每一種資料在畫面上長得一樣。 */
const renderItem = (item: { id: string }) => <span data-testid="card">{item.id}</span>

function mount(kind: ListKind, extra: Partial<Parameters<typeof ListPanel>[0]> = {}) {
  const onClose = vi.fn()
  const utils = render(
    <ListPanel kind={kind} title="清單" labels={LABELS} renderItem={renderItem} onClose={onClose} {...extra} />,
  )
  return { ...utils, onClose }
}
const cards = () => screen.queryAllByTestId('card').length
const edge = () => screen.getByTestId('list-panel-edge')

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

describe('案件與人才共用同一個容器', () => {
  const kinds: ListKind[] = ['projects', 'profiles']
  const paths: Record<ListKind, string> = { projects: '/api/projects', profiles: '/api/profiles' }

  it.each(kinds)('[FE-B01-S03] %s：滿頁 → 下一頁 → 不滿一頁，同一組操作走出同一條軌跡', async (kind) => {
    server.reply(200, ITEMS[kind](PAGE_SIZE))
    server.reply(200, ITEMS[kind](3))
    mount(kind)
    await waitFor(() => expect(cards()).toBe(PAGE_SIZE))
    fireEvent.click(screen.getByRole('button', { name: LABELS.next }))
    await waitFor(() => expect(cards()).toBe(3))
    // 兩種資料的軌跡要一模一樣 —— 端點不同、其餘全同。
    expect(server.calls.map((c) => `${c.method} ${c.pathname}${c.search}`)).toEqual([
      `GET ${paths[kind]}?page=0`,
      `GET ${paths[kind]}?page=1`,
    ])
    expect(screen.queryByRole('button', { name: LABELS.next }), '不滿一頁之後「下一頁」還在').toBeNull()
  })
})

describe('只做狀態，不做文案', () => {
  it('[FE-B01-S12] 首次無資料：出現呼叫端給的節點', async () => {
    server.reply(200, [])
    mount('projects', { empty: <p data-testid="slot-empty">呼叫端的空狀態</p> })
    await waitFor(() => expect(screen.getByTestId('slot-empty')).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: LABELS.next })).toBeNull()
  })

  it('[FE-B01-S12] 翻到底：出現呼叫端給的節點，「下一頁」消失', async () => {
    server.reply(200, ITEMS.projects(4))
    mount('projects', { exhausted: <p data-testid="slot-exhausted">呼叫端的到底</p> })
    await waitFor(() => expect(cards()).toBe(4))
    expect(screen.getByTestId('slot-exhausted')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: LABELS.next })).toBeNull()
  })

  it('[FE-B01-S12] 錯誤：出現呼叫端給的節點，而且它拿到的 retry 是真的', async () => {
    server.reply(500, { detail: '壞了' })
    server.reply(200, ITEMS.projects(2))
    mount('projects', {
      error: (retry) => (
        <button type="button" data-testid="slot-error" onClick={retry}>
          呼叫端的重試
        </button>
      ),
    })
    await waitFor(() => expect(screen.getByTestId('slot-error')).toBeInTheDocument())
    expect(cards()).toBe(0)
    fireEvent.click(screen.getByTestId('slot-error'))
    await waitFor(() => expect(cards()).toBe(2))
    expect(server.calls.map((c) => c.search)).toEqual(['?page=0', '?page=0'])
    expect(screen.queryByTestId('slot-error')).toBeNull()
  })

  it('[FE-B01-S12] 續頁失敗：舊卡片還在、錯誤節點出現、「下一頁」消失、retry 問的是同一頁', async () => {
    // 首次失敗那條只證明「沒有快取時」的行為。這一條是狀態機保留 `shown` 的理由：
    // 蓋掉列表的話，使用者會看到剛剛還在的 20 張卡片消失。
    server.reply(200, ITEMS.projects(PAGE_SIZE))
    server.reply(500, { detail: '壞了' })
    server.reply(200, ITEMS.projects(2))
    mount('projects', {
      error: (retry) => (
        <button type="button" data-testid="slot-error" onClick={retry}>
          呼叫端的重試
        </button>
      ),
    })
    await waitFor(() => expect(cards()).toBe(PAGE_SIZE))
    fireEvent.click(screen.getByRole('button', { name: LABELS.next }))
    await waitFor(() => expect(screen.getByTestId('slot-error')).toBeInTheDocument())
    expect(cards(), '續頁失敗把原本那一頁清掉了').toBe(PAGE_SIZE)
    expect(screen.queryByRole('button', { name: LABELS.next })).toBeNull()
    fireEvent.click(screen.getByTestId('slot-error'))
    await waitFor(() => expect(cards()).toBe(2))
    expect(server.calls.map((c) => c.search)).toEqual(['?page=0', '?page=1', '?page=1'])
  })

  it.each([
    ['首次無資料', () => server.reply(200, [])],
    ['翻到底', () => server.reply(200, ITEMS.projects(4))],
    ['錯誤', () => server.reply(500, { detail: '壞了' })],
  ] as const)('[FE-B01-S13] %s：呼叫端沒給節點，容器 SHALL NOT 自己補一句', async (_label, arrange) => {
    arrange()
    mount('projects')
    // 等到請求真的回來了（不是還在載入）。
    await waitFor(() => expect(screen.getByRole('list')).toHaveAttribute('aria-busy', 'false'))
    expect(edge().textContent, '容器自己長出了文案 —— 那是 FE-X04／FE-X03 的第二份').toBe('')
  })

  it('[FE-B01-S13] 剝掉註解之後，容器的原始碼裡 SHALL NOT 有任何 CJK 字元', () => {
    // ⚠️ **掃描前先剝掉註解** —— `FE-X13` 踩過：註解裡正好在講這件事，掃到的是註解。
    // 這一條比「沒有那三句」強：容器裡**一個**使用者看得到的字都不該有，
    // 連「下一頁」「關閉」都是呼叫端帶進來的。
    for (const file of ['ListPanel.tsx', 'useListPage.ts', 'paging.ts']) {
      const source = readFileSync(`src/list-panel/${file}`, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '')
      const hits = source.match(/[㐀-鿿＀-￯]+/g) ?? []
      expect(hits, `${file} 的程式碼裡有中文：${hits.join('、')}`).toEqual([])
    }
  })
})

describe('Escape 關閉面板', () => {
  it('[FE-B01-S16] 面板開著時按 Escape → onClose；按別的鍵不會', async () => {
    server.reply(200, ITEMS.projects(1))
    const { onClose } = mount('projects')
    await waitFor(() => expect(cards()).toBe(1))
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }))
    })
    expect(onClose).not.toHaveBeenCalled()
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' }))
    })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('[FE-B01-S16] 面板不在畫面上時，Escape 不會有任何面板的副作用', async () => {
    server.reply(200, ITEMS.projects(1))
    const { onClose, unmount } = mount('projects')
    await waitFor(() => expect(cards()).toBe(1))
    unmount()
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' }))
    })
    expect(onClose, '面板已經關了，監聽器還掛在 window 上').not.toHaveBeenCalled()
  })
})
