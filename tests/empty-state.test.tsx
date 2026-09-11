import path from 'node:path'
import { ESLint } from 'eslint'
import { useEffect, type RefObject } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { PAGE_SIZE } from '@/api/contract/limits'
import { EmptyState, failureKind } from '@/empty-state/EmptyState'
import { VOCABULARY, type UiError } from '@/errors/uiError'
import { BoardPanel } from '@/list-panel/BoardPanel'
import { ListPanelProvider } from '@/list-panel/ListPanelProvider'
import { InteractionProvider, useInteraction } from '@/world/interaction/InteractionProvider'
import type { InteractableRegistry } from '@/world/interaction/registry'
import { BoardTargets, boardItems } from '@/world/rooms/BoardTargets'
import { startContractServer, type ContractServer } from './support/contract-server'

// 規格：openspec/changes/fe-x04-empty-states/specs/empty-state/spec.md
//   Requirement: 五種空狀態，封閉，各自認得出來 —— S01／S02／S03
//   Requirement: 哪一種失敗畫成哪一種，由 FE-X03 的種類決定 —— S04／S05／S06
//   Requirement: 載入失敗可以重試同一頁，權限阻擋不能 —— S08／S09／S10
//   Requirement: 清單容器的三個插槽裡直接寫的節點只能是這一列的元件 —— S11／S12
//
// 元件判準直接掛載；接線判準走真的 `BoardPanel` ＋真的 operation ＋ `contract-server`。
// **不連任何團隊共用的位址。**

const uiError = (kind: UiError['kind']): UiError => ({ kind, message: VOCABULARY[kind], cause: null })
const marker = () => screen.getByTestId('empty-state').dataset.emptyState
const text = () => screen.getByTestId('empty-state').textContent ?? ''

describe('五種空狀態，封閉，各自認得出來', () => {
  it('[FE-X04-S01] 五種各自出現一個帶不同種類標記的節點', () => {
    const seen: string[] = []
    for (const kind of ['first-empty', 'filtered-empty', 'exhausted'] as const) {
      const { unmount } = render(<EmptyState kind={kind} />)
      seen.push(marker() ?? '')
      unmount()
    }
    for (const error of [uiError('authentication-required'), uiError('server-error')]) {
      const { unmount } = render(<EmptyState kind="failure" error={error} retry={() => {}} />)
      seen.push(marker() ?? '')
      unmount()
    }
    expect(seen).toEqual(['first-empty', 'filtered-empty', 'exhausted', 'permission-blocked', 'load-failed'])
  })

  it('[FE-X04-S02] 三種非失敗狀態的可見文字兩兩不同', () => {
    const texts: string[] = []
    for (const kind of ['first-empty', 'filtered-empty', 'exhausted'] as const) {
      const { unmount } = render(<EmptyState kind={kind} />)
      texts.push(text())
      unmount()
    }
    expect(texts.every((t) => t.trim() !== ''), '有一種是空字串').toBe(true)
    expect(new Set(texts).size, '有兩種寫成了同一句話').toBe(3)
  })

  it('[FE-X04-S03] 「篩選無結果」與「首次無資料」不是同一種', () => {
    // 今天沒有篩選器（FE-B05 在 W6）—— 這一條只由直接掛載證明，不偽造篩選狀態。
    const first = render(<EmptyState kind="first-empty" />)
    const firstMarker = marker()
    const firstText = text()
    first.unmount()
    render(<EmptyState kind="filtered-empty" />)
    expect(marker(), '篩選無結果被 alias 到首次無資料了').not.toBe(firstMarker)
    expect(text()).not.toBe(firstText)
  })
})

describe('載入失敗可以重試同一頁，權限阻擋不能', () => {
  it('[FE-X04-S09] 權限阻擋沒有重試，但呈現呼叫端給的動作', () => {
    render(
      <EmptyState
        kind="failure"
        error={uiError('authentication-required')}
        retry={() => {}}
        action={<a data-testid="caller-action" href="/login">去登入</a>}
      />,
    )
    expect(marker()).toBe('permission-blocked')
    expect(screen.getByTestId('caller-action')).toBeInTheDocument()
    expect(screen.queryByRole('button'), '權限阻擋長出了重試 —— 重試一百次也不會好').toBeNull()
  })

  it('[FE-X04-S10] 權限阻擋沒有給動作時，除了那一句話沒有任何可操作的東西', () => {
    render(<EmptyState kind="failure" error={uiError('permission-denied')} retry={() => {}} />)
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.queryByRole('link')).toBeNull()
    expect(text()).toBe(VOCABULARY['permission-denied'])
  })

  it('載入失敗的重試是呼叫端給的那一個，按一次叫一次', () => {
    const retry = vi.fn()
    render(<EmptyState kind="failure" error={uiError('server-error')} retry={retry} />)
    expect(marker()).toBe('load-failed')
    fireEvent.click(screen.getByRole('button'))
    expect(retry).toHaveBeenCalledTimes(1)
  })

  it('failureKind：只有要登入與沒有權限是權限阻擋，其餘全是載入失敗', () => {
    const kinds: UiError['kind'][] = [
      'authentication-required',
      'permission-denied',
      'not-found',
      'conflict',
      'validation',
      'request-rejected',
      'server-error',
      'network-unavailable',
      'contract-drift',
      'aborted',
      'unexpected',
    ]
    const blocked = kinds.filter((k) => failureKind(uiError(k)) === 'permission-blocked')
    expect(blocked.sort()).toEqual(['authentication-required', 'permission-denied'])
  })
})

// ── 接線：真的 BoardPanel ────────────────────────────────────────────

let server: ContractServer
const UUID = (n: number) => `11111111-1111-1111-1111-${String(n).padStart(12, '0')}`
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
const profile = (n: number) => ({
  id: UUID(n),
  display_name: `人才${n}`,
  avatar_id: 0,
  skills: [],
  hours_per_week: null,
  bio: null,
  updated_at: '2026-09-09T00:00:00Z',
})
const many = <T,>(make: (n: number) => T, count: number) => Array.from({ length: count }, (_, i) => make(i))

function Grab({ sinkRef }: { sinkRef: RefObject<InteractableRegistry | null> }) {
  const { registry } = useInteraction()
  useEffect(() => {
    sinkRef.current = registry
  }, [sinkRef, registry])
  return null
}

/** 掛載真的 provider 樹，回傳「按 E」。 */
function mountBoards() {
  const sinkRef: RefObject<InteractableRegistry | null> = { current: null }
  render(
    <InteractionProvider>
      <ListPanelProvider>
        <Grab sinkRef={sinkRef} />
        <BoardTargets />
        <BoardPanel />
      </ListPanelProvider>
    </InteractionProvider>,
  )
  return (kind: 'projectBoard' | 'talentBoard') => {
    const id = boardItems().find((b) => b.kind === kind)?.item.id
    if (id === undefined) throw new Error(`配置裡沒有 ${kind}`)
    act(() => {
      const entry = sinkRef.current?.entries.get(id)
      if (entry === undefined) throw new Error(`registry 裡沒有 ${id}`)
      entry.onInteract?.()
    })
  }
}
const cards = () => screen.queryAllByRole('listitem').length

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

describe('哪一種失敗畫成哪一種，由 FE-X03 的種類決定（走真的面板與真的 HTTP）', () => {
  it('[FE-X04-S04] 訪客開啟面板：401 → 權限阻擋，那一句是「要登入」', async () => {
    server.reply(401, { detail: '未登入' })
    mountBoards()('projectBoard')
    const node = await screen.findByTestId('empty-state')
    expect(node.dataset.emptyState, '401 沒有畫成權限阻擋 —— 訪客會一直按重試').toBe('permission-blocked')
    expect(node.textContent).toContain(VOCABULARY['authentication-required'])
    expect(node.textContent, '後端的 detail 漏到畫面上了').not.toContain('未登入')
  })

  it('[FE-X04-S05] 403 也是權限阻擋', async () => {
    server.reply(403, { detail: '不是你的' })
    mountBoards()('projectBoard')
    expect((await screen.findByTestId('empty-state')).dataset.emptyState).toBe('permission-blocked')
  })

  it('[FE-X04-S06] 500 是載入失敗，不是權限阻擋，那一句是「伺服器出了問題」', async () => {
    // ⚠️ 跟 S04／S05 成對：只有前兩條的話，「所有失敗都畫成要登入」全綠。
    server.reply(500, { detail: 'Internal Server Error' })
    mountBoards()('projectBoard')
    const node = await screen.findByTestId('empty-state')
    expect(node.dataset.emptyState).toBe('load-failed')
    expect(node.textContent).toContain(VOCABULARY['server-error'])
    expect(screen.getByRole('button', { name: '再試一次' })).toBeInTheDocument()
  })

  it('[FE-X04-S08] 續頁失敗按一次重試，恰好再問一次同一頁', async () => {
    server.reply(200, many(project, PAGE_SIZE))
    server.reply(500, { detail: '壞了' })
    server.reply(200, many(project, 2))
    mountBoards()('projectBoard')
    await waitFor(() => expect(cards()).toBe(PAGE_SIZE))
    fireEvent.click(screen.getByRole('button', { name: '下一頁' }))
    const node = await screen.findByTestId('empty-state')
    expect(node.dataset.emptyState).toBe('load-failed')
    fireEvent.click(screen.getByRole('button', { name: '再試一次' }))
    await waitFor(() => expect(cards()).toBe(2))
    expect(server.calls.map((c) => c.search), '重試沒有問同一頁、或問了不只一次').toEqual([
      '?page=0',
      '?page=1',
      '?page=1',
    ])
  })
})

describe('每一塊看板的面板三個插槽都接上了', () => {
  it.each([
    ['projectBoard', '/api/projects', () => many(project, 3)],
    ['talentBoard', '/api/profiles', () => many(profile, 3)],
  ] as const)('[FE-X04-S11] %s：空陣列 → 首次無資料；不滿一頁 → 項目之後翻到底', async (board, path, some) => {
    server.replyFor(path, 200, [])
    const pressE = mountBoards()
    pressE(board)
    expect((await screen.findByTestId('empty-state')).dataset.emptyState).toBe('first-empty')

    // 關掉再開：另一種資料量。
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' }))
    })
    server.replyFor(path, 200, some())
    pressE(board)
    await waitFor(() => expect(cards()).toBe(3))
    const node = screen.getByTestId('empty-state')
    expect(node.dataset.emptyState, '不滿一頁沒有畫成翻到底').toBe('exhausted')
    // 在**最後一個項目**之後（審查指出只跟 `<ul>` 比不夠緊）。
    const last = screen.getAllByRole('listitem').at(-1)
    if (last === undefined) throw new Error('沒有項目')
    expect(last.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})

describe('三個插槽裡直接寫的節點只能是 EmptyState（lint）', () => {
  const ROOT = path.resolve(import.meta.dirname, '..')
  const LINT_TIMEOUT = 60_000
  const HEAD = "import { ListPanel } from '@/list-panel/ListPanel'\nimport { EmptyState } from '@/empty-state/EmptyState'\n"
  async function lint(code: string) {
    const eslint = new ESLint({ cwd: ROOT })
    const [result] = await eslint.lintText(HEAD + code, { filePath: 'src/world/rooms/Sneaky.tsx' })
    if (!result) throw new Error('ESLint 沒有回傳結果')
    return result.messages
  }
  const slotHits = async (code: string) => (await lint(code)).filter((m) => m.message.includes('只能放 <EmptyState>'))

  it.each([
    ['empty 放 <p>', 'export const A = () => <ListPanel empty={<p>沒有資料</p>} />\n'],
    ['exhausted 放 <span>', 'export const A = () => <ListPanel exhausted={<span>已無更多</span>} />\n'],
    ['error 放 arrow 回 <div>', 'export const A = () => <ListPanel error={({ retry }) => <div onClick={retry}>重試</div>} />\n'],
    ['empty 放 fragment', 'export const A = () => <ListPanel empty={<>沒有</>} />\n'],
    // 有大括號的函式本體 —— 加一對大括號與 return 不該是規格允許的規避方式（審查抓到的）。
    ['error 放大括號本體 return <div>', 'export const A = () => <ListPanel error={({ retry }) => { return <div onClick={retry}>重試</div> }} />\n'],
    ['error 放 function 本體 return fragment', 'export const A = () => <ListPanel error={function (s) { return <>{String(s)}</> }} />\n'],
  ])('[FE-X04-S12] %s → lint 紅', async (_label, code) => {
    expect((await slotHits(code)).length).toBeGreaterThan(0)
  }, LINT_TIMEOUT)

  it('[FE-X04-S12] 同一段程式碼改用 EmptyState 就通過（成對）', async () => {
    const bad = 'export const A = () => <ListPanel empty={<p>沒有資料</p>} />\n'
    const good =
      'export const A = () => <ListPanel empty={<EmptyState kind="first-empty" />} error={({ retry, cause }) => <EmptyState kind="failure" error={cause} retry={retry} action={<a href="/login">去</a>} />} />\n'
    expect((await slotHits(bad)).length).toBeGreaterThan(0)
    // `<EmptyState action={<a/>}>` 裡面的 `<a>` 是合法的 —— 規則只看插槽最外層那個元素。
    // ⚠️ 看的是**整段 lint 的結果**，不只是這條規則的訊息：只過濾自己的訊息會把
    // 「這段程式碼其實被別條規則擋了」算成綠（審查指出）。
    expect((await lint(good)).filter((m) => m.severity === 2)).toEqual([])
    // 有大括號的本體 return EmptyState 也過。
    const goodBlock =
      'export const A = () => <ListPanel error={({ retry, cause }) => { return <EmptyState kind="failure" error={cause} retry={retry} /> }} />\n'
    expect((await lint(goodBlock)).filter((m) => m.severity === 2)).toEqual([])
  }, LINT_TIMEOUT)
})
