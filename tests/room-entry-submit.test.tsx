import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useEffect, useLayoutEffect, useState, type Context, type ReactNode, type RefObject } from 'react'
import { flushSync } from 'react-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ContractDriftError, HttpError, NetworkError } from '@/api/transport'
import { VOCABULARY } from '@/errors/uiError'
import type { Identity } from '@/identity/types'
import { InteractionProvider, useInteraction } from '@/world/interaction/InteractionProvider'
import { escapeLayerCount } from '@/world/interaction/escapeLayers'
import { useIdentity } from '@/identity/IdentityProvider'
import { useRequestEntry } from '@/world/scenes/EntryGate'
import { RoomEntryGateProvider } from '@/world/scenes/RoomEntryGate'
import { ROOM_ENTRY_LABELS, RoomPasswordDialog } from '@/world/scenes/RoomPasswordDialog'
import { __resetRoomTokenMemory, heldRoomToken } from '@/world/scenes/roomTokens'
import { SceneProvider } from '@/world/scenes/SceneProvider'

// 規格：openspec/changes/fe-n08-room-entry-gate/specs/room-entry-gate/spec.md
//   Requirement: 送出走既有 operation 與表單慣例 —— S04
//   Requirement: 成功先持有票再進房（票以記憶體為主，storage 寫入失敗仍進得去）—— S06（順序）、S17（storage 失敗照進／空 token 才擋）、S15
//   （`fe-n08-room-ticket-in-memory` 反轉：舊 S14「存不進就失敗」退役，反轉行為改 S17）
//   Requirement: 失敗回饋可恢復、不猜原因、不回顯後端字串 —— S08、S09、S10
//
// 接法同 `room-entry-modal.test.tsx`。`enterProject` 是假的（每次由測試決定何時、回什麼）；`enterRoom` 與 `holdRoomToken` 包一層記錄呼叫順序、
// 底下仍是正式碼；`sessionStorage` 是 jsdom 真的（S14 用 `Storage.prototype` 讓它壞）。
// 身分走一個測試用的 context（`useState` ＋ 外部 store 通知）：換身分是**非事件的 setState**（DefaultLane），跟正式 `IdentityProvider`
// 在 fetch 回來時 `adopt` 一樣 —— passive effect 會延到下一個 task；`useSyncExternalStore` 那種 SyncLane 會把 passive 同步 flush，測不到那個縫。

const enterProject = vi.hoisted(() => vi.fn())
vi.mock('@/api/operations', () => ({ enterProject }))
const calls = vi.hoisted(() => [] as string[])
const identity = vi.hoisted(() => {
  let current = { state: 'unknown' } as Identity
  const subs = new Set<() => void>()
  return {
    get: () => current,
    set: (next: Identity) => {
      current = next
      subs.forEach((f) => f())
    },
    subscribe: (f: () => void) => {
      subs.add(f)
      return () => {
        subs.delete(f)
      }
    },
  }
})
const holder = vi.hoisted(() => ({ ctx: null as unknown as Context<Identity> }))
vi.mock('@/identity/IdentityProvider', async () => {
  const { createContext, useContext } = await import('react')
  holder.ctx = createContext<Identity>({ state: 'unknown' })
  return { useIdentity: () => useContext(holder.ctx), useAdoptIdentity: () => vi.fn() }
})
function TestIdentity({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState(identity.get)
  useEffect(() => identity.subscribe(() => setCurrent(identity.get())), [])
  return <holder.ctx.Provider value={current}>{children}</holder.ctx.Provider>
}
/** 排在視窗**之後**的 layout effect：身分 commit 的那一刻要做的事（S15 的「同一個 commit」那條）。 */
const onIdentityCommit: { current: ((who: Identity) => void) | null } = { current: null }
function CommitProbe() {
  const who = useIdentity()
  useLayoutEffect(() => {
    onIdentityCommit.current?.(who)
  }, [who])
  return null
}
vi.mock('@/world/scenes/roomTokens', async (importOriginal) => {
  const orig = await importOriginal<typeof import('@/world/scenes/roomTokens')>()
  return { ...orig, holdRoomToken: (...a: Parameters<typeof orig.holdRoomToken>) => (calls.push(`hold:${a[2]}`), orig.holdRoomToken(...a)) }
})
vi.mock('@/world/scenes/SceneProvider', async (importOriginal) => {
  const orig = await importOriginal<typeof import('@/world/scenes/SceneProvider')>()
  const useScene = () => {
    const scene = orig.useScene()
    return { ...scene, enterRoom: (...a: Parameters<typeof scene.enterRoom>) => (calls.push(`enter:${a[0]}`), scene.enterRoom(...a)) }
  }
  return { ...orig, useScene }
})

const A = { projectId: 'a0000000-0000-4000-8000-00000000000a', title: '晨光工作室' }
const B = { projectId: 'b0000000-0000-4000-8000-00000000000b', title: '噪音地圖小隊' }
const profile = (id: string) => ({ id, display_name: id, avatar_id: 0, skills: [], hours_per_week: null, bio: null, updated_at: '2026-09-14T00:00:00Z' })
const P: Identity = { state: 'signed-in', profile: profile('p0000000-0000-4000-8000-00000000000p') }
const Q: Identity = { state: 'signed-in', profile: profile('q0000000-0000-4000-8000-00000000000q') }
const idOf = (who: Identity) => (who.state === 'signed-in' ? who.profile.id : '?')
const keyOf = (who: Identity, room: { projectId: string }) => `guildhub.roomToken.${idOf(who)}.${room.projectId}`

type Grabbed = { lock: RefObject<boolean>; requestEntry: (projectId: string, title: string) => void }
function Grab({ sinkRef }: { sinkRef: RefObject<Grabbed | null> }) {
  const { inputLockRef } = useInteraction()
  const requestEntry = useRequestEntry()
  useEffect(() => {
    sinkRef.current = { lock: inputLockRef, requestEntry }
  }, [sinkRef, inputLockRef, requestEntry])
  return null
}
function mountWorld() {
  const sinkRef: RefObject<Grabbed | null> = { current: null }
  render(
    <TestIdentity>
      <SceneProvider>
        <RoomEntryGateProvider>
          <InteractionProvider>
            <Grab sinkRef={sinkRef} />
            <div data-testid="world-canvas-container" data-focus-anchor="world" tabIndex={-1}>
              <RoomPasswordDialog />
            </div>
            <CommitProbe />
          </InteractionProvider>
        </RoomEntryGateProvider>
      </SceneProvider>
    </TestIdentity>,
  )
  const world = () => sinkRef.current as Grabbed
  const pressE = (room = A) => act(() => world().requestEntry(room.projectId, room.title))
  return { world, pressE }
}
/** 一個由測試決定何時、怎麼結束的 `/enter`。 */
function pending() {
  let settle!: { ok: (token: string) => Promise<void>; okNow: (token: string) => void; fail: (cause: unknown) => Promise<void> }
  enterProject.mockImplementationOnce(
    () =>
      new Promise((resolve, reject) => {
        settle = {
          ok: (room_token) => act(async () => resolve({ room_token })),
          okNow: (room_token) => resolve({ room_token }),
          fail: (cause) => act(async () => reject(cause)),
        }
      }),
  )
  return () => settle
}
const dialogs = () => screen.queryAllByRole('dialog')
const field = () => screen.getByLabelText(ROOM_ENTRY_LABELS.password) as HTMLInputElement
const submitButton = () => screen.getByRole('button', { name: ROOM_ENTRY_LABELS.submit }) as HTMLButtonElement
const type = (value: string) => fireEvent.change(field(), { target: { value } })
const submit = () => act(async () => void fireEvent.click(submitButton()))
const escape = () => act(() => void window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' })))
const alerts = () => screen.queryAllByRole('alert')
const alertText = () => screen.getByRole('alert').textContent ?? ''
const http = (status: number, detail: string | null = null) => new HttpError('enterProject', status, detail)
const expectNothingHappened = () => {
  expect(calls, '存票／進房不該發生').toEqual([])
  expect(window.sessionStorage.length).toBe(0)
}
const identityChange = (next: Identity) => act(() => identity.set(next))

beforeEach(() => {
  window.sessionStorage.clear()
  __resetRoomTokenMemory() // 記憶體是模組級的，跨測試要清；不清的話前一條的票會漏到下一條
  calls.length = 0
  identity.set(P)
  window.history.replaceState(null, '', '/world')
})
afterEach(() => {
  cleanup()
  onIdentityCommit.current = null
  vi.restoreAllMocks()
  vi.useRealTimers()
  expect(escapeLayerCount(), 'Escape 層沒清乾淨').toBe(0)
  enterProject.mockReset()
})

describe('送出', () => {
  it('[FE-N08-S04] 送出中連按只送一次、送出控制 disabled；送出中 Esc 關得掉、晚到的 200 被丟棄；空字串照送', async () => {
    vi.useFakeTimers()
    const { world, pressE } = mountWorld()
    pressE()
    const p = pending()
    type('abc')
    await submit()
    expect(enterProject).toHaveBeenCalledWith(A.projectId, { password: 'abc' })
    expect(submitButton().disabled, '送出中送出控制要 disabled').toBe(true)
    await submit()
    await act(async () => void fireEvent.submit(field().form as HTMLFormElement))
    await act(() => vi.runAllTimersAsync())
    expect(enterProject, '送出中的第二次送出／Enter 不能再送').toHaveBeenCalledTimes(1)
    escape()
    expect(dialogs()).toHaveLength(0)
    expect(document.activeElement).toBe(screen.getByTestId('world-canvas-container'))
    expect(world().lock.current, '關閉要放鎖').toBe(false)
    await p().ok('T')
    await act(() => vi.runAllTimersAsync())
    expectNothingHappened()
    expect(dialogs(), '晚到的成功不得重開視窗').toHaveLength(0)
    expect(alerts()).toHaveLength(0)
    pressE()
    expect(field().value).toBe('')
    enterProject.mockRejectedValueOnce(http(403, '房間密碼錯誤'))
    await submit()
    expect(enterProject).toHaveBeenLastCalledWith(A.projectId, { password: '' })
  })

  it('[FE-N08-S06] 密碼對了：holdRoomToken 在 enterRoom 之前；heldRoomToken 回 T；視窗關閉', async () => {
    const { pressE } = mountWorld()
    pressE()
    enterProject.mockResolvedValueOnce({ room_token: 'T' })
    type('guild1234')
    await submit()
    await waitFor(() => expect(dialogs()).toHaveLength(0))
    expect(calls, '先存票、再進房，各一次').toEqual(['hold:T', `enter:${A.projectId}`])
    expect(heldRoomToken(idOf(P), A.projectId), '票的權威在記憶體').toBe('T')
    expect(window.location.href).not.toContain('T=')
    expect(document.activeElement).toBe(screen.getByTestId('world-canvas-container'))
  })

  // 反轉（`fe-n08-room-ticket-in-memory`）：`sessionStorage` 存不進**不再**擋在門口 ——
  // 記憶體帶著這一次的票 T 照樣進房。只有空的 `room_token` 才失敗（下一條）。
  it.each<[string, () => void, string | null]>([
    ['setItem 拋', () => void vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('QuotaExceededError') }), null],
    ['setItem 靜默沒寫、getItem 回 null', () => void vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {}), null],
    ['舊票 OLD 殘留、setItem 失敗（storage 仍是 OLD）', () => void vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {}), 'OLD'],
    ['getItem 拋', () => void vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('SecurityError') }), null],
  ])('[FE-N08-S17] %s：storage 存不進也照樣進房（記憶體帶票）、無 alert、票不進網址', async (_name, sabotage, old) => {
    const { pressE } = mountWorld()
    pressE()
    if (old !== null) window.sessionStorage.setItem(keyOf(P, A), old)
    sabotage()
    enterProject.mockResolvedValueOnce({ room_token: 'T' })
    type('guild1234')
    await submit()
    // 進房了：視窗關閉、先存票再進房各一次
    await waitFor(() => expect(dialogs()).toHaveLength(0))
    expect(calls, '先存票、再進房，各一次').toEqual(['hold:T', `enter:${A.projectId}`])
    // 沒有 alert —— storage 失敗不再是失敗
    expect(alerts()).toHaveLength(0)
    // 記憶體帶著這一次的票 T（就算 storage 殘留 OLD，讀回的也是 T，不是 OLD）
    vi.restoreAllMocks()
    const pid = P.state === 'signed-in' ? P.profile.id : ''
    expect(heldRoomToken(pid, A.projectId), 'storage 存不進，票仍在記憶體且是這一次的 T').toBe('T')
    // 票不進網址
    expect(window.location.href).not.toContain('T=')
  })

  it('[FE-N08-S17] room_token 是空字串：視同失敗、不把空字串存成票', async () => {
    const { pressE } = mountWorld()
    pressE()
    enterProject.mockResolvedValueOnce({ room_token: '' })
    await submit()
    await waitFor(() => expect(alerts()).toHaveLength(1))
    expectNothingHappened()
    expect(dialogs()).toHaveLength(1)
    expect(alertText()).not.toContain('密碼')
  })

  it('[FE-N08-S15] 關閉、換房、重開同一間房、換身分、登出：晚到的結果作廢；換代號時舊輪立刻交出 busy', async () => {
    const { pressE } = mountWorld()
    pressE(A)
    const pa = pending()
    await submit()
    escape()
    pressE(B)
    await pa().ok('TA')
    expectNothingHappened()
    expect(dialogs()).toHaveLength(1)
    expect(field().value).toBe('')
    expect(alerts()).toHaveLength(0)
    // 關了重開同一間房：現在「開著、同房、同人」，舊回應仍不採用（要比代號）。
    const pb0 = pending()
    await submit()
    escape()
    pressE(B)
    await pb0().ok('TB0')
    expectNothingHappened()
    expect(dialogs()).toHaveLength(1)
    expect(field().value).toBe('')
    expect(alerts()).toHaveLength(0)
    // P 送出中身分變成 Q：視窗不關、欄位不變、busy 立刻解除。
    const pb = pending()
    type('x')
    await submit()
    expect(submitButton().disabled).toBe(true)
    identityChange(Q)
    await waitFor(() => expect(submitButton().disabled, '換代號那一刻舊輪要交出 busy').toBe(false))
    expect(dialogs()).toHaveLength(1)
    expect(field().value).toBe('x')
    // Q 立刻送出；P 的舊回應晚到：不存、不進、不顯示、也不動 Q 的 busy。
    const pq = pending()
    await submit()
    expect(submitButton().disabled).toBe(true)
    await pb().ok('TB')
    expect(heldRoomToken(idOf(P), B.projectId), 'P＋B 不採用').toBeNull()
    expect(heldRoomToken(idOf(Q), B.projectId), 'Q＋B 不採用').toBeNull()
    expect(calls).toEqual([])
    expect(alerts()).toHaveLength(0)
    expect(dialogs()).toHaveLength(1)
    expect(submitButton().disabled, 'Q 那一輪還在等，busy 不能被 P 的舊回應解除').toBe(true)
    await pq().fail(http(403, '房間密碼錯誤'))
    await waitFor(() => expect(alerts(), 'Q 那一輪的結果要被採用').toHaveLength(1))
    // P → Q → P：代號換過了。
    identityChange(P)
    const pb1 = pending()
    await submit()
    identityChange(Q)
    identityChange(P)
    await pb1().ok('TB1')
    expect(calls).toEqual([])
    expect(window.sessionStorage.length).toBe(0)
    // Q 送出中登出成訪客。
    identityChange(Q)
    const pb2 = pending()
    await submit()
    identityChange({ state: 'guest', reason: 'no-session' })
    await pb2().ok('TB2')
    expect(calls).toEqual([])
    expect(window.sessionStorage.length).toBe(0)
    expect(dialogs()).toHaveLength(1)
  })

  it('[FE-N08-S15] 回應在「身分已 commit 成 Q、passive effect 還沒 flush」的縫裡落地：仍作廢（換代號要跟 commit 同步）', async () => {
    const { pressE } = mountWorld()
    pressE(B)
    const pb = pending()
    await submit()
    // 不用 act：act 會把 render 與 passive effect 一口氣 flush，縫就不見了。真的排程：commit 一個 task、passive 另一個 task，
    // 中間的 microtask 就是這個縫 —— 回應在視窗之後的 layout effect 裡落地，正好排在那裡。
    const env = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    env.IS_REACT_ACT_ENVIRONMENT = false
    try {
      onIdentityCommit.current = (who) => {
        if (who.state === 'signed-in' && who.profile.id === Q.profile.id) pb().okNow('TB-race')
      }
      identity.set(Q)
      // 等那一輪落定：作廢（送出鈕恢復）或錯採（視窗關了）都算落定，讓下面的斷言說出是哪一種。
      await waitFor(() => expect(dialogs().length === 0 || !submitButton().disabled).toBe(true))
    } finally {
      env.IS_REACT_ACT_ENVIRONMENT = true
    }
    expect(window.sessionStorage.getItem(keyOf(P, B)), '身分已經是 Q，P 那一輪的回應不能存票').toBeNull()
    expect(calls).toEqual([])
    expect(dialogs()).toHaveLength(1)
  })

  it('[FE-N08-S15] 回應已經贏了 race、副作用還沒做，身分在同一段 microtask 裡同步 commit 成 Q：仍作廢（要比代號，不能只靠喚醒）', async () => {
    const { pressE } = mountWorld()
    pressE(B)
    const pb = pending()
    await submit()
    await act(async () => {
      pb().okNow('TB-sync')
      // 回應落地 → 一個 microtask 把它轉成 race 的輸入 → race 選它 → continuation。`flushSync` 排在第一跳之後、continuation 之前：
      // 那時 race 已經選了回應，喚醒器叫不回它，只剩代號比對。
      await Promise.resolve()
      flushSync(() => identity.set(Q))
    })
    expect(window.sessionStorage.getItem(keyOf(P, B)), 'race 已選回應、代號卻換了：不能存票').toBeNull()
    expect(calls).toEqual([])
    expect(dialogs()).toHaveLength(1)
    expect(submitButton().disabled).toBe(false)
  })
})

describe('失敗回饋', () => {
  it('[FE-N08-S08] 403：視窗留著、欄位保留、alert 在送出控制前且取得焦點、說的是密碼；改一個字再送出是第二個請求', async () => {
    const { pressE } = mountWorld()
    pressE()
    enterProject.mockRejectedValueOnce(http(403, '房間密碼錯誤'))
    type('wrong')
    await submit()
    await waitFor(() => expect(alerts()).toHaveLength(1))
    expect(dialogs()).toHaveLength(1)
    expect(field().value).toBe('wrong')
    expect(alertText()).toContain('密碼')
    expect(alertText()).not.toContain('房間密碼錯誤')
    expect(document.activeElement).toBe(screen.getByRole('alert'))
    expect(screen.getByRole('alert').compareDocumentPosition(submitButton()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expectNothingHappened()
    expect(submitButton().disabled).toBe(false)
    enterProject.mockRejectedValueOnce(http(403, '房間密碼錯誤'))
    type('wrong2')
    await submit()
    expect(enterProject).toHaveBeenCalledTimes(2)
    expect(enterProject).toHaveBeenLastCalledWith(A.projectId, { password: 'wrong2' })
  })

  it('[FE-N08-S09] 404 的三種 detail：alert 完全相同、detail 不進 DOM、不含「不存在／關閉／成軍／密碼」', async () => {
    const { pressE } = mountWorld()
    pressE()
    const seen = new Set<string>()
    for (const detail of ['專案不存在', '房間尚未開啟', '已關閉']) {
      enterProject.mockRejectedValueOnce(http(404, detail))
      await submit()
      await waitFor(() => expect(alerts()).toHaveLength(1))
      seen.add(alertText())
      expect(document.body.textContent).not.toContain(detail)
    }
    expect(seen.size, '三次的 alert 要完全相同').toBe(1)
    for (const word of ['不存在', '關閉', '成軍', '密碼']) expect(alertText()).not.toContain(word)
    expectNothingHappened()
  })

  it.each<[string, () => unknown, string]>([
    ['401', () => http(401, '未登入'), VOCABULARY['authentication-required']],
    ['網路失敗', () => new NetworkError('enterProject', new TypeError('Failed to fetch')), VOCABULARY['network-unavailable']],
    ['500 text/plain', () => http(500, 'Internal Server Error'), VOCABULARY['server-error']],
    ['422', () => http(422, [{ loc: ['body', 'password'], msg: 'field required', type: 'missing' }] as never), VOCABULARY.validation],
    ['200 {} 不合 EnterOut', () => new ContractDriftError('enterProject', [{ code: 'invalid_type', path: ['room_token'], message: 'Required' } as never]), VOCABULARY['contract-drift']],
  ])('[FE-N08-S10] %s：語彙表那句、不含「密碼」、欄位保留、送出控制恢復；原始字串不進 DOM', async (_name, cause, sentence) => {
    const { pressE } = mountWorld()
    pressE()
    enterProject.mockRejectedValueOnce(cause())
    type('keep')
    await submit()
    await waitFor(() => expect(alerts()).toHaveLength(1))
    expect(alertText()).toBe(sentence)
    expect(alertText()).not.toContain('密碼')
    expect(field().value).toBe('keep')
    expect(submitButton().disabled).toBe(false)
    for (const raw of ['Internal Server Error', 'room_token', 'field required', 'Failed to fetch', '未登入']) expect(document.body.textContent).not.toContain(raw)
    expectNothingHappened()
  })
})
