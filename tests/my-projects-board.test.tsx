import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import { act } from 'react'
import type { ProjectOut, ProjectStatus } from '@/api/contract/rest'
import { PAGE_SIZE } from '@/api/contract/limits'
import { IdentityProvider } from '@/identity/IdentityProvider'
import { InboxPanelProvider } from '@/inbox/InboxPanelProvider'
import { BOARD_VIEW_LABELS, BoardPanel } from '@/list-panel/BoardPanel'
import { ListPanelProvider } from '@/list-panel/ListPanelProvider'
import { WorldUrlSync } from '@/list-panel/PanelUrlSync'
import { InteractionProvider } from '@/world/interaction/InteractionProvider'
import { RoomsRefreshProvider } from '@/world/rooms/RoomsRefreshContext'
import { startContractServer, type ContractServer } from './support/contract-server'

// 規格：openspec/changes/fe-j03-my-projects/specs/my-projects/spec.md
//   Requirement: 「我的案件」是專案看板的另一個視圖，入口只給已登入的人 —— S01
//   Requirement: 卡片與詳情共用；詳情裡成軍或結案之後回來，那一筆是新的 —— S04
//   Requirement: 晚到的回應不得混進另一個視圖 —— S05 的看板半邊（切回招募中不混；hook 半邊在 `my-projects.test.tsx`）
// 規格：openspec/changes/fe-j03-my-projects/specs/deep-link/spec.md —— S07 的畫面半邊（直達 `view=mine` 不送 `page=0`；詳情返回回到我的案件）
//
// `project-lifecycle` 那棵樹加 `WorldUrlSync`（網址要驗）。真的 `src/api/` → 本機自起的 contract-server。**不連任何團隊共用的位址。**

const UUID = (n: number) => `66666666-6666-4666-8666-${String(n).padStart(12, '0')}`
const ME = { id: UUID(900), display_name: '我', avatar_id: 0, skills: [], hours_per_week: null, bio: null, updated_at: '2026-09-10T00:00:00Z' }
const OTHER = { ...ME, id: UUID(901), display_name: '別人' }
let seq = 0
const project = (owner: string, status: ProjectStatus, title: string): ProjectOut => {
  seq += 1
  return { id: UUID(seq), owner_id: owner, title, body: '內容', needed_skills: [], status, room_template: status === 'recruiting' ? null : 0, seat_count: 4, expires_at: new Date(Date.now() + 5 * 86_400_000).toISOString(), updated_at: new Date(Date.UTC(2026, 8, 1) - seq * 60_000).toISOString() }
}
const recruitingPage = (n: number) => Array.from({ length: PAGE_SIZE }, (_, i) => project(OTHER, 'recruiting', `招募 ${n}-${i}`))
const path = (status: ProjectStatus, n: number) => `/api/projects?status=${status}&page=${n}`
const refreshRooms = vi.fn()

let server: ContractServer
beforeEach(async () => {
  server = await startContractServer()
  process.env.NEXT_PUBLIC_GUILDHUB_REST = server.base
  process.env.NEXT_PUBLIC_DATA_ADAPTER = 'guildhub'
  seq = 0
  refreshRooms.mockReset()
})
afterEach(async () => {
  cleanup()
  await server.close()
  delete process.env.NEXT_PUBLIC_GUILDHUB_REST
  delete process.env.NEXT_PUBLIC_DATA_ADAPTER
  window.history.replaceState(null, '', '/world')
})

async function mount(url: string, { guest = false } = {}) {
  if (guest) server.replyFor('/api/me', 401, { detail: 'no' })
  else server.replyFor('/api/me', 200, ME)
  window.history.replaceState(null, '', url)
  render(
    <RoomsRefreshProvider refresh={refreshRooms}>
      <IdentityProvider>
        <InboxPanelProvider>
          <InteractionProvider>
            <ListPanelProvider>
              <WorldUrlSync />
              <div data-testid="world" data-focus-anchor="world" tabIndex={-1}>
                <BoardPanel />
              </div>
            </ListPanelProvider>
          </InteractionProvider>
        </InboxPanelProvider>
      </IdentityProvider>
    </RoomsRefreshProvider>,
  )
  await waitFor(() => expect(server.calls.filter((c) => c.pathname === '/api/me')).toHaveLength(1))
  await act(async () => {})
}
/** 三種狀態的第 0 頁各排一份（`InboxPanelProvider` 以 me 為 key 會重掛一次看板 → 掃描兩次，各排兩份）。 */
function replyScan(pages: Partial<Record<ProjectStatus, ProjectOut[]>>, times = 2) {
  for (let i = 0; i < times; i += 1) for (const status of ['recruiting', 'active', 'closed'] as const) server.replyFor(path(status, 0), 200, pages[status] ?? [])
}
const panel = () => screen.getByTestId('list-panel')
const cards = () => screen.queryAllByTestId('project-card')
const titles = () => cards().map((c) => within(c).getByTestId('project-card-title').textContent)
const url = () => `${window.location.pathname}${window.location.search}`
const listCalls = () => server.calls.filter((c) => c.pathname === '/api/projects').map((c) => c.search)
const scanCalls = () => listCalls().filter((s) => s.includes('status='))
const btn = (name: string) => within(panel()).getByRole('button', { name, hidden: true }) as HTMLButtonElement
const click = (el: HTMLElement) =>
  act(() => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
async function type(el: HTMLElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(el, value)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
const gate = () => {
  let release: () => void = () => {}
  const promise = new Promise<void>((resolve) => (release = resolve))
  return { promise, release: () => release() }
}

describe('「我的案件」是專案看板的另一個視圖，入口只給已登入的人', () => {
  it('[FE-J03-S01] 訪客沒有切換；已登入在第 2 頁切過去：招募中的卡不在、「發案」仍在、同一個面板；切回來送 page=0', async () => {
    server.replyFor('/api/projects?page=2', 200, recruitingPage(2))
    server.replyFor('/api/projects?page=2', 200, recruitingPage(2))
    await mount('/world?panel=projects&page=2', { guest: true })
    await waitFor(() => expect(cards()).toHaveLength(PAGE_SIZE))
    expect(within(panel()).queryByRole('button', { name: BOARD_VIEW_LABELS.mine })).toBeNull()
    expect(within(panel()).queryByRole('button', { name: '發案' }), '訪客本來就沒有發案').toBeNull()

    cleanup()
    server.replyFor('/api/projects?page=2', 200, recruitingPage(2))
    server.replyFor('/api/projects?page=2', 200, recruitingPage(2))
    await mount('/world?panel=projects&page=2')
    await waitFor(() => expect(cards()).toHaveLength(PAGE_SIZE))
    const group = within(panel()).getByRole('group', { name: BOARD_VIEW_LABELS.group })
    expect(within(group).getByRole('button', { name: BOARD_VIEW_LABELS.recruiting }).getAttribute('aria-pressed')).toBe('true')
    const first = panel()
    replyScan({ recruiting: [project(ME, 'recruiting', '我的招募')] }, 1)
    click(btn(BOARD_VIEW_LABELS.mine))
    await waitFor(() => expect(titles()).toEqual(['我的招募']))
    expect(panel(), '要是同一個面板').toBe(first)
    expect(btn(BOARD_VIEW_LABELS.mine).getAttribute('aria-pressed')).toBe('true')
    expect(btn('發案')).toBeDefined()
    expect(url()).toBe('/world?panel=projects&view=mine')

    server.replyFor('/api/projects?page=0', 200, recruitingPage(0))
    click(btn(BOARD_VIEW_LABELS.recruiting))
    await waitFor(() => expect(cards()).toHaveLength(PAGE_SIZE))
    expect(listCalls().at(-1)).toBe('?page=0')
    expect(url()).toBe('/world?panel=projects')
  })

  it('[FE-J03-S07] 直達 ?panel=projects&view=mine：開在我的案件、送三種 status 的第 0 頁、不送 page=0；詳情返回回到我的案件', async () => {
    const mineProject = project(ME, 'recruiting', '我的招募')
    replyScan({ recruiting: [mineProject] })
    await mount('/world?panel=projects&view=mine')
    await waitFor(() => expect(titles()).toEqual(['我的招募']))
    expect(listCalls().filter((s) => !s.includes('status=')), '我的案件不該送分頁清單的請求').toEqual([])
    expect(scanCalls().filter((s) => s.startsWith('?status=recruiting')).length).toBeGreaterThanOrEqual(1)

    server.replyFor(`/api/projects/${mineProject.id}`, 200, mineProject)
    server.replyFor(`/api/profiles/${ME.id}`, 200, ME)
    click(cards()[0] as HTMLElement)
    await waitFor(() => expect(screen.getByTestId('project-detail').dataset.phase).toBe('ready'))
    await waitFor(() => expect(url()).toBe(`/world?panel=projects&project=${mineProject.id}&view=mine`))
    click(btn('返回'))
    await waitFor(() => expect(screen.queryByTestId('project-detail')).toBeNull())
    expect(titles(), '返回後我的案件還在、沒重掃').toEqual(['我的招募'])
    await waitFor(() => expect(url()).toBe('/world?panel=projects&view=mine'))
  })
})

describe('卡片與詳情共用；詳情裡成軍或結案之後回來，那一筆是新的', () => {
  it('[FE-J03-S04] 點開是同一個詳情、有成軍；成軍回來已成軍且掃描請求數不變；結案回來已結案仍在', async () => {
    const p = project(ME, 'recruiting', '我的招募')
    replyScan({ recruiting: [p] })
    await mount('/world?panel=projects&view=mine')
    await waitFor(() => expect(titles()).toEqual(['我的招募']))
    const scansBefore = scanCalls().length

    server.replyFor(`/api/projects/${p.id}`, 200, p)
    server.replyFor(`/api/profiles/${ME.id}`, 200, ME)
    click(cards()[0] as HTMLElement)
    const detail = await screen.findByTestId('project-detail')
    await waitFor(() => expect(detail.dataset.phase).toBe('ready'))
    await waitFor(() => expect(screen.getByTestId('owner-card').dataset.phase).toBe('ready'))
    expect(server.calls.some((c) => c.pathname === `/api/projects/${p.id}`)).toBe(true)
    click(within(detail).getByRole('button', { name: '成軍', hidden: true }))
    await type(within(detail).getByLabelText('房間密碼'), 'demo-1234')
    server.replyFor(`/api/projects/${p.id}/form-team`, 200, { ...p, status: 'active', room_template: 0 })
    await act(async () => (screen.getByTestId('form-team-form') as HTMLFormElement).requestSubmit())
    await waitFor(() => expect(within(detail).getByTestId('project-status').textContent).toBe('已成軍'))
    expect(refreshRooms, '門的立即重取照舊').toHaveBeenCalledTimes(1)
    click(btn('返回'))
    await waitFor(() => expect(screen.queryByTestId('project-detail')).toBeNull())
    expect(within(cards()[0] as HTMLElement).getByTestId('project-status').textContent).toBe('已成軍')
    expect(scanCalls().length, '成軍回來不該重掃').toBe(scansBefore)

    server.replyFor(`/api/projects/${p.id}`, 200, { ...p, status: 'active', room_template: 0 })
    server.replyFor(`/api/profiles/${ME.id}`, 200, ME)
    click(cards()[0] as HTMLElement)
    await waitFor(() => expect(screen.getByTestId('project-detail').dataset.phase).toBe('ready'))
    click(within(screen.getByTestId('project-detail')).getByRole('button', { name: '結案', hidden: true }))
    server.replyFor(`/api/projects/${p.id}/close`, 200, { ...p, status: 'closed', room_template: 0 })
    click(within(screen.getByTestId('close-project-confirm')).getByRole('button', { name: '確定結案', hidden: true }))
    await waitFor(() => expect(within(screen.getByTestId('project-detail')).getByTestId('project-status').textContent).toBe('已結案'))
    click(btn('返回'))
    await waitFor(() => expect(screen.queryByTestId('project-detail')).toBeNull())
    expect(titles()).toEqual(['我的招募'])
    expect(within(cards()[0] as HTMLElement).getByTestId('project-status').textContent).toBe('已結案')
    expect(scanCalls().length).toBe(scansBefore)
  })
})

describe('晚到的回應不得混進另一個視圖（看板半邊）', () => {
  it('[FE-J03-S05] 切回招募中之後 closed 那一頁才回：招募中仍是 20 筆、沒有 closed 的卡、沒有「看過幾個」', async () => {
    server.replyFor('/api/projects?page=0', 200, recruitingPage(0))
    server.replyFor('/api/projects?page=0', 200, recruitingPage(0))
    await mount('/world?panel=projects')
    await waitFor(() => expect(cards()).toHaveLength(PAGE_SIZE))
    const held = gate()
    server.replyFor(path('recruiting', 0), 200, [])
    server.replyFor(path('active', 0), 200, [])
    server.replyFor(path('closed', 0), 200, [project(ME, 'closed', '我的已結案')], { after: held.promise })
    click(btn(BOARD_VIEW_LABELS.mine))
    await waitFor(() => expect(scanCalls()).toHaveLength(3))
    expect(cards()).toHaveLength(0)
    server.replyFor('/api/projects?page=0', 200, recruitingPage(0))
    click(btn(BOARD_VIEW_LABELS.recruiting))
    await waitFor(() => expect(cards()).toHaveLength(PAGE_SIZE))
    await act(async () => held.release())
    await act(async () => {})
    expect(cards()).toHaveLength(PAGE_SIZE)
    expect(titles()).not.toContain('我的已結案')
    expect(screen.queryByTestId('my-projects-summary')).toBeNull()
  })
})
