import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LIMITS } from '@/api/contract/limits'
import type { Identity } from '@/identity/types'
import { StatusProvider } from '@/realtime/StatusProvider'
import { createStatusStore, type StatusStore } from '@/realtime/statusStore'
import { StatusHud, STATUS_HUD_LABELS } from '@/status/StatusHud'
import { QUICK_STATUSES } from '@/status/quickStatuses'
import { InteractionProvider, useInputLockRef } from '@/world/interaction/InteractionProvider'
import { EditableFocusLock } from '@/world/interaction/EditableFocusLock'

// 規格：openspec/changes/fe-k05-status/specs/player-status/spec.md
//   Requirement: 已登入的人可以設定、換掉、清除一句最多 12 字的狀態 —— S01（快捷、送出中、回聲後目前狀態）、S02（剩餘字數、超過停用、清除）、S03（沒 ready 的回饋、訪客沒有控制）的畫面半邊
//
// store 是真的（`createStatusStore`，用 `StatusProvider` 的 `store` prop 注入）、`send` 是替身；身分用 `useIdentity` 的替身。不連任何外部服務。

const identity = vi.hoisted(() => ({ current: { state: 'unknown' } as Identity }))
vi.mock('@/identity/IdentityProvider', () => ({ useIdentity: () => identity.current, useAdoptIdentity: () => vi.fn() }))
const store = { current: null as StatusStore | null }

const ME: Identity = { state: 'signed-in', profile: { id: 'a0000000-0000-4000-8000-000000000001', display_name: '我', avatar_id: 0, skills: [], hours_per_week: null, bio: null, updated_at: '2026-09-01T00:00:00Z' } }
const TWELVE = '一二三四五六七八九十壹貳'

function LockProbe({ sink }: { sink: { current: boolean } }) {
  const lock = useInputLockRef()
  sink.current = lock.current
  return null
}
/** 掛 HUD（在 InteractionProvider 底下，帶 EditableFocusLock —— 焦點鎖的判準要真的那把鎖）。回一個「讀鎖」的函式。 */
function mount() {
  const sink = { current: false }
  const tree = () => (
    <InteractionProvider>
      <StatusProvider store={store.current!}>
        <EditableFocusLock />
        <LockProbe sink={sink} />
        <div data-focus-anchor="world" tabIndex={-1} data-testid="world-anchor" />
        <StatusHud />
      </StatusProvider>
    </InteractionProvider>
  )
  const view = render(tree())
  return { view, rerender: () => view.rerender(tree()), locked: () => sink.current }
}
const open = () => fireEvent.click(screen.getByRole('button', { name: /設定狀態|狀態：/ }))
const input = () => screen.getByLabelText(STATUS_HUD_LABELS.field) as HTMLInputElement
const submit = () => screen.getByRole('button', { name: STATUS_HUD_LABELS.submit }) as HTMLButtonElement
const chip = (text: string) => screen.getByRole('button', { name: text })

beforeEach(() => {
  vi.useFakeTimers()
  identity.current = ME
  store.current = createStatusStore()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('設定狀態的控制', () => {
  it('[FE-K05-S01] 快捷狀態：連線上恰好一則、payload 對；送出中控制不畫成已生效；回聲後目前狀態是那一句', () => {
    const send = vi.fn()
    const link = store.current!.port.attach(send)
    mount()
    expect(screen.getByRole('button', { name: STATUS_HUD_LABELS.toggleEmpty })).toBeTruthy()
    open()
    for (const q of QUICK_STATUSES) expect(chip(q)).toBeTruthy()
    fireEvent.click(chip('趕工中'))
    expect(send).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenCalledWith({ t: 'status', text: '趕工中' })
    const hud = screen.getByTestId('status-hud')
    expect(hud.dataset.current, '回聲前不能畫成已生效').toBe('')
    expect(hud.dataset.pending).toBe('趕工中')
    act(() => link.confirm('趕工中'))
    expect(screen.getByTestId('status-hud').dataset.current).toBe('趕工中')
    expect(screen.getByTestId('status-hud').dataset.pending).toBeUndefined()
    expect(screen.getByRole('button', { name: `${STATUS_HUD_LABELS.togglePrefix}趕工中` })).toBeTruthy()
  })

  it('[FE-K05-S02] 自由輸入：12 字剩 0 可送、13 字停用且看得到超過、不多送；清除送空字串、回聲後沒有狀態', () => {
    const send = vi.fn()
    const link = store.current!.port.attach(send)
    mount()
    open()
    fireEvent.change(input(), { target: { value: TWELVE } })
    expect(screen.getByTestId('status-remaining').textContent).toContain('0')
    expect(submit().disabled).toBe(false)
    fireEvent.click(submit())
    expect(send).toHaveBeenLastCalledWith({ t: 'status', text: TWELVE })
    act(() => link.confirm(TWELVE))
    fireEvent.change(input(), { target: { value: `${TWELVE}多` } })
    expect(submit().disabled, '超過上限送出要停用').toBe(true)
    expect(screen.getByTestId('status-remaining').textContent).toMatch(new RegExp(STATUS_HUD_LABELS.over(1)))
    expect(input().getAttribute('aria-invalid')).toBe('true')
    fireEvent.submit(submit().closest('form')!)
    expect(send, '超長不能送').toHaveBeenCalledTimes(1)
    expect(LIMITS.statusText.max).toBe(12)
    fireEvent.click(screen.getByRole('button', { name: STATUS_HUD_LABELS.clear }))
    expect(send).toHaveBeenLastCalledWith({ t: 'status', text: '' })
    act(() => link.confirm(''))
    expect(screen.getByTestId('status-hud').dataset.current).toBe('')
    expect(screen.queryByRole('button', { name: STATUS_HUD_LABELS.clear }), '沒有狀態就沒有清除').toBeNull()
  })

  it('[FE-K05-S03] 沒有連線：不送、一則 role=status 的回饋（不提密碼／權限）、4 秒後消失、之後還能送；訪客／unknown 沒有控制', () => {
    const { rerender } = mount()
    open()
    fireEvent.click(chip('趕工中'))
    const fb = screen.getByTestId('status-feedback')
    expect(fb.getAttribute('role')).toBe('status')
    expect(fb.textContent).toBe(STATUS_HUD_LABELS.offline)
    expect(fb.textContent).not.toMatch(/密碼|權限/)
    act(() => {
      vi.advanceTimersByTime(4_100)
    })
    expect(screen.queryByTestId('status-feedback')).toBeNull()
    const send = vi.fn()
    store.current!.port.attach(send)
    fireEvent.click(chip('趕工中'))
    expect(send).toHaveBeenCalledWith({ t: 'status', text: '趕工中' })

    for (const state of [{ state: 'guest', reason: 'no-session' } as Identity, { state: 'unknown' } as Identity]) {
      identity.current = state
      rerender()
      expect(screen.queryByTestId('status-hud'), `${state.state} 不該有控制`).toBeNull()
      expect(screen.queryByRole('button', { name: /設定狀態|狀態：/ })).toBeNull()
    }
  })

  it('[FE-K05-S01] 輸入框有焦點時世界鍵盤鎖住；Escape 放掉焦點回世界錨、鎖釋放', async () => {
    store.current!.port.attach(vi.fn())
    const { locked } = mount()
    open()
    await act(async () => {
      input().focus()
      await Promise.resolve()
      vi.runAllTimers()
    })
    expect(document.activeElement).toBe(input())
    expect(locked(), '輸入框有焦點要鎖世界').toBe(true)
    await act(async () => {
      fireEvent.keyDown(input(), { key: 'Escape' })
      await Promise.resolve()
      vi.runAllTimers()
    })
    expect(document.activeElement).toBe(screen.getByTestId('world-anchor'))
    expect(locked()).toBe(false)
  })
})
