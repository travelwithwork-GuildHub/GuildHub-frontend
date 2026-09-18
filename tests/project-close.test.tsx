import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { VOCABULARY } from '@/errors/uiError'
import { startContractServer, type ContractServer } from './support/contract-server'
import { actions, btn, click, detail, escape, gate, listGets, mountDetail, project, queryBtn, refreshRooms, status } from './support/project-lifecycle'

// 規格：openspec/changes/fe-j04-form-team/specs/project-lifecycle/spec.md ——〈結案要確認；成功後沒有動作，門消失〉S07
// （`S01` 的 active 半邊「有結案沒成軍」在 project-lifecycle.test.tsx）。樹與手勢在 `tests/support/project-lifecycle.tsx`。
//
// ⚠️ 「同一個 tick 內按返回」不包 `act`、不等任何更新 —— 用 effect 通知 busy 的實作會有一格空窗，只有這樣按才抓得到（`S04` 同一招，審查抓到的）。

const A = project(5, { status: 'active' })
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
const closeCalls = () => server.calls.filter((c) => c.method === 'POST' && c.pathname === `/api/projects/${A.id}/close`)
const dialog = () => screen.getByRole('alertdialog')
const confirmBtn = () => within(dialog()).getByRole('button', { name: '確定結案' })
const cancelBtn = () => within(dialog()).getByRole('button', { name: '取消' })

describe('結案要確認；成功後沒有動作', () => {
  it('[FE-J04-S07] 取消／Escape 不送、焦點回結案；送出中連按一次且關不掉；成功後沒有按鈕、refresh 一次、不重取列表', async () => {
    await mountDetail(server, A)
    const listBefore = listGets(server).length
    click(btn('結案'))
    expect(document.activeElement, '焦點要在安全的「取消」上，不是「確定結案」').toBe(cancelBtn())
    click(cancelBtn())
    expect(closeCalls()).toHaveLength(0)
    expect(screen.queryByRole('alertdialog')).toBeNull()
    await waitFor(() => expect(document.activeElement).toBe(btn('結案')))
    click(btn('結案'))
    escape()
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(closeCalls()).toHaveLength(0)
    await waitFor(() => expect(document.activeElement).toBe(btn('結案')))
    expect(screen.queryByTestId('project-detail'), 'Escape 把詳情關掉了（該只關確認層）').not.toBeNull()

    // 壓著不回：確定 → **同一個 tick** 再按確定、按返回（不等更新）；再等一拍後 Escape、返回、關閉面板 —— 只送一個，確認層與詳情都還在
    const held = gate()
    server.replyFor(`/api/projects/${A.id}/close`, 200, { ...A, status: 'closed' }, { after: held.promise })
    click(btn('結案'))
    confirmBtn().dispatchEvent(new MouseEvent('click', { bubbles: true }))
    confirmBtn().dispatchEvent(new MouseEvent('click', { bubbles: true }))
    screen.getByRole('button', { name: '返回' }).dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(screen.queryByTestId('project-detail'), '結案送出的同一個 tick 內按返回把詳情關掉了').not.toBeNull()
    await waitFor(() => expect(closeCalls()).toHaveLength(1))
    click(confirmBtn())
    escape()
    fireEvent.click(screen.getByRole('button', { name: '返回' }))
    fireEvent.click(within(screen.getByTestId('list-panel')).getByRole('button', { name: '關閉' }))
    expect(screen.queryByRole('alertdialog'), '送出中 Escape 把確認層關掉了').not.toBeNull()
    expect(screen.queryByTestId('project-detail'), '送出中被關掉了').not.toBeNull()
    expect(screen.queryByTestId('list-panel')).not.toBeNull()
    expect(closeCalls()).toHaveLength(1)
    expect(closeCalls()[0]?.body ?? null, 'close 沒有 body').toBeNull()
    held.release()
    await waitFor(() => expect(status()).toBe('已結案'))
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(within(actions()!).queryAllByRole('button')).toEqual([])
    expect(refreshRooms, '門沒有立即重取').toHaveBeenCalledTimes(1)
    // 重取是 effect 裡的非同步請求：等一拍再數，才抓得到「結案也 reload」的實作
    await new Promise((r) => setTimeout(r, 50))
    expect(listGets(server).length, '結案不該重取列表').toBe(listBefore)
    expect(detail().dataset.phase, '成功後重打了詳情').toBe('ready')
  })

  it('[FE-J04-S07] 500 與 403：alert 各自的語彙、狀態仍已成軍、結案可再按、不 refresh', async () => {
    await mountDetail(server, A)
    server.replyFor(`/api/projects/${A.id}/close`, 500, { detail: '壞了' })
    click(btn('結案'))
    click(confirmBtn())
    await waitFor(() => expect(within(dialog()).getByRole('alert').textContent).toContain(VOCABULARY['server-error']))
    expect(status()).toBe('已成軍')
    server.replyFor(`/api/projects/${A.id}/close`, 403, { detail: '只有發起人可以做這件事' })
    click(confirmBtn())
    await waitFor(() => expect(within(dialog()).getByRole('alert').textContent).toContain(VOCABULARY['permission-denied']))
    expect(within(dialog()).getByRole('alert').textContent).not.toContain('只有發起人可以做這件事')
    expect(closeCalls()).toHaveLength(2)
    expect(status()).toBe('已成軍')
    expect(refreshRooms).not.toHaveBeenCalled()
    click(cancelBtn())
    expect(queryBtn('結案')).not.toBeNull()
  })
})
