import { act, cleanup, render, screen, within } from '@testing-library/react'
import { useEffect, type ReactNode, type RefObject } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Identity } from '@/identity/types'
import { InteractionProvider, useInteraction } from '@/world/interaction/InteractionProvider'
import { holdRoomToken, heldRoomToken } from '@/world/scenes/roomTokens'
import { SceneProvider, useScene, type SceneValue } from '@/world/scenes/SceneProvider'
import { SceneNotices } from '@/world/scenes/SceneNotices'
import { FADE_MS, OVERLAY_MIN_MS, SceneTransitionOverlay } from '@/world/scenes/SceneTransitionOverlay'
import { ReturnToHallButton } from '@/world/scenes/ReturnToHallButton'
import WorldCanvas from '@/world/WorldCanvas'

// 過場看得見的那一半：覆蓋層、進不去的通知、「回到 Guild Hall」、沒票深連結的說明、輸入鎖。
// 規格 `FE-V01-S05`／`S07`（DOM）／`S13`／`S14`／`S17`。狀態機那一半在 `world-scenes-transition.test.tsx`。
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
function arriveAt(url: string, timeoutMs?: number) {
  window.history.replaceState(window.history.state, '', url)
  const push = vi.spyOn(window.history, 'pushState')
  const replace = vi.spyOn(window.history, 'replaceState')
  const sinkRef: RefObject<Probe | null> = { current: null }
  const view = render(
    <SceneProvider timeoutMs={timeoutMs}>
      <ProbeSink sinkRef={sinkRef} />
      <header>
        <ReturnToHallButton />
      </header>
      <SceneNotices />
      <WorldCanvas />
    </SceneProvider>,
  )
  return {
    view,
    probe: () => sinkRef.current!.scene,
    pushes: () => push.mock.calls.length,
    replaces: () => replace.mock.calls.length,
    sockets: () => FakeSocket.instances,
    last: () => FakeSocket.instances.at(-1)!,
    overlay: () => screen.queryByRole('status', { name: /前往|回到 Guild Hall/ }),
    alert: () => screen.queryByRole('alert'),
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
async function inHall() {
  holdRoomToken(PROFILE.id, ROOM, 'T')
  const w = arriveAt('/world')
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

describe('過場看得見、讀得到、不閃', () => {
  it('[FE-V01-S05] 瞬間完成也至少顯示 300 ms；提交不等覆蓋層', async () => {
    const w = await inHall()
    const fresh = await enter(w)
    expect(w.overlay()?.textContent).toContain('前往 星際導航')
    expect(w.overlay()?.getAttribute('aria-busy')).toBe('true')
    await act(async () => fresh.ready())
    await tick(1)
    expect(w.probe().transition, '1 ms：狀態已提交').toBeNull()
    expect(w.overlay(), '1 ms：覆蓋層還在').not.toBeNull()
    await tick(OVERLAY_MIN_MS - 2)
    expect(w.overlay(), '299 ms：還在').not.toBeNull()
    expect(w.overlay()?.textContent, '提交之後、最短顯示期間，房間名還在').toContain('前往 星際導航')
    await tick(1)
    expect(w.overlay(), '300 ms：消失（不再是 status）').toBeNull()
    // 視覺上還有一層在淡出：沒有 role、aria-hidden、不吃 pointer；淡完卸載
    const fading = screen.getByTestId('scene-transition')
    expect(fading.dataset.state).toBe('fading')
    expect(fading.getAttribute('aria-hidden')).toBe('true')
    expect(fading.className).toContain('opacity-0')
    await tick(FADE_MS)
    expect(screen.queryByTestId('scene-transition'), '淡完才卸載').toBeNull()

    // 另一次：ready 在 2 秒才到 → 2 秒時才消失
    act(() => w.probe().returnToHall())
    await flush()
    await act(async () => fresh.closeEvent(1000))
    await flush()
    const lobby = w.last()
    expect(lobby.scene).toBe('lobby')
    expect(w.overlay()?.textContent).toContain('回到 Guild Hall')
    await tick(1999)
    expect(w.overlay()).not.toBeNull()
    await act(async () => lobby.ready())
    await tick(1)
    expect(w.overlay()).toBeNull()
  })
})

describe('進不去的通知（DOM）', () => {
  it('[FE-V01-S07] role=alert、文字不宣稱原因、有「關閉」；被取代時仍只一則', async () => {
    const w = await inHall()
    let fresh = await enter(w)
    await act(async () => fresh.closeEvent(1006))
    await flush()
    const alert = w.alert()
    expect(alert?.textContent).toContain('進不了這間房')
    expect(alert?.textContent).toContain('暫時連不上')
    expect(alert?.textContent).not.toMatch(/密碼錯|過期了$/)
    await act(async () => w.last().ready())
    await flush()
    expect(w.alert(), '自動回大廳的 ready 不清').not.toBeNull()
    fresh = await enter(w)
    expect(screen.getAllByRole('alert'), '過場開始時通知還在').toHaveLength(1)
    await act(async () => fresh.closeEvent(1006))
    await flush()
    expect(screen.getAllByRole('alert'), '被取代，不是疊兩個').toHaveLength(1)
    act(() => within(screen.getByRole('alert')).getByRole('button', { name: /關閉/ }).click())
    expect(w.alert()).toBeNull()
  })
})

describe('過場期間移動輸入鎖住', () => {
  it('[FE-V01-S17] 過場中鎖住；提交那一刻就解鎖，不等覆蓋層', async () => {
    const lockRef: RefObject<RefObject<boolean> | null> = { current: null }
    function LockProbe() {
      const { inputLockRef } = useInteraction()
      useEffect(() => {
        lockRef.current = inputLockRef
      }, [inputLockRef])
      return null
    }
    const sinkRef: RefObject<Probe | null> = { current: null }
    render(
      <SceneProvider>
        <ProbeSink sinkRef={sinkRef} />
        <InteractionProvider>
          <LockProbe />
          <SceneTransitionOverlay />
        </InteractionProvider>
      </SceneProvider>,
    )
    expect(lockRef.current?.current).toBe(false)
    holdRoomToken(PROFILE.id, ROOM, 'T')
    act(() => sinkRef.current!.scene.enterRoom(ROOM))
    expect(sinkRef.current!.scene.transition).not.toBeNull()
    expect(lockRef.current?.current, '過場中鎖住').toBe(true)
    act(() => sinkRef.current!.scene.reportConnection({ kind: 'ready' }, `room:${ROOM}`))
    expect(sinkRef.current!.scene.transition).toBeNull()
    expect(lockRef.current?.current, '提交那一刻解鎖（覆蓋層還在）').toBe(false)
    expect(screen.queryByRole('status')).not.toBeNull()
  })
})

describe('房間裡隨時回得了 Guild Hall', () => {
  it('[FE-V01-S13] 按鈕只在房間有；按下是 push；票留著', async () => {
    const w = await inHall()
    expect(screen.queryByRole('button', { name: '回到 Guild Hall' })).toBeNull()
    const fresh = await enter(w)
    await act(async () => fresh.ready())
    await flush()
    const before = w.pushes()
    act(() => screen.getByRole('button', { name: '回到 Guild Hall' }).click())
    await flush()
    expect(fresh.closeCalls).toBe(1)
    await act(async () => fresh.closeEvent(1000))
    await flush()
    expect(w.last().scene).toBe('lobby')
    expect(w.last().token).toBeNull()
    expect(url()).toBe('/world')
    expect(w.pushes()).toBe(before + 1)
    expect(heldRoomToken(PROFILE.id, ROOM)).toBe('T')
    await act(async () => w.last().ready())
    await flush()
    expect(screen.queryByRole('button', { name: '回到 Guild Hall' })).toBeNull()
  })
})

describe('深連結', () => {
  it('[FE-V01-S14] 有票直接進；沒票回大廳並說明（status 不是 alert）；票不進網址', async () => {
    holdRoomToken(PROFILE.id, ROOM, 'T')
    const w = arriveAt(`/world?room=${ROOM}`)
    await flush()
    expect(w.last().scene).toBe(`room:${ROOM}`)
    expect(w.last().token).toBe('T')
    expect(url()).toBe(`/world?room=${ROOM}`)
    expect(window.location.href).not.toContain('T=')
    cleanup()
    FakeSocket.instances = []
    window.sessionStorage.clear()
    const w2 = arriveAt(`/world?room=${ROOM}`)
    await flush()
    expect(w2.last().scene).toBe('lobby')
    expect(url()).toBe('/world')
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByRole('status', { name: /房間密碼/ }).textContent).toContain('走到走廊上它的門前按 E')
  })
})
