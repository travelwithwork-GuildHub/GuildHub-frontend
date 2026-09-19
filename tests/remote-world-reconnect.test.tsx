import { act, cleanup, render, screen } from '@testing-library/react'
import { useEffect, type ReactNode, type RefObject } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Identity } from '@/identity/types'
import { SceneChatProvider, useSceneChat } from '@/realtime/SceneChatProvider'
import { StatusProvider } from '@/realtime/StatusProvider'
import { createStatusStore, type StatusStore } from '@/realtime/statusStore'
import type { ChatLog } from '@/realtime/sceneChat'
import { holdRoomToken, heldRoomToken } from '@/world/scenes/roomTokens'
import { RECOVERING_TEXT, SceneNotices } from '@/world/scenes/SceneNotices'
import { SceneProvider, useScene, type SceneValue } from '@/world/scenes/SceneProvider'
import WorldCanvas from '@/world/WorldCanvas'

// 規格：openspec/changes/fe-r12-reconnect/specs/connection-recovery/spec.md
//   Requirement: `ready` 之後意外斷線要當下清鬼影、讓使用者知道，並自動重連 —— S01、S02
//   Requirement: 重連的等待時間是指數退避加 full jitter…沒有次數上限 —— S04（連續被拒、不放棄、回來就接上）
//   Requirement: 重連之後走既有的「每條連線一次」的路把一切接回來；舊連線的事件不算 —— S05
//   Requirement: 單一迴圈；卸載、換場景、失去分頁資格時停；過場進行中不重連；沒有 `ready` 過的失敗不歸這裡 —— S06、S07、S08、S10
//
// `page.tsx` 的形狀：`SceneProvider` → `SceneChatProvider` → `StatusProvider` → 通知（Canvas 外）＋ `WorldCanvas`（含真的 `RemoteWorld`）。
// socket 是全域替身、時間是假計時器、jitter 的亂數釘在 0.5（`Math.random`）。不連任何外部服務。
// 跟 `world-scenes-transition.test.tsx` 同一組替身 —— 那邊驗過場，這邊驗 ready 之後。

const identity = vi.hoisted(() => ({ current: { state: 'unknown' } as Identity }))
vi.mock('@/identity/IdentityProvider', () => ({ useIdentity: () => identity.current, useAdoptIdentity: () => vi.fn() }))
// 可控的分頁資格：一個可訂閱的小 store，`lease.set(false)` 真的觸發重繪（跟正式站 `WorldLeaseProvider` 的 setHeld 一樣），
// 個別測試用它模擬失去資格（`FE-R06`）。
const lease = vi.hoisted(() => {
  const listeners = new Set<() => void>()
  let allowed = true
  return {
    get: () => allowed,
    set: (v: boolean) => {
      allowed = v
      for (const l of [...listeners]) l()
    },
    subscribe: (l: () => void) => {
      listeners.add(l)
      return () => {
        listeners.delete(l)
      }
    },
  }
})
vi.mock('@/realtime/WorldLeaseProvider', async () => {
  const { useSyncExternalStore } = await import('react')
  return {
    useWorldLease: () => {
      const allowed = useSyncExternalStore(lease.subscribe, lease.get, lease.get)
      return { allowed, blockedByOtherTab: !allowed, takeOver: () => {} }
    },
    WorldLeaseProvider: ({ children }: { children: ReactNode }) => children,
  }
})
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
vi.mock('@/api/operations', () => ({
  listRooms: vi.fn(async () => ROOMS),
  listProfiles: vi.fn(async () => []),
  listProjects: vi.fn(async () => []),
  getProfile: vi.fn(async () => null),
  listSeats: vi.fn(() => new Promise(() => {})),
  getProject: vi.fn(() => new Promise(() => {})),
}))

type Listener = (e: unknown) => void
class FakeSocket {
  static instances: FakeSocket[] = []
  readonly url: string
  readonly listeners = new Map<string, Set<Listener>>()
  readonly sent: string[] = []
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
  send(data: string) {
    this.sent.push(data)
  }
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
    this.emit('message', { data: JSON.stringify({ t: 'snapshot', players: ids.map((id) => ({ id, name: `訪客${id}`, av: 0, x: 0, y: 0, f: 0, st: '' })) }) })
  }
  chat(id: string, body: string) {
    this.emit('message', { data: JSON.stringify({ t: 'chat', id, name: `訪客${id}`, body }) })
  }
  status(id: string, text: string) {
    this.emit('message', { data: JSON.stringify({ t: 'status', id, text }) })
  }
  closeEvent(code: number) {
    this.emit('close', { code, reason: '', wasClean: code === 1000 })
  }
  ready(ids: string[] = []) {
    this.open()
    this.hello()
    this.snapshot(ids)
  }
  get statusFrames() {
    return this.sent.map((raw) => JSON.parse(raw) as { t: string; text?: string; body?: string }).filter((m) => m.t === 'status')
  }
  get chatFrames() {
    return this.sent.map((raw) => JSON.parse(raw) as { t: string; body?: string }).filter((m) => m.t === 'chat')
  }
}

const ROOM = 'a0000000-0000-4000-8000-00000000000a'
const PROFILE = { id: 'p0000000-0000-4000-8000-00000000000p', display_name: 'P', avatar_id: 0, skills: [], hours_per_week: null, bio: null, updated_at: '2026-09-14T00:00:00Z' }
const ROOMS = [{ project_id: ROOM, title: '星際導航', online_count: 3 }]

type Probe = { scene: SceneValue; chat: { log: ChatLog; send: (input: { t: 'chat'; body: string }) => void } }
function ProbeSink({ sinkRef }: { sinkRef: RefObject<Probe | null> }) {
  const scene = useScene()
  const chat = useSceneChat()
  useEffect(() => {
    sinkRef.current = { scene, chat }
  })
  return null
}

const realGetContext = HTMLCanvasElement.prototype.getContext
beforeEach(() => {
  FakeSocket.instances = []
  vi.useFakeTimers()
  vi.spyOn(Math, 'random').mockReturnValue(0.5)
  vi.stubGlobal('WebSocket', FakeSocket)
  vi.stubEnv('NEXT_PUBLIC_REALTIME_ADAPTER', 'guildhub')
  HTMLCanvasElement.prototype.getContext = vi.fn((id: string) => (id === 'webgl2' ? ({} as RenderingContext) : null)) as typeof realGetContext
  window.sessionStorage.clear()
  identity.current = { state: 'signed-in', profile: PROFILE }
  lease.set(true)
})
afterEach(() => {
  cleanup()
  HTMLCanvasElement.prototype.getContext = realGetContext
  vi.restoreAllMocks()
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

function arriveAt(url: string, status: StatusStore = createStatusStore()) {
  window.history.replaceState(window.history.state, '', url)
  const sinkRef: RefObject<Probe | null> = { current: null }
  const tree = (
    <SceneProvider>
      <SceneChatProvider>
        <StatusProvider store={status}>
          <ProbeSink sinkRef={sinkRef} />
          <SceneNotices />
          <WorldCanvas />
        </StatusProvider>
      </SceneChatProvider>
    </SceneProvider>
  )
  const view = render(tree)
  return {
    view,
    rerender: () => view.rerender(tree),
    status,
    probe: () => sinkRef.current!.scene,
    chat: () => sinkRef.current!.chat,
    sockets: () => FakeSocket.instances,
    lobbySockets: () => FakeSocket.instances.filter((s) => s.scene === 'lobby'),
    last: () => FakeSocket.instances.at(-1)!,
    tags: () => screen.queryAllByTestId('name-tag').map((n) => n.getAttribute('data-player')),
    count: () => screen.queryByTestId('online-count')?.textContent ?? null,
    notice: () => screen.queryByTestId('reconnecting-notice'),
    alerts: () => screen.queryAllByRole('alert'),
  }
}
const url = () => `${window.location.pathname}${window.location.search}`

/** 站在大廳、連線 ready（乙、丙在）、持有票。 */
async function inHall(status?: StatusStore) {
  holdRoomToken(PROFILE.id, ROOM, 'T')
  const w = arriveAt('/world', status)
  await flush()
  expect(w.sockets()).toHaveLength(1)
  await act(async () => w.last().ready(['u-1', 'u-2']))
  await flush()
  expect(w.probe().scene).toEqual({ id: 'hall' })
  expect(w.tags().sort()).toEqual(['u-1', 'u-2'])
  expect(w.count()).toBe('3 人在線')
  return w
}
/** 伺服器關掉目前這條（不是前端關的）。 */
async function serverDrops(w: ReturnType<typeof arriveAt>, code = 1012) {
  const dead = w.last()
  await act(async () => dead.closeEvent(code))
  await flush()
  expect(dead.closeCalls, '不是前端關的').toBe(0)
  return dead
}

describe('ready 之後意外斷線', () => {
  it('[FE-R12-S01] 名單立刻清空、人數未知、通知出現；等 0.5 秒才建恰好一條、同 scene／無 token；網址、票不變', async () => {
    const w = await inHall()
    const before = url()
    await serverDrops(w)
    expect(w.tags(), '鬼影').toEqual([])
    expect(w.count(), '人數是未知不是 0').toBeNull()
    expect(w.notice()).not.toBeNull()
    expect(w.notice()?.getAttribute('role')).toBe('status')
    expect(w.notice()?.textContent).toBe(RECOVERING_TEXT)
    expect(w.alerts(), '不是 alert').toHaveLength(0)
    expect(w.sockets(), '等待期間不建').toHaveLength(1)
    await tick(499)
    expect(w.sockets()).toHaveLength(1)
    await tick(1)
    expect(w.sockets(), '等滿 0.5 秒（r=0.5 × 1s）恰好一條').toHaveLength(2)
    expect(w.last().scene).toBe('lobby')
    expect(w.last().token).toBeNull()
    expect(url()).toBe(before)
    expect(heldRoomToken(PROFILE.id, ROOM)).toBe('T')
    expect(w.probe().scene, '沒換場景').toEqual({ id: 'hall' })
  })

  it('[FE-R12-S01] 房間裡斷線：新連線帶同一張票', async () => {
    const w = await inHall()
    const hall = w.last()
    act(() => w.probe().enterRoom(ROOM, { title: '星際導航' }))
    await flush()
    await act(async () => hall.closeEvent(1000))
    await flush()
    const room = w.last()
    expect(room.scene).toBe(`room:${ROOM}`)
    await act(async () => room.ready(['u-5']))
    await flush()
    expect(w.probe().scene).toEqual({ id: 'room', projectId: ROOM })
    await serverDrops(w)
    await tick(500)
    expect(w.sockets()).toHaveLength(3)
    expect(w.last().scene).toBe(`room:${ROOM}`)
    expect(w.last().token).toBe('T')
    expect(w.probe().scene).toEqual({ id: 'room', projectId: ROOM })
    expect(w.alerts()).toHaveLength(0)
  })

  it('[FE-R12-S02] 斷線期間設狀態文字：offline、不送、不拋', async () => {
    const w = await inHall()
    await serverDrops(w)
    expect(w.status.set('趕工中')).toEqual({ ok: false, reason: 'offline' })
    expect(w.sockets()[0]!.statusFrames).toEqual([])
    expect(w.status.getSnapshot().pending).toBeNull()
  })

  it('[FE-R12-S04] 後端長時間不在：6 次握手被拒各再等再連（1、2、4、8、15、15 秒）、通知一直在、沒有 alert；第 7 條 ready 就接上', async () => {
    const w = await inHall()
    await serverDrops(w)
    const waits = [500, 1_000, 2_000, 4_000, 8_000, 15_000, 15_000]
    for (let i = 0; i < 6; i += 1) {
      await tick(waits[i]! - 1)
      expect(w.sockets(), `第 ${i} 次還沒等滿`).toHaveLength(1 + i)
      await tick(1)
      expect(w.sockets(), `第 ${i} 次等滿建一條`).toHaveLength(2 + i)
      // 握手被拒：open 之前就 close
      await act(async () => w.last().closeEvent(1006))
      await flush()
      expect(w.notice(), '通知一直在').not.toBeNull()
      expect(w.alerts()).toHaveLength(0)
      expect(w.probe().scene).toEqual({ id: 'hall' })
    }
    await tick(waits[6]!)
    expect(w.sockets()).toHaveLength(8)
    await act(async () => w.last().ready(['u-3']))
    await flush()
    expect(w.tags()).toEqual(['u-3'])
    expect(w.count()).toBe('2 人在線')
    expect(w.notice(), 'ready 就消失').toBeNull()
    // 成功歸零：再斷一次是 0.5 秒
    await serverDrops(w)
    await tick(500)
    expect(w.sockets()).toHaveLength(9)
  })

  it('[FE-R12-S07] 等待重連期間失去分頁資格：不再對原場景連、通知消失（archive-review）', async () => {
    const w = await inHall()
    await serverDrops(w)
    expect(w.notice()).not.toBeNull()
    // 失去資格（別的分頁搶走）：effect 依 `allowed` 重跑
    await act(async () => {
      lease.set(false)
    })
    await tick(60_000)
    expect(w.lobbySockets(), '失去資格後不再對大廳連').toHaveLength(1)
    expect(w.notice(), '不在重連了，通知不該留著').toBeNull()
  })
})

describe('重連之後接回來；舊連線的事件不算', () => {
  it('[FE-R12-S05] 狀態重送恰好一則、聊天不清且走新連線、名單重建、人數回來、通知消失；舊 socket 遲到的 snapshot／close 不算', async () => {
    const w = await inHall()
    const first = w.last()
    // 自己的狀態是「趕工中」（回聲到了）、聊天有一則
    expect(w.status.set('趕工中')).toEqual({ ok: true })
    await act(async () => first.status('u-self', '趕工中'))
    await act(async () => first.chat('u-1', '哈囉'))
    await flush()
    expect(w.status.getSnapshot()).toMatchObject({ text: '趕工中', pending: null })
    expect(w.chat().log.map((r) => r.body)).toEqual(['哈囉'])

    await serverDrops(w)
    await tick(500)
    const second = w.last()
    expect(second).not.toBe(first)
    await act(async () => second.ready(['u-3']))
    await flush()
    expect(second.statusFrames, '新連線恰好一則重送').toEqual([{ t: 'status', text: '趕工中' }])
    expect(first.statusFrames, '舊連線不補送').toEqual([{ t: 'status', text: '趕工中' }])
    expect(w.chat().log.map((r) => r.body), '同場景重連不清').toEqual(['哈囉'])
    expect(w.tags()).toEqual(['u-3'])
    expect(w.count()).toBe('2 人在線')
    expect(w.notice()).toBeNull()
    // 之後送聊天、設狀態都走新連線
    act(() => w.chat().send({ t: 'chat', body: '回來了' }))
    expect(w.status.set('開會中')).toEqual({ ok: true })
    expect(second.chatFrames).toEqual([{ t: 'chat', body: '回來了' }])
    expect(second.statusFrames).toHaveLength(2)
    expect(first.chatFrames).toEqual([])
    expect(first.statusFrames).toHaveLength(1)
    // 舊 socket 遲到的事件
    await act(async () => {
      first.snapshot(['u-2'])
      first.closeEvent(1006)
      first.open()
    })
    await flush()
    expect(w.tags(), '舊 snapshot 不進名單').toEqual(['u-3'])
    expect(w.count()).toBe('2 人在線')
    expect(w.notice(), '舊 close 不算斷線').toBeNull()
    await tick(60_000)
    expect(w.sockets(), '不多建').toHaveLength(2)
  })
})

describe('單一迴圈；停得下來；不搶過場的活', () => {
  it('[FE-R12-S06] 等待期間舊 socket 再 close、再 message：名單仍空、等滿仍只建一條', async () => {
    const w = await inHall()
    const dead = await serverDrops(w)
    await tick(200)
    await act(async () => {
      dead.closeEvent(1006)
      dead.snapshot(['u-9'])
    })
    await flush()
    expect(w.tags()).toEqual([])
    await tick(300)
    expect(w.sockets(), '原本的 0.5 秒到：恰好一條').toHaveLength(2)
    await tick(60_000)
    expect(w.sockets(), '第二條沒 ready 也沒 close → 不再排').toHaveLength(2)
  })

  it('[FE-R12-S07] 等待中離開世界：時間過了不連；等待中按門進房：不對大廳連、房間恰好一條', async () => {
    const w = await inHall()
    await serverDrops(w)
    w.view.unmount()
    await tick(60_000)
    expect(w.sockets()).toHaveLength(1)

    FakeSocket.instances = []
    const w2 = await inHall()
    await serverDrops(w2)
    act(() => w2.probe().enterRoom(ROOM, { title: '星際導航' }))
    await flush()
    expect(w2.notice(), '過場開始，通知不顯示').toBeNull()
    await tick(60_000)
    expect(w2.lobbySockets(), '不對大廳再連').toHaveLength(1)
    const rooms = w2.sockets().filter((s) => s.scene === `room:${ROOM}`)
    expect(rooms, '房間那條照過場建、恰好一條').toHaveLength(1)
  })

  it('[FE-R12-S10] 退避到點與 enterRoom 擠在同一個 act：仍不對大廳重連（canReconnect 讀最新狀態，archive-review）', async () => {
    const w = await inHall()
    await serverDrops(w) // 排下 0.5 秒的重連
    // enterRoom 排 state 更新、退避計時器同一批到期：canReconnect('lobby') 若讀到過期的 transition/scene 會建舊大廳連線
    await act(async () => {
      w.probe().enterRoom(ROOM, { title: '星際導航' })
      await vi.advanceTimersByTimeAsync(500)
    })
    await tick(60_000)
    expect(w.lobbySockets(), '過場中不得對大廳重連').toHaveLength(1)
    expect(w.sockets().filter((s) => s.scene === `room:${ROOM}`), '房間那條照過場建').toHaveLength(1)
  })

  it('[FE-R12-S08] 從沒 ready 過就失敗：open 前 close、或 open 了沒 hello 就 close —— 不重連、沒通知', async () => {
    const a = arriveAt('/world')
    await flush()
    await act(async () => a.last().closeEvent(1006))
    await flush()
    await tick(60_000)
    expect(a.sockets()).toHaveLength(1)
    expect(a.notice()).toBeNull()
    a.view.unmount()

    FakeSocket.instances = []
    const b = arriveAt('/world')
    await flush()
    await act(async () => {
      b.last().open()
      b.last().closeEvent(1006)
    })
    await flush()
    await tick(60_000)
    expect(b.sockets(), 'open 了但沒 hello 也不歸重連').toHaveLength(1)
    expect(b.notice()).toBeNull()
  })

  it('[FE-R12-S10] 過場進行中原場景斷線：不對大廳重連、任何時刻至多一條、沒通知；過場照舊', async () => {
    const w = await inHall()
    const hall = w.last()
    act(() => w.probe().enterRoom(ROOM, { title: '星際導航' }))
    await flush()
    expect(hall.closeCalls, '過場關了大廳').toBe(1)
    // 大廳的舊 socket 此時「意外」close（不是那次 close() 的回應碼）
    await act(async () => hall.closeEvent(1012))
    await flush()
    const room = w.last()
    expect(room.scene).toBe(`room:${ROOM}`)
    // 過場逾時是 10 秒；在窗內推進退避可能的區間（≤30 秒的 jitter，這裡 r=0.5 → 大廳重連若有會在 0.5 秒冒出來）
    await tick(5_000)
    expect(w.lobbySockets(), '不對大廳再連').toHaveLength(1)
    expect(w.notice()).toBeNull()
    // 過場照舊：ready 就提交（趕在 10 秒逾時之前）
    await act(async () => room.ready(['u-5']))
    await flush()
    expect(w.probe().scene).toEqual({ id: 'room', projectId: ROOM })
    expect(w.probe().transition).toBeNull()
  })

  it('[FE-R12-S10] canReconnect：在大廳 settled 時對 lobby 回 true、對別的場景 false；過場中一律 false', async () => {
    const w = await inHall()
    expect(w.probe().canReconnect('lobby')).toBe(true)
    expect(w.probe().canReconnect(`room:${ROOM}`)).toBe(false)
    act(() => w.probe().enterRoom(ROOM, { title: '星際導航' }))
    await flush()
    expect(w.probe().transition).not.toBeNull()
    expect(w.probe().canReconnect('lobby')).toBe(false)
    expect(w.probe().canReconnect(`room:${ROOM}`)).toBe(false)
  })
})
