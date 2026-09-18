import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { act } from 'react'
import { VOCABULARY } from '@/errors/uiError'
import { FORM_LIMITS } from '@/forms/limits'
import { startContractServer, type ContractServer } from './support/contract-server'
import { OTHER, actions, btn, click, detail, escape, gate, listGets as listGetsOn, mountDetail as mount, project, queryBtn, refreshRooms, status, type } from './support/project-lifecycle'

// 規格：openspec/changes/fe-j04-form-team/specs/project-lifecycle/spec.md —— S01～S04（S07 結案在 project-close.test.tsx；S05／S06／S08 密碼的一次性呈現在 project-password-reveal.test.tsx）
// 樹與手勢在 `tests/support/project-lifecycle.tsx`（真的 providers、真的 `BoardPanel`，資料走真的 `src/api/` 到本機自起的 contract-server）。

const P = project(1)

let server: ContractServer
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
const mountDetail = (p: Parameters<typeof mount>[1], opts?: Parameters<typeof mount>[2]) => mount(server, p, opts)
const listGets = () => listGetsOn(server)
const submitForm = () =>
  act(async () => {
    ;(screen.getByTestId('form-team-form') as HTMLFormElement).requestSubmit()
  })
const passwordField = () => within(detail()).getByLabelText('房間密碼') as HTMLInputElement
const formTeamCalls = (id = P.id) => server.calls.filter((c) => c.method === 'POST' && c.pathname === `/api/projects/${id}/form-team`)
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
    expect(queryBtn(/成軍/)).toBeNull()
    expect(queryBtn(/結案/)).not.toBeNull()
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
