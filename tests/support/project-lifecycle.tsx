import { expect, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import { act, useEffect } from 'react'
import type { ProjectOut } from '@/api/contract/rest'
import { IdentityProvider } from '@/identity/IdentityProvider'
import { InboxPanel } from '@/inbox/InboxPanel'
import { InboxPanelProvider } from '@/inbox/InboxPanelProvider'
import { BoardPanel } from '@/list-panel/BoardPanel'
import { ListPanelProvider, useListPanel } from '@/list-panel/ListPanelProvider'
import { InteractionProvider } from '@/world/interaction/InteractionProvider'
import { RoomsRefreshProvider } from '@/world/rooms/RoomsRefreshContext'
import type { ContractServer } from './contract-server'

// `FE-J04` 判準共用的樹與手勢（`project-lifecycle.test.tsx` 成軍、`project-close.test.tsx` 結案、`project-password-reveal.test.tsx` 密碼）。
// 整棵真的樹：IdentityProvider（contract-server 給 /api/me）> InboxPanelProvider > InteractionProvider > ListPanelProvider > [BoardPanel, InboxPanel]，
// 外面包 `RoomsRefreshProvider`（`refreshRooms` 是 vi.fn：成功恰好一次、失敗零次）。
// 面板從網址開著、詳情從 `project=<id>` 開著（`FE-B09-S14`）。**不連任何團隊共用的位址。**
// server 的起／關由各測試檔自己管（`S01` 中途要換一個乾淨的）；`refreshRooms` 各檔在 `beforeEach` 自己 `mockReset()`。

export const UUID = (n: number) => `88888888-8888-4888-8888-${String(n).padStart(12, '0')}`
export const ME = { id: UUID(900), display_name: '我', avatar_id: 0, skills: [], hours_per_week: null, bio: null, updated_at: '2026-09-10T00:00:00Z' }
export const OTHER = { ...ME, id: UUID(901), display_name: '別人' }
export const project = (n: number, extra: Partial<ProjectOut> = {}): ProjectOut => ({
  id: UUID(n),
  owner_id: ME.id,
  title: `案件${n}`,
  body: '內容',
  needed_skills: [],
  status: 'recruiting',
  room_template: null,
  seat_count: 4,
  expires_at: new Date(Date.now() + 5 * 86_400_000).toISOString(),
  updated_at: '2026-09-09T00:00:00Z',
  ...extra,
})

export const refreshRooms = vi.fn()
export const grabbed: { list: ReturnType<typeof useListPanel> | null } = { list: null }
function Grab() {
  const list = useListPanel()
  useEffect(() => {
    grabbed.list = list
  }, [list])
  return null
}

/** 登入成 `me`、案件面板＋那一筆的詳情從網址開著；等到詳情 ready。 */
export async function mountDetail(server: ContractServer, p: ProjectOut, { me = ME, page = 0 }: { me?: typeof ME; page?: number } = {}) {
  server.replyFor('/api/me', 200, me)
  // `InboxPanelProvider` 以 me 為 key：/api/me 回來會重掛一次 → 列表、詳情、發案者各兩份回應
  for (let i = 0; i < 2; i += 1) {
    server.replyFor('/api/projects', 200, [p])
    server.replyFor(`/api/projects/${p.id}`, 200, p)
    server.replyFor(`/api/profiles/${p.owner_id}`, 200, p.owner_id === ME.id ? ME : OTHER)
  }
  window.history.replaceState(null, '', `/world?panel=projects&project=${p.id}${page > 0 ? `&page=${page}` : ''}`)
  // 看板內容 lazy（FE-X15 --panel-board）：先預熱 chunk，讓 `PanelHost` 的 `import()` 命中快取、以 microtask 完成，
  // 內容在 `/api/me`（HTTP）回來前掛好，`InboxPanelProvider` 以 me 為 key 的重掛才穩定各兩份回應（否則 import vs HTTP 的時序會 flake）。
  await import('@/list-panel/BoardPanelContent')
  render(
    <RoomsRefreshProvider refresh={refreshRooms}>
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
      </IdentityProvider>
    </RoomsRefreshProvider>,
  )
  await waitFor(() => expect(server.calls.filter((c) => c.pathname === '/api/me')).toHaveLength(1))
  await waitFor(() => expect(server.calls.filter((c) => c.pathname === `/api/projects/${p.id}`)).toHaveLength(2))
  await waitFor(() => expect(detail().dataset.phase).toBe('ready'))
  await waitFor(() => expect(screen.getByTestId('owner-card').dataset.phase).toBe('ready'))
}
export const detail = () => screen.getByTestId('project-detail')
export const actions = () => screen.queryByTestId('owner-actions')
export const btn = (name: string | RegExp) => within(detail()).getByRole('button', { name, hidden: true })
export const queryBtn = (name: string | RegExp) => within(detail()).queryByRole('button', { name, hidden: true })
export const status = () => within(detail()).getByTestId('project-status').textContent
export const click = (el: HTMLElement) =>
  act(() => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
export async function type(el: HTMLElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(el, value)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
export const listGets = (server: ContractServer) => server.calls.filter((c) => c.method === 'GET' && c.pathname === '/api/projects').map((c) => c.search)
export const escape = () =>
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' }))
  })
/** 一個可以從外面放行的 pending。 */
export function gate() {
  let release: () => void = () => {}
  const promise = new Promise<void>((resolve) => (release = resolve))
  return { promise, release: () => release() }
}
