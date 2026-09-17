import { render, screen, within } from '@testing-library/react'
import { act } from 'react'
import { IdentityProvider } from '@/identity/IdentityProvider'
import { BoardPanel } from '@/list-panel/BoardPanel'
import { ListPanelProvider, useListPanel } from '@/list-panel/ListPanelProvider'
import { InteractionProvider } from '@/world/interaction/InteractionProvider'
import type { ContractServer } from './contract-server'

// `FE-J01` 判準共用的樹與手勢：真 `BoardPanel`＋真 `ListPanelProvider`＋真 `IdentityProvider`，資料走真的 `src/api/` 到本機自起的
// `contract-server`。**不連任何外部服務。** 兩個測試檔（`create-project.test.tsx`、`create-project-limits.test.tsx`）用同一棵樹。
//
// 面板「開著」是從網址來的（`FE-B09`：provider 掛載時讀 `window.location.search`）—— 不用走 registry 按 E，那條接線在 `board-panel-wiring.test.tsx`。

export const UUID = (n: number) => `11111111-1111-1111-1111-${String(n).padStart(12, '0')}`
export const ME = { id: UUID(9), display_name: '阿福', avatar_id: 0, skills: [], hours_per_week: null, bio: null, updated_at: '2026-09-10T00:00:00Z' }
export const project = (n: number, title: string) => ({
  id: UUID(n),
  owner_id: ME.id,
  title,
  body: '內容',
  needed_skills: [],
  status: 'recruiting',
  room_template: null,
  seat_count: 4,
  expires_at: '2026-09-25T00:00:00Z',
  updated_at: '2026-09-18T00:00:00Z',
})

/** 一個可以從外面放行的 pending：給「請求還沒回應」那種判準用；測試結尾一定要 `release()`，不然 server 關不掉。 */
export function gate() {
  let release: () => void = () => {}
  const promise = new Promise<void>((resolve) => (release = resolve))
  return { promise, release: () => release() }
}

/** `FE-B09` 那條「呈現的頁碼」通道：provider 手上的 `page`（真實頁面上 `WorldUrlSync` 把它寫回網址）。 */
function PageProbe() {
  const { page } = useListPanel()
  return <output data-testid="page-probe">{page}</output>
}

export interface MountOptions {
  /** `GET /api/me` 的回應：`'signed-in'`（200 ME）、`'guest'`（401）、`'pending'`（永不回 —— 身分仍在解析）。 */
  identity: 'signed-in' | 'guest' | 'pending'
  panel?: 'projects' | 'profiles'
  page?: number
  /** 第一次 `GET /api/projects`（或 profiles）回的清單。 */
  items?: unknown[]
}

export function mountBoard(server: ContractServer, { identity, panel = 'projects', page = 0, items = [project(1, '舊案子') ] }: MountOptions) {
  const pending = gate()
  if (identity === 'signed-in') server.replyFor('/api/me', 200, ME)
  else if (identity === 'guest') server.replyFor('/api/me', 401, { detail: '未登入' })
  else server.replyFor('/api/me', 200, ME, { after: pending.promise })
  server.replyFor(`/api/${panel}`, 200, items)
  window.history.replaceState(null, '', `/world?panel=${panel}${page > 0 ? `&page=${page}` : ''}`)
  render(
    <IdentityProvider>
      <InteractionProvider>
        <ListPanelProvider>
          <BoardPanel />
          <PageProbe />
        </ListPanelProvider>
      </InteractionProvider>
    </IdentityProvider>,
  )
  return { releaseIdentity: pending.release }
}

export const shownPage = () => Number(screen.getByTestId('page-probe').textContent)
export const panel = () => screen.getByTestId('list-panel')
export const list = () => within(panel()).getByRole('list', { hidden: true }) as HTMLUListElement
export const field = (label: string | RegExp) => within(panel()).getByLabelText(label) as HTMLInputElement
export const button = (name: string | RegExp) => within(panel()).getByRole('button', { name, hidden: true }) as HTMLButtonElement
export const queryButton = (name: string | RegExp) => within(panel()).queryByRole('button', { name, hidden: true })

export const click = (el: HTMLElement) =>
  act(() => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
export const escape = () =>
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' }))
  })
export async function type(el: HTMLElement, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  await act(async () => {
    Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, value)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
/** 按送出鈕的效果：走 `requestSubmit`（同一個 submit 事件、同一個 guard）。 */
export const submit = async () => {
  await act(async () => {
    button('送出').form?.requestSubmit()
  })
}
export const posts = (server: ContractServer) => server.calls.filter((c) => c.method === 'POST' && c.pathname === '/api/projects')
export const gets = (server: ContractServer) => server.calls.filter((c) => c.method === 'GET' && c.pathname === '/api/projects').map((c) => c.search)
