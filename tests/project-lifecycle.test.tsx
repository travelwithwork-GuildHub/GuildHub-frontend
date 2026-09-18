import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { act, useEffect } from 'react'
import type { ProjectOut } from '@/api/contract/rest'
import { VOCABULARY } from '@/errors/uiError'
import { FORM_LIMITS } from '@/forms/limits'
import { IdentityProvider } from '@/identity/IdentityProvider'
import { InboxPanel } from '@/inbox/InboxPanel'
import { InboxPanelProvider } from '@/inbox/InboxPanelProvider'
import { BoardPanel } from '@/list-panel/BoardPanel'
import { ListPanelProvider, useListPanel } from '@/list-panel/ListPanelProvider'
import { InteractionProvider } from '@/world/interaction/InteractionProvider'
import { RoomsRefreshProvider } from '@/world/rooms/RoomsRefreshContext'
import { startContractServer, type ContractServer } from './support/contract-server'

// 規格：openspec/changes/fe-j04-form-team/specs/project-lifecycle/spec.md —— S01～S04、S07（S05／S06／S08 密碼的一次性呈現在 project-password-reveal.test.tsx）
//
// 整棵真的樹：IdentityProvider（contract-server 給 /api/me）> InboxPanelProvider > InteractionProvider > ListPanelProvider > [BoardPanel, InboxPanel]，
// 外面包 `RoomsRefreshProvider`（`refresh` 是 vi.fn：成功恰好一次、失敗零次）。
// 面板從網址開著、詳情從 `project=<id>` 開著（`FE-B09-S14`）。**不連任何團隊共用的位址。**

const UUID = (n: number) => `88888888-8888-4888-8888-${String(n).padStart(12, '0')}`
const ME = { id: UUID(900), display_name: '我', avatar_id: 0, skills: [], hours_per_week: null, bio: null, updated_at: '2026-09-10T00:00:00Z' }
const OTHER = { ...ME, id: UUID(901), display_name: '別人' }
const project = (n: number, extra: Partial<ProjectOut> = {}): ProjectOut => ({
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
const P = project(1)

let server: ContractServer
const refreshRooms = vi.fn()
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
  refreshRooms.mockReset()
})
afterEach(async () => {
  cleanup()
  await server.close()
  delete process.env.NEXT_PUBLIC_GUILDHUB_REST
  delete process.env.NEXT_PUBLIC_DATA_ADAPTER
  window.history.replaceState(null, '', '/world')
})

/** 登入成 `me`、案件面板＋那一筆的詳情從網址開著；等到詳情 ready。 */
async function mountDetail(p: ProjectOut, { me = ME, page = 0 }: { me?: typeof ME; page?: number } = {}) {
  server.replyFor('/api/me', 200, me)
  // `InboxPanelProvider` 以 me 為 key：/api/me 回來會重掛一次 → 列表、詳情、發案者各兩份回應
  for (let i = 0; i < 2; i += 1) {
    server.replyFor('/api/projects', 200, [p])
    server.replyFor(`/api/projects/${p.id}`, 200, p)
    server.replyFor(`/api/profiles/${p.owner_id}`, 200, p.owner_id === ME.id ? ME : OTHER)
  }
  window.history.replaceState(null, '', `/world?panel=projects&project=${p.id}${page > 0 ? `&page=${page}` : ''}`)
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
const detail = () => screen.getByTestId('project-detail')
const actions = () => screen.queryByTestId('owner-actions')
const btn = (name: string | RegExp) => within(detail()).getByRole('button', { name, hidden: true })
const queryBtn = (name: string | RegExp) => within(detail()).queryByRole('button', { name, hidden: true })
const status = () => within(detail()).getByTestId('project-status').textContent
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
const submitForm = () =>
  act(async () => {
    ;(screen.getByTestId('form-team-form') as HTMLFormElement).requestSubmit()
  })
const passwordField = () => within(detail()).getByLabelText('房間密碼') as HTMLInputElement
const formTeamCalls = (id = P.id) => server.calls.filter((c) => c.method === 'POST' && c.pathname === `/api/projects/${id}/form-team`)
const closeCalls = (id = P.id) => server.calls.filter((c) => c.method === 'POST' && c.pathname === `/api/projects/${id}/close`)
const listGets = () => server.calls.filter((c) => c.method === 'GET' && c.pathname === '/api/projects').map((c) => c.search)
const escape = () =>
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' }))
  })
/** 一個可以從外面放行的 pending。 */
function gate() {
  let release: () => void = () => {}
  const promise = new Promise<void>((resolve) => (release = resolve))
  return { promise, release: () => release() }
}
async function openFormAndFill(password: string) {
  click(btn('成軍'))
  await type(passwordField(), password)
}

describe('動作跟著狀態走，只給 owner', () => {
  it('[FE-J04-S01] recruiting 有「成軍」沒「結案」；active 反過來；closed 沒有；非 owner 什麼都沒有', async () => {
    await mountDetail(project(1, { status: 'recruiting' }))
    expect(queryBtn(/成軍/)).not.toBeNull()
    expect(queryBtn(/結案/)).toBeNull()
    cleanup()
    await server.close()
    server = await startContractServer()
    process.env.NEXT_PUBLIC_GUILDHUB_REST = server.base
    await mountDetail(project(2, { status: 'active' }))
    expect(queryBtn(/結案/)).not.toBeNull()
    expect(queryBtn(/成軍/)).toBeNull()
    cleanup()
    await server.close()
    server = await startContractServer()
    process.env.NEXT_PUBLIC_GUILDHUB_REST = server.base
    await mountDetail(project(3, { status: 'closed' }))
    expect(actions()).not.toBeNull()
    expect(within(actions()!).queryAllByRole('button')).toEqual([])
    cleanup()
    await server.close()
    server = await startContractServer()
    process.env.NEXT_PUBLIC_GUILDHUB_REST = server.base
    await mountDetail(project(4, { status: 'recruiting', owner_id: OTHER.id }))
    expect(queryBtn(/成軍|結案/)).toBeNull()
  })
})

describe('成軍：密碼由前端守上限，成功後詳情呈現回應', () => {
  it('[FE-J04-S02] 3 個字送出才紅、65 個字即時紅、空白送出紅；4／64 個 emoji 都送得出；數字有出處', async () => {
    await mountDetail(P)
    await openFormAndFill('abc')
    expect(passwordField().getAttribute('aria-invalid'), '3 個字在送出前就被罵了').not.toBe('true')
    await submitForm()
    expect(formTeamCalls()).toHaveLength(0)
    expect(passwordField().getAttribute('aria-invalid')).toBe('true')
    expect(screen.getByTestId('form-team-error-password').textContent).toContain('本站')
    expect(screen.getByTestId('form-team-error-password').textContent).toContain(String(FORM_LIMITS.roomPassword.min))
    await type(passwordField(), 'a'.repeat(65))
    expect(passwordField().getAttribute('aria-invalid'), '65 個字沒有即時標為無效').toBe('true')
    expect(screen.getByTestId('form-team-error-password').textContent).toContain(String(FORM_LIMITS.roomPassword.max))
    await type(passwordField(), '')
    await submitForm()
    expect(formTeamCalls()).toHaveLength(0)
    expect(passwordField().getAttribute('aria-invalid')).toBe('true')
    // emoji：3 個 code point（6 個 UTF-16 code unit）送出才紅、不送；4 個、64 個 —— 都要送得出（以 code point 計）
    await type(passwordField(), '😀'.repeat(3))
    await submitForm()
    expect(formTeamCalls(), '3 個 emoji（6 個 code unit）被當成夠長送出了').toHaveLength(0)
    expect(passwordField().getAttribute('aria-invalid')).toBe('true')
    server.replyFor(`/api/projects/${P.id}/form-team`, 500, { detail: '壞了' })
    await type(passwordField(), '😀'.repeat(4))
    await submitForm()
    await waitFor(() => expect(formTeamCalls()).toHaveLength(1))
    server.replyFor(`/api/projects/${P.id}/form-team`, 500, { detail: '壞了' })
    await type(passwordField(), '😀'.repeat(64))
    expect(passwordField().getAttribute('aria-invalid'), '64 個 emoji 被當成 128 個字').not.toBe('true')
    await submitForm()
    await waitFor(() => expect(formTeamCalls()).toHaveLength(2))
  })

  it('[FE-J04-S03] 成功：payload 恰好 {password} 不 trim、詳情變已成軍、不重打詳情、列表回第 0 頁重取一次、refresh 恰好一次、表單收起、詳情仍開著', async () => {
    await mountDetail(P, { page: 1 })
    const detailGetsBefore = server.calls.filter((c) => c.pathname === `/api/projects/${P.id}`).length
    const listBefore = listGets().length
    server.replyFor(`/api/projects/${P.id}/form-team`, 200, { ...P, status: 'active', room_template: 0 })
    server.replyFor('/api/projects', 200, [])
    await openFormAndFill(' abc 123 ')
    await submitForm()
    await waitFor(() => expect(status()).toBe('已成軍'))
    expect(formTeamCalls()[0]?.body).toEqual({ password: ' abc 123 ' })
    expect(detail().dataset.phase).toBe('ready')
    expect(detail().dataset.projectId).toBe(P.id)
    expect(server.calls.filter((c) => c.pathname === `/api/projects/${P.id}`).length, '成功後重打了詳情').toBe(detailGetsBefore)
    expect(screen.queryByTestId('form-team-form')).toBeNull()
    expect(queryBtn(/結案/)).not.toBeNull()
    expect(queryBtn(/成軍/)).toBeNull()
    await waitFor(() => expect(listGets().length).toBe(listBefore + 1))
    expect(listGets().at(-1), '列表沒有回第 0 頁').toBe('?page=0')
    expect(refreshRooms, '門沒有立即重取').toHaveBeenCalledTimes(1)
  })

  it('[FE-J04-S03] 列表重取 500、refresh 拋錯：詳情仍已成軍、密碼仍在、表單不在；列表是失敗狀態；refresh 仍被呼叫過', async () => {
    refreshRooms.mockImplementation(() => {
      throw new Error('走廊壞了')
    })
    await mountDetail(P)
    server.replyFor(`/api/projects/${P.id}/form-team`, 200, { ...P, status: 'active', room_template: 0 })
    server.replyFor('/api/projects', 500, { detail: '壞了' })
    await openFormAndFill('demo-1234')
    await submitForm()
    await waitFor(() => expect(status()).toBe('已成軍'))
    expect(screen.queryByTestId('form-team-form')).toBeNull()
    await waitFor(() => expect(within(screen.getByTestId('list-panel')).getByTestId('empty-state').dataset.emptyState).toBe('load-failed'))
    expect(refreshRooms).toHaveBeenCalledTimes(1)
    expect(status(), '列表失敗把詳情回滾了').toBe('已成軍')
  })

  it('[FE-J04-S04] 500 留密碼、狀態不變、不重取、不 refresh；403 是權限語彙；送出中連按一次、關不掉', async () => {
    await mountDetail(P)
    const listBefore = listGets().length
    server.replyFor(`/api/projects/${P.id}/form-team`, 500, { detail: '壞了' })
    await openFormAndFill('demo-1234')
    await submitForm()
    await waitFor(() => expect(within(detail()).getAllByRole('alert')).toHaveLength(1))
    expect(within(detail()).getByRole('alert').textContent).toContain(VOCABULARY['server-error'])
    expect(passwordField().value, '失敗時密碼被清了').toBe('demo-1234')
    expect(status()).toBe('招募中')
    expect(listGets().length).toBe(listBefore)
    expect(refreshRooms).not.toHaveBeenCalled()

    server.replyFor(`/api/projects/${P.id}/form-team`, 403, { detail: '只有發起人可以做這件事' })
    await submitForm()
    await waitFor(() => expect(within(detail()).getByRole('alert').textContent).toContain(VOCABULARY['permission-denied']))
    expect(within(detail()).getByRole('alert').textContent).not.toContain('只有發起人可以做這件事')

    // 壓著不回：連按兩次只送一次；返回、Escape、面板關閉都被擋 —— **送出的同一個 tick 內**就按返回（不等任何更新；effect 通知會有一格空窗，審查抓到）
    const held = gate()
    server.replyFor(`/api/projects/${P.id}/form-team`, 200, { ...P, status: 'active' }, { after: held.promise })
    ;(screen.getByTestId('form-team-form') as HTMLFormElement).requestSubmit()
    fireEvent.click(within(detail()).getByRole('button', { name: '返回' }))
    expect(screen.queryByTestId('project-detail'), '送出的同一個 tick 內按返回把詳情關掉了').not.toBeNull()
    await submitForm()
    await waitFor(() => expect(formTeamCalls()).toHaveLength(3))
    fireEvent.click(within(detail()).getByRole('button', { name: '返回' }))
    escape()
    fireEvent.click(within(screen.getByTestId('list-panel')).getByRole('button', { name: '關閉' }))
    expect(screen.queryByTestId('project-detail'), '送出中被關掉了').not.toBeNull()
    expect(screen.queryByTestId('list-panel')).not.toBeNull()
    held.release()
    await waitFor(() => expect(status()).toBe('已成軍'))
  })
})

describe('結案要確認；成功後沒有動作', () => {
  const A = project(5, { status: 'active' })
  it('[FE-J04-S07] 取消／Escape 不送、焦點回結案；送出中連按一次且關不掉；成功後沒有按鈕、refresh 一次、不重取列表；500／403 留著', async () => {
    await mountDetail(A)
    const listBefore = listGets().length
    click(btn('結案'))
    const dialog = screen.getByRole('alertdialog')
    expect(document.activeElement, '焦點要在安全的「取消」上，不是「確定結案」').toBe(within(dialog).getByRole('button', { name: '取消' }))
    click(within(dialog).getByRole('button', { name: '取消' }))
    expect(closeCalls(A.id)).toHaveLength(0)
    await waitFor(() => expect(document.activeElement).toBe(btn('結案')))
    click(btn('結案'))
    escape()
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(closeCalls(A.id)).toHaveLength(0)
    expect(queryBtn('結案')).not.toBeNull()

    // 壓著不回：連按確定兩次、Escape、返回 —— 只送一個，確認層與詳情都還在
    const held = gate()
    server.replyFor(`/api/projects/${A.id}/close`, 200, { ...A, status: 'closed' }, { after: held.promise })
    click(btn('結案'))
    // 同一個 tick：確定 → 立刻按返回（不等更新）
    within(screen.getByRole('alertdialog')).getByRole('button', { name: '確定結案' }).dispatchEvent(new MouseEvent('click', { bubbles: true }))
    within(detail()).getByRole('button', { name: '返回' }).dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(screen.queryByTestId('project-detail'), '結案送出的同一個 tick 內按返回把詳情關掉了').not.toBeNull()
    click(within(screen.getByRole('alertdialog')).getByRole('button', { name: '確定結案' }))
    escape()
    fireEvent.click(within(detail()).getByRole('button', { name: '返回' }))
    await waitFor(() => expect(closeCalls(A.id)).toHaveLength(1))
    expect(screen.queryByRole('alertdialog')).not.toBeNull()
    expect(screen.queryByTestId('project-detail')).not.toBeNull()
    held.release()
    await waitFor(() => expect(status()).toBe('已結案'))
    expect(within(actions()!).queryAllByRole('button')).toEqual([])
    expect(refreshRooms).toHaveBeenCalledTimes(1)
    // 重取是 effect 裡的非同步請求：等一拍再數，才抓得到「結案也 reload」的實作
    await new Promise((r) => setTimeout(r, 50))
    expect(listGets().length, '結案不該重取列表').toBe(listBefore)
    expect(closeCalls(A.id)[0]?.body ?? null, 'close 沒有 body').toBeNull()
  })

  it('[FE-J04-S07] 500 與 403：alert 各自的語彙、狀態仍已成軍、結案可再按、不 refresh', async () => {
    await mountDetail(A)
    server.replyFor(`/api/projects/${A.id}/close`, 500, { detail: '壞了' })
    click(btn('結案'))
    click(within(screen.getByRole('alertdialog')).getByRole('button', { name: '確定結案' }))
    await waitFor(() => expect(within(screen.getByRole('alertdialog')).getByRole('alert').textContent).toContain(VOCABULARY['server-error']))
    expect(status()).toBe('已成軍')
    server.replyFor(`/api/projects/${A.id}/close`, 403, { detail: '只有發起人可以做這件事' })
    click(within(screen.getByRole('alertdialog')).getByRole('button', { name: '確定結案' }))
    await waitFor(() => expect(within(screen.getByRole('alertdialog')).getByRole('alert').textContent).toContain(VOCABULARY['permission-denied']))
    expect(status()).toBe('已成軍')
    expect(refreshRooms).not.toHaveBeenCalled()
    click(within(screen.getByRole('alertdialog')).getByRole('button', { name: '取消' }))
    expect(queryBtn('結案')).not.toBeNull()
  })
})
