import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { act, useEffect } from 'react'
import { PAGE_SIZE } from '@/api/contract/limits'
import type { ProjectOut } from '@/api/contract/rest'
import { IdentityProvider } from '@/identity/IdentityProvider'
import { InboxPanel } from '@/inbox/InboxPanel'
import { InboxPanelProvider } from '@/inbox/InboxPanelProvider'
import { BoardPanel } from '@/list-panel/BoardPanel'
import { ListPanelProvider, useListPanel } from '@/list-panel/ListPanelProvider'
import { InteractionProvider } from '@/world/interaction/InteractionProvider'
import { startContractServer, type ContractServer } from './support/contract-server'

// 規格：openspec/changes/fe-b03-project-detail/specs/project-directory/spec.md
//   Requirement: 卡片是控制項，滑鼠與鍵盤都開得了詳情 —— S01（開的是那一筆；S02 的元件半邊在 project-card.test.tsx）
//   Requirement: 動作列只放做得到的 —— S10（私訊發案者 → 看板關、收件匣在與 owner 的對話）
//   Requirement: 返回列表時，頁碼與捲動位置都還在 —— S13
//
// 整棵真的樹：IdentityProvider（contract-server 給 /api/me）> InboxPanelProvider > InteractionProvider > ListPanelProvider > BoardPanel + InboxPanel。
// 面板「開著」從網址來（`FE-B09`）。**不連任何團隊共用的位址。**

const UUID = (n: number) => `77777777-7777-4777-8777-${String(n).padStart(12, '0')}`
const ME = { id: UUID(900), display_name: '我', avatar_id: 0, skills: [], hours_per_week: null, bio: null, updated_at: '2026-09-10T00:00:00Z' }
const OWNER = { ...ME, id: UUID(901), display_name: '發案的人', avatar_id: 1 }
const project = (n: number, extra: Partial<ProjectOut> = {}): ProjectOut => ({
  id: UUID(n),
  owner_id: OWNER.id,
  title: `案件${n}`,
  body: `列表上的內容${n}`,
  needed_skills: [],
  status: 'recruiting',
  room_template: null,
  seat_count: 4,
  expires_at: new Date(Date.now() + 5 * 86_400_000).toISOString(),
  updated_at: '2026-09-09T00:00:00Z',
  ...extra,
})
const many = (count: number, from = 0) => Array.from({ length: count }, (_, i) => project(from + i))
const LIST = '/api/projects'
const detailPath = (id: string) => `/api/projects/${id}`

let server: ContractServer
const grabbed: { list: ReturnType<typeof useListPanel> | null } = { list: null }
function Grab() {
  const list = useListPanel()
  useEffect(() => {
    grabbed.list = list
  }, [list])
  return null
}
beforeEach(async () => {
  server = await startContractServer()
  process.env.NEXT_PUBLIC_GUILDHUB_REST = server.base
  process.env.NEXT_PUBLIC_DATA_ADAPTER = 'guildhub'
})
afterEach(async () => {
  cleanup()
  await server.close()
  delete process.env.NEXT_PUBLIC_GUILDHUB_REST
  delete process.env.NEXT_PUBLIC_DATA_ADAPTER
  window.history.replaceState(null, '', '/world')
})

/**
 * 登入成 `ME`、案件面板從網址開著（第 `page` 頁）。
 * ⚠️ `InboxPanelProvider` 以 `me` 為 key：`/api/me` 回來那一刻整棵看板會重掛、列表重取一次 —— 所以排兩份列表回應，並等到「已登入」之後才算掛好。
 */
async function mount(items: ProjectOut[], page = 0) {
  server.replyFor('/api/me', 200, ME)
  server.replyFor(LIST, 200, items)
  server.replyFor(LIST, 200, items)
  window.history.replaceState(null, '', `/world?panel=projects${page > 0 ? `&page=${page}` : ''}`)
  // 看板內容 lazy（FE-X15 --panel-board）：先預熱 chunk，讓 `PanelHost` 的 `import()` 命中快取、以 microtask 完成
  // —— 內容才能在 `/api/me`（HTTP）回來前掛好、如 eager 時一樣，`InboxPanelProvider` 以 me 為 key 的重掛才穩定抓兩次列表（否則 import vs HTTP 的時序會 flake）。
  await import('@/list-panel/BoardPanelContent')
  render(
    <IdentityProvider>
      <InboxPanelProvider>
        <InteractionProvider>
          <ListPanelProvider>
            <Grab />
            <div data-testid="world" data-focus-anchor="world" tabIndex={-1}>
              <BoardPanel />
              <InboxPanel />
            </div>
          </ListPanelProvider>
        </InteractionProvider>
      </InboxPanelProvider>
    </IdentityProvider>,
  )
  await waitFor(() => expect(server.calls.filter((c) => c.pathname === '/api/me')).toHaveLength(1))
  await waitFor(() => expect(listCalls()).toHaveLength(2))
  await waitFor(() => expect(cards()).toHaveLength(items.length))
}
const cards = () => screen.queryAllByTestId('project-card') as HTMLButtonElement[]
const detail = () => screen.getByTestId('project-detail')
const calls = () => server.calls.map((c) => c.pathname + c.search)
const listCalls = () => calls().filter((c) => c.startsWith(`${LIST}?`) || c === LIST)

describe('卡片是控制項，開的是那一筆', () => {
  it('[FE-B03-S01] 點第 N 筆的卡片：詳情是那一筆、送出 GET /api/projects/<那一筆的 id>', async () => {
    await mount(many(3))
    server.replyFor(detailPath(UUID(1)), 200, project(1, { body: '詳情端點回的' }))
    server.replyFor(`/api/profiles/${OWNER.id}`, 200, OWNER)
    fireEvent.click(cards()[1]!)
    await waitFor(() => expect(detail().dataset.phase).toBe('ready'))
    expect(detail().dataset.projectId).toBe(UUID(1))
    expect(within(detail()).getByTestId('project-body').textContent).toBe('詳情端點回的')
    expect(calls().filter((c) => c.startsWith('/api/projects/'))).toEqual([detailPath(UUID(1))])
    expect(grabbed.list?.selected, '選中的 id 沒進 provider（網址寫不回去）').toBe(UUID(1))
  })
})

describe('返回列表時，頁碼與捲動位置都還在', () => {
  it('[FE-B03-S13] 0-based 第 1 頁、非零 scrollTop 進去再返回：頁碼、scrollTop 都在、列表沒重打；詳情開著時列表 inert 且不是 display:none；焦點回那張卡', async () => {
    // 網址說第 1 頁：第一個請求就是 page=1，回 3 筆（0-based 第 1 頁 = 畫面上的第二頁）
    await mount(many(3, PAGE_SIZE), 1)
    expect(listCalls()).toEqual([`${LIST}?page=1`, `${LIST}?page=1`])
    await waitFor(() => expect(grabbed.list?.page).toBe(1))
    const listEl = screen.getByTestId('list-panel-list')
    listEl.scrollTop = 137
    const before = listCalls().length
    server.replyFor(detailPath(cards()[0]!.dataset.projectId!), 200, project(PAGE_SIZE))
    server.replyFor(`/api/profiles/${OWNER.id}`, 200, OWNER)
    const first = cards()[0]!
    first.focus()
    fireEvent.click(first)
    await waitFor(() => expect(detail().dataset.phase).toBe('ready'))
    expect(listEl.isConnected, '詳情開著時列表被卸載了').toBe(true)
    expect(listEl).toHaveAttribute('inert')
    expect(listEl).not.toHaveStyle({ display: 'none' })
    fireEvent.click(screen.getByRole('button', { name: '返回' }))
    expect(screen.queryByTestId('project-detail')).toBeNull()
    expect(screen.getByTestId('list-panel-list')).toBe(listEl)
    expect(listEl).not.toHaveAttribute('inert')
    expect(listEl.scrollTop).toBe(137)
    expect(grabbed.list?.page, '返回之後頁碼變了').toBe(1)
    expect(listCalls().length, '返回時重打了列表').toBe(before)
    expect(document.activeElement, '焦點沒回到開它的那張卡').toBe(first)
  })
})

describe('表單與詳情共用 overlay：導航贏', () => {
  it('[FE-B03-S13] 表單開著（有輸入）時網址帶 project 進來：詳情蓋上、返回之後沒有表單、焦點回那張卡', async () => {
    await mount(many(2))
    fireEvent.click(within(screen.getByTestId('list-panel')).getByRole('button', { name: '發案' }))
    const title = await within(screen.getByTestId('create-project-form')).findByLabelText('標題')
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(title, '打了一半的草稿')
      title.dispatchEvent(new Event('input', { bubbles: true }))
    })
    server.replyFor(detailPath(UUID(1)), 200, project(1))
    server.replyFor(`/api/profiles/${OWNER.id}`, 200, OWNER)
    // 上一頁／下一頁／深連結：provider 的 `restore` 直接帶 project 進來（`WorldUrlSync` 的 popstate 就是走這條）
    act(() => grabbed.list!.restore({ panel: 'projects', profile: null, project: UUID(1), page: 0, view: null }))
    await waitFor(() => expect(detail().dataset.phase).toBe('ready'))
    expect(screen.queryByTestId('create-project-form'), '詳情開著表單還在').toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '返回' }))
    expect(screen.queryByTestId('project-detail')).toBeNull()
    expect(screen.queryByTestId('create-project-form'), '返回之後冒出一張空白表單').toBeNull()
    expect(screen.getByTestId('list-panel-list')).not.toHaveAttribute('inert')
    expect(cards()).toHaveLength(2)
    expect(document.activeElement, '焦點沒回到那張卡（列表 inert 的話 focus 會失敗、掉到 body）').toBe(cards()[1])
  })
})

describe('動作列只放做得到的', () => {
  it('[FE-B03-S10] 非 owner 按「私訊發案者」：看板關、收件匣開著在與 owner 的對話', async () => {
    await mount(many(1))
    server.replyFor(detailPath(UUID(0)), 200, project(0))
    server.replyFor(`/api/profiles/${OWNER.id}`, 200, OWNER)
    fireEvent.click(cards()[0]!)
    await waitFor(() => expect(detail().dataset.phase).toBe('ready'))
    const send = await within(detail()).findByRole('button', { name: '私訊發案者' })
    server.replyFor('/api/messages', 200, [])
    act(() => {
      send.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await waitFor(() => expect(screen.queryByTestId('list-panel')).toBeNull())
    const thread = await screen.findByTestId('inbox-thread')
    expect(thread.dataset.with).toBe(OWNER.id)
    expect(screen.getByTestId('inbox-panel').contains(document.activeElement), '焦點不在收件匣').toBe(true)
  })
})
