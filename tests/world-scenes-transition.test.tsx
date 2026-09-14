import { act, cleanup, render, screen } from '@testing-library/react'
import { StrictMode, useEffect, type ReactNode, type RefObject } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Identity } from '@/identity/types'
import { holdRoomToken, heldRoomToken } from '@/world/scenes/roomTokens'
import { SceneProvider, useScene, type SceneValue } from '@/world/scenes/SceneProvider'
import WorldCanvas from '@/world/WorldCanvas'

// 過場的狀態機：關舊開新、提交、失敗、逾時、遲到的事件、票、網址。規格 `FE-V01-S04`／`S06`／`S07`／`S15`／`S16`／`S19`。
// 看得見的那一半（覆蓋層、通知的 DOM、按鈕）在 `world-scenes-transition-ui.test.tsx`（`--transition-ui`）—— 這裡斷言的是
// `useScene()` 交出的狀態：`transition`、`notice`、`scene`、socket 與網址。
//
// 整條鏈是正式碼：`SceneProvider` → `WorldCanvas`（場景子樹的 key）→ `RemoteWorld` → `RealtimeClient` → `new WebSocket(url)`。
// 被換掉的只有第三方邊界：`@react-three/fiber` 的 `Canvas`（jsdom 沒有 WebGL）、全域 `WebSocket`、
// 以及 `LocalPlayer`（three 的場景圖；出生點與碰撞體換掉由 `world-scenes-hall-only` 驗）。
// 假時鐘：300 ms 最短顯示、10 秒逾時、1 秒等舊 close。不連任何服務。

const identity = vi.hoisted(() => ({ current: { state: 'unknown' } as Identity }))
vi.mock('@/identity/IdentityProvider', () => ({ useIdentity: () => identity.current, useAdoptIdentity: () => vi.fn() }))
vi.mock('@react-three/fiber', () => ({
  useThree: (selector?: (s: unknown) => unknown) => {
    const state = { set: () => {}, size: { width: 800, height: 600 } }
    return selector ? selector(state) : state
  },
  useFrame: () => {},
  Canvas: ({ children, onCreated }: { children?: ReactNode; onCreated?: () => void }) => {
    onCreated?.()
    return <canvas data-testid="r3f-canvas-stub">{children}</canvas>
  },
}))
vi.mock('@/world/player/LocalPlayer', () => ({ LocalPlayer: () => null }))
vi.mock('@/world/RemotePlayers', () => ({ RemotePlayers: () => null }))
vi.mock('@/world/PositionSync', () => ({ PositionSync: () => null }))
const listRooms = vi.hoisted(() => vi.fn())
vi.mock('@/api/operations', () => ({
  listRooms,
  listProfiles: vi.fn(async () => []),
  listProjects: vi.fn(async () => []),
  getProfile: vi.fn(async () => null),
}))

type Listener = (e: unknown) => void
class FakeSocket {
  static instances: FakeSocket[] = []
  readonly url: string
  readonly listeners = new Map<string, Set<Listener>>()
  closeCalls = 0
  constructor(url: string) {
    this.url = url
    FakeSocket.instances.push(this)
  }
  get scene() {
    return new URL(this.url).searchParams.get('scene')
  }
  get token() {
    return new URL(this.url).searchParams.get('token')
  }
  addEventListener(type: string, l: Listener) {
    const set = this.listeners.get(type) ?? new Set()
    set.add(l)
    this.listeners.set(type, set)
  }
  removeEventListener(type: string, l: Listener) {
    this.listeners.get(type)?.delete(l)
  }
  send() {}
  close() {
    this.closeCalls += 1
  }
  emit(type: string, payload: unknown) {
    for (const l of [...(this.listeners.get(type) ?? [])]) l(payload)
  }
  open() {
    this.emit('open', null)
  }
  hello() {
    this.emit('message', { data: JSON.stringify({ t: 'hello', you: 'u-self', hz: 10 }) })
  }
  snapshot(ids: string[]) {
    this.emit('message', {
      data: JSON.stringify({ t: 'snapshot', players: ids.map((id) => ({ id, name: '訪客', av: 0, x: 0, y: 0, f: 0, st: '' })) }),
    })
  }
  closeEvent(code: number) {
    this.emit('close', { code, reason: '', wasClean: code === 1000 })
  }
  /** 跟真的一樣：open → hello → snapshot 一批到。 */
  ready(ids: string[] = []) {
    this.open()
    this.hello()
    this.snapshot(ids)
  }
}

const ROOM = 'a0000000-0000-4000-8000-00000000000a'
const ROOM_B = 'b0000000-0000-4000-8000-00000000000b'
const PROFILE = { id: 'p0000000-0000-4000-8000-00000000000p', display_name: 'P', avatar_id: 0, skills: [], hours_per_week: null, bio: null, updated_at: '2026-09-14T00:00:00Z' }
const ROOMS = [{ project_id: ROOM, title: '星際導航', online_count: 3 }]

type Probe = { scene: SceneValue }
function ProbeSink({ sinkRef }: { sinkRef: RefObject<Probe | null> }) {
  const scene = useScene()
  useEffect(() => {
    sinkRef.current = { scene }
  })
  return null
}

const realGetContext = HTMLCanvasElement.prototype.getContext
beforeEach(() => {
  FakeSocket.instances = []
  vi.useFakeTimers()
  vi.stubGlobal('WebSocket', FakeSocket)
  vi.stubEnv('NEXT_PUBLIC_REALTIME_ADAPTER', 'guildhub')
  HTMLCanvasElement.prototype.getContext = vi.fn((id: string) => (id === 'webgl2' ? ({} as RenderingContext) : null)) as typeof realGetContext
  window.sessionStorage.clear()
  identity.current = { state: 'signed-in', profile: PROFILE }
  listRooms.mockReset()
  listRooms.mockResolvedValue(ROOMS)
})
afterEach(() => {
  cleanup()
  HTMLCanvasElement.prototype.getContext = realGetContext
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.useRealTimers()
  window.history.replaceState(null, '', '/')
})

async function flush() {
  await act(async () => {
    for (let i = 0; i < 4; i += 1) await Promise.resolve()
  })
}
async function tick(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

/** `page.tsx` 的形狀：標題列（按鈕、通知）在 Canvas 外面，`SceneProvider` 包住兩者。 */
function arriveAt(url: string, { timeoutMs, strict = false }: { timeoutMs?: number; strict?: boolean } = {}) {
  window.history.replaceState(window.history.state, '', url)
  const push = vi.spyOn(window.history, 'pushState')
  const replace = vi.spyOn(window.history, 'replaceState')
  const sinkRef: RefObject<Probe | null> = { current: null }
  const tree = (
    <SceneProvider timeoutMs={timeoutMs}>
      <ProbeSink sinkRef={sinkRef} />
      <WorldCanvas />
    </SceneProvider>
  )
  // `S04`：Strict Mode 的開發期雙重 effect 下也只建一條。
  const view = render(strict ? <StrictMode>{tree}</StrictMode> : tree)
  return {
    view,
    probe: () => sinkRef.current!.scene,
    pushes: () => push.mock.calls.length,
    replaces: () => replace.mock.calls.length,
    sockets: () => FakeSocket.instances,
    last: () => FakeSocket.instances.at(-1)!,
    notice: () => sinkRef.current!.scene.notice,
    canvas: () => screen.getByTestId('r3f-canvas-stub'),
  }
}
const url = () => `${window.location.pathname}${window.location.search}`
/** jsdom 的 `history.go` 是排進工作佇列的；假時鐘底下要推一下它才會發 popstate。 */
async function go(delta: number) {
  let fired = false
  window.addEventListener('popstate', () => (fired = true), { once: true })
  await act(async () => {
    window.history.go(delta)
    await vi.advanceTimersByTimeAsync(1)
  })
  expect(fired, 'popstate 沒有發').toBe(true)
}

/** 站在大廳、連線 ready、持有票。 */
async function inHall(options: { strict?: boolean } = {}) {
  holdRoomToken(PROFILE.id, ROOM, 'T')
  const w = arriveAt('/world', options)
  await flush()
  expect(w.sockets()).toHaveLength(1)
  await act(async () => w.last().ready(['u-1', 'u-2']))
  await flush()
  expect(w.probe().scene).toEqual({ id: 'hall' })
  return w
}
/** 從大廳進房間：舊的關、等它的 close 事件、新的建。回傳新 socket。 */
async function enter(w: ReturnType<typeof arriveAt>) {
  const old = w.last()
  act(() => w.probe().enterRoom(ROOM, { title: '星際導航' }))
  await flush()
  expect(old.closeCalls).toBe(1)
  await act(async () => old.closeEvent(1000))
  await flush()
  return w.last()
}

describe('進入房間是關掉舊連線再開新的', () => {
  it('[FE-V01-S04] 舊的先關乾淨、遠端清空、新的帶 scene 與票、Canvas 是同一個節點（Strict Mode）', async () => {
    const w = await inHall({ strict: true })
    expect(w.sockets().filter((s) => s.scene === 'lobby'), 'Strict Mode 下大廳也只建一條').toHaveLength(1)
    const canvas = w.canvas()
    const old = w.last()
    act(() => w.probe().enterRoom(ROOM))
    await flush()
    expect(old.closeCalls, '舊的先關').toBe(1)
    expect(w.sockets(), 'close 事件還沒到，新的不得建').toHaveLength(1)
    // 對舊 socket 事後再發東西：不得影響
    await act(async () => {
      old.open()
      old.hello()
      old.snapshot(['u-9', 'u-8', 'u-7'])
      old.closeEvent(1006)
    })
    await flush()
    expect(w.sockets()).toHaveLength(2)
    const fresh = w.last()
    expect(fresh.scene).toBe(`room:${ROOM}`)
    expect(fresh.token).toBe('T')
    expect(w.sockets().filter((s) => s.scene === `room:${ROOM}`), '房間只建一條').toHaveLength(1)
    expect(w.probe().transition?.to).toEqual({ id: 'room', projectId: ROOM })
    await act(async () => fresh.ready(['u-3']))
    await flush()
    expect(w.probe().transition).toBeNull()
    expect(w.probe().scene).toEqual({ id: 'room', projectId: ROOM })
    expect(w.canvas(), 'Canvas 是同一個節點').toBe(canvas)
    expect(canvas.isConnected).toBe(true)
  })
})

describe('進不去就回 Guild Hall、說一句話、不重試、票留著', () => {
  it('[FE-V01-S06] 10 秒沒有 hello 就回大廳（從 connect() 起算，等舊 close 那一段不算）；票還在、網址不多一層', async () => {
    holdRoomToken(PROFILE.id, ROOM, 'T')
    const w = arriveAt('/world?panel=profiles')
    await flush()
    await act(async () => w.last().ready())
    await flush()
    // 舊 socket 的 close 事件 800 ms 才到 → 新連線在那時才 connect()
    const old = w.last()
    act(() => w.probe().enterRoom(ROOM))
    await flush()
    await tick(800)
    await act(async () => old.closeEvent(1000))
    await flush()
    const fresh = w.last()
    expect(fresh.scene).toBe(`room:${ROOM}`)
    expect(url()).toBe(`/world?room=${ROOM}`)
    await act(async () => fresh.open())
    await tick(9_900)
    expect(w.probe().transition, '9.9 秒：還在過場').not.toBeNull()
    expect(w.notice()).toBeNull()
    await tick(100)
    await flush()
    expect(fresh.closeCalls, '逾時要關那條').toBe(1)
    await act(async () => fresh.closeEvent(1000))
    await flush()
    expect(w.last().scene).toBe('lobby')
    expect(w.notice()).toEqual({ kind: 'failed', room: ROOM })
    expect(heldRoomToken(PROFILE.id, ROOM), '票還在').toBe('T')
    expect(url()).toBe('/world')
    await go(-1)
    expect(url(), '中間沒有一層 ?room=').toBe('/world?panel=profiles')
  })

  it('[FE-V01-S07] 握手被拒：回大廳、不再試；通知留到使用者要求的成功進入／關閉／取代', async () => {
    const w = await inHall()
    let fresh = await enter(w)
    await act(async () => fresh.closeEvent(1006)) // open 之前就關 → 握手被拒
    await flush()
    expect(w.last().scene).toBe('lobby')
    expect(w.notice()).toEqual({ kind: 'failed', room: ROOM })
    await tick(60_000)
    expect(w.sockets().filter((s) => s.scene === `room:${ROOM}`), '跑完所有計時器仍只試過一次').toHaveLength(1)
    await act(async () => w.last().ready())
    await flush()
    expect(w.notice(), '失敗後自動回大廳的 ready 不算「成功進入」—— 不然通知幾毫秒就消失，沒人看得到').not.toBeNull()

    // 不關就再按 E → 過場開始時通知還在；第二次也被拒 → 仍是一則（取代，不是疊）
    const first = w.notice()
    fresh = await enter(w)
    expect(w.notice(), '過場開始時通知還在').toBe(first)
    await act(async () => fresh.closeEvent(1006))
    await flush()
    expect(w.notice()).toEqual({ kind: 'failed', room: ROOM })
    expect(w.notice(), '被取代（新的物件）').not.toBe(first)
    // 使用者關閉
    act(() => w.probe().dismissNotice())
    expect(w.notice()).toBeNull()
    // 再失敗一次 → 通知在；使用者要求的成功進入（第三次按 E 進去了）→ 清
    await act(async () => w.last().ready())
    await flush()
    fresh = await enter(w)
    await act(async () => fresh.closeEvent(1006))
    await flush()
    expect(w.notice()).not.toBeNull()
    await act(async () => w.last().ready())
    await flush()
    fresh = await enter(w)
    await act(async () => fresh.ready())
    await flush()
    expect(w.notice(), '使用者要求的成功進入 → 清').toBeNull()
    expect(w.probe().scene).toEqual({ id: 'room', projectId: ROOM })

    // 從房間 A 進 B 被拒 → 自動回大廳（這次是真的過場：A→hall）→ 大廳 ready 不得清通知
    holdRoomToken(PROFILE.id, ROOM_B, 'TB')
    const inA = w.last()
    act(() => w.probe().enterRoom(ROOM_B))
    await flush()
    await act(async () => inA.closeEvent(1000))
    await flush()
    const b = w.last()
    expect(b.scene).toBe(`room:${ROOM_B}`)
    await act(async () => b.closeEvent(1006))
    await flush()
    expect(w.probe().transition?.to).toEqual({ id: 'hall' })
    await act(async () => b.closeEvent(1000))
    await flush()
    await act(async () => w.last().ready())
    await flush()
    expect(w.probe().transition).toBeNull()
    expect(w.notice(), '自動回大廳的 ready 不算成功進入').toEqual({ kind: 'failed', room: ROOM_B })
  })

  it('[FE-V01-S16] 回大廳也連不上時，不會永久 busy、沒有第三條連線', async () => {
    const w = await inHall()
    const fresh = await enter(w)
    await act(async () => fresh.closeEvent(1006))
    await flush()
    const lobby = w.last()
    expect(lobby.scene).toBe('lobby')
    await act(async () => lobby.closeEvent(1006))
    await flush()
    expect(w.probe().transition, '過場結束（覆蓋層會消失、輸入會解鎖）').toBeNull()
    expect(w.probe().scene).toEqual({ id: 'hall' })
    expect(w.notice(), '回大廳失敗不再多一則').toEqual({ kind: 'failed', room: ROOM })
    await tick(60_000)
    expect(w.sockets()).toHaveLength(3)
  })

  it('[FE-V01-S16] 從房間回大廳、大廳連不上：過場結束、不再建', async () => {
    const w = await inHall()
    const fresh = await enter(w)
    await act(async () => fresh.ready())
    await flush()
    act(() => w.probe().returnToHall())
    await flush()
    await act(async () => fresh.closeEvent(1000))
    await flush()
    const lobby = w.last()
    expect(lobby.scene).toBe('lobby')
    expect(w.probe().transition?.to).toEqual({ id: 'hall' })
    await act(async () => lobby.closeEvent(1006))
    await flush()
    expect(w.probe().transition).toBeNull()
    expect(w.probe().scene).toEqual({ id: 'hall' })
    expect(w.notice(), '回大廳失敗不是「進不了這間房」').toBeNull()
    await tick(60_000)
    expect(w.sockets()).toHaveLength(3)
  })

  it('[FE-V01-S19] 上一頁進到進不去的房：失敗處置一樣，網址不留一層', async () => {
    const w = await inHall()
    const fresh = await enter(w)
    await act(async () => fresh.ready())
    await flush()
    act(() => w.probe().returnToHall())
    await flush()
    await act(async () => fresh.closeEvent(1000))
    await flush()
    await act(async () => w.last().ready())
    await flush()
    expect(url()).toBe('/world')
    const lobby = w.last()
    await go(-1)
    await flush()
    await act(async () => lobby.closeEvent(1000))
    await flush()
    const again = w.last()
    expect(again.scene).toBe(`room:${ROOM}`)
    await act(async () => again.closeEvent(1006))
    await flush()
    expect(w.notice()).toEqual({ kind: 'failed', room: ROOM })
    expect(url()).toBe('/world')
    await go(-1)
    expect(url(), '失敗那一格被 replace 掉了').toBe('/world')
  })
})

describe('過場只提交一次，遲到的事件不算數', () => {
  it('[FE-V01-S15] 舊過場的 close、逾時 callback 遲到，不會把這一次打回大廳', async () => {
    const w = await inHall()
    // 抓住 10 秒逾時的 callback 引用（假時鐘上再包一層 spy），之後直接呼叫 —— 模擬計時器在被取消前那一瞬間已經觸發。
    const scheduled: (() => void)[] = []
    const realSetTimeout = globalThis.setTimeout
    vi.spyOn(globalThis, 'setTimeout').mockImplementation(((cb: () => void, ms?: number, ...rest: unknown[]) => {
      if (ms === 10_000) scheduled.push(cb)
      return (realSetTimeout as unknown as (...a: unknown[]) => unknown)(cb, ms, ...rest)
    }) as typeof setTimeout)
    const room = await enter(w)
    expect(scheduled, '進房間排了一個 10 秒逾時').toHaveLength(1)
    await tick(5_000)
    act(() => w.probe().returnToHall())
    await flush()
    // 房間的 socket 從沒 open；回大廳時它被 close()，之後才發 close 事件（跟握手被拒同形）
    const timerCallbacks = [...scheduled]
    await act(async () => room.closeEvent(1006))
    await flush()
    const lobby = w.last()
    await act(async () => lobby.ready())
    await flush()
    expect(w.probe().scene).toEqual({ id: 'hall' })
    await tick(10_000)
    for (const cb of timerCallbacks) act(() => cb())
    expect(w.probe().scene).toEqual({ id: 'hall' })
    expect(w.notice()).toBeNull()
    expect(w.sockets(), '沒有再建').toHaveLength(3)
    expect(url()).toBe('/world')
  })

  it('[FE-V01-S15] 同一間房連試兩次：第一次的逾時 callback 遲到，不得打敗第二次', async () => {
    const w = await inHall()
    const scheduled: (() => void)[] = []
    const realSetTimeout = globalThis.setTimeout
    vi.spyOn(globalThis, 'setTimeout').mockImplementation(((cb: () => void, ms?: number, ...rest: unknown[]) => {
      if (ms === 10_000) scheduled.push(cb)
      return (realSetTimeout as unknown as (...a: unknown[]) => unknown)(cb, ms, ...rest)
    }) as typeof setTimeout)
    let fresh = await enter(w)
    expect(scheduled).toHaveLength(1)
    const stale = scheduled[0]!
    await act(async () => fresh.closeEvent(1006)) // 第一次被拒
    await flush()
    await act(async () => w.last().ready())
    await flush()
    act(() => w.probe().dismissNotice())
    fresh = await enter(w) // 第二次，同一間房，還在過場中
    expect(w.probe().transition?.to).toEqual({ id: 'room', projectId: ROOM })
    act(() => stale()) // 第一次的 callback 被硬叫
    expect(w.probe().transition, '第二次的過場不得被打回大廳').not.toBeNull()
    expect(w.notice()).toBeNull()
    await act(async () => fresh.ready())
    await flush()
    expect(w.probe().scene).toEqual({ id: 'room', projectId: ROOM })
  })

  it('[FE-V01-S15] 帶著別的 scene 參數的事件不算數（ready 不提交、closed 不算失敗）', async () => {
    const w = await inHall()
    await enter(w)
    expect(w.probe().transition?.to).toEqual({ id: 'room', projectId: ROOM })
    act(() => w.probe().reportConnection({ kind: 'ready' }, 'lobby'))
    expect(w.probe().transition, '別的 scene 的 ready 不得提交').not.toBeNull()
    act(() => w.probe().reportConnection({ kind: 'closed', opened: false }, `room:${ROOM_B}`))
    expect(w.probe().transition, '別的 scene 的 closed 不得算失敗').not.toBeNull()
    expect(w.notice()).toBeNull()
    act(() => w.probe().reportConnection({ kind: 'ready' }, `room:${ROOM}`))
    expect(w.probe().transition).toBeNull()
  })
})
