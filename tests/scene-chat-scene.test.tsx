import { act, cleanup, render } from '@testing-library/react'
import { useEffect, type ReactNode, type RefObject } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChatOut } from '@/api/contract/ws'
import type { Identity } from '@/identity/types'
import { SceneChatProvider, useSceneChat } from '@/realtime/SceneChatProvider'
import { createSceneChatStore } from '@/realtime/sceneChatStore'
import { holdRoomToken } from '@/world/scenes/roomTokens'
import { SceneProvider, useScene, type SceneValue } from '@/world/scenes/SceneProvider'
import WorldCanvas from '@/world/WorldCanvas'

// 規格：openspec/changes/fe-r11-realtime-chat/specs/scene-chat-transport/spec.md
//   Requirement: committed 的場景換了才清空；同場景重連不清；不是目前連線的訊息不收 —— S06、S07（jsdom）、S08（單元）
//
// 整條鏈是正式碼（同 `world-scenes-transition-ui.test.tsx`）：`SceneProvider` → `SceneChatProvider` → `WorldCanvas` → `RemoteWorld` → `RealtimeClient` → 全域 `WebSocket`
// （換成 FakeSocket）。聊天訊息由假的伺服器（FakeSocket）送 `chat` frame。**不連任何服務。**

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
vi.mock('@/api/operations', () => ({
  listRooms: vi.fn(async () => [{ project_id: ROOM, title: '星際導航', online_count: 1 }]),
  enterProject: vi.fn(),
  listProfiles: vi.fn(async () => []),
  listProjects: vi.fn(async () => []),
  getProfile: vi.fn(async () => null),
}))

type Listener = (e: unknown) => void
class FakeSocket {
  static instances: FakeSocket[] = []
  readonly listeners = new Map<string, Set<Listener>>()
  closeCalls = 0
  constructor(readonly url: string) {
    FakeSocket.instances.push(this)
  }
  get scene() {
    return new URL(this.url).searchParams.get('scene')
  }
  addEventListener(type: string, l: Listener) {
    this.listeners.set(type, (this.listeners.get(type) ?? new Set()).add(l))
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
  closeEvent(code: number) {
    this.emit('close', { code, reason: '', wasClean: code === 1000 })
  }
  ready() {
    this.emit('open', null)
    this.emit('message', { data: JSON.stringify({ t: 'hello', you: 'me', hz: 10 }) })
    this.emit('message', { data: JSON.stringify({ t: 'snapshot', players: [] }) })
  }
  chat(body: string, id = 'u1') {
    this.emit('message', { data: JSON.stringify({ t: 'chat', id, name: '甲', body }) })
  }
}

const ROOM = 'a0000000-0000-4000-8000-00000000000a'
const PROFILE = { id: 'p0000000-0000-4000-8000-00000000000p', display_name: 'P', avatar_id: 0, skills: [], hours_per_week: null, bio: null, updated_at: '2026-09-14T00:00:00Z' }

type Probe = { scene: SceneValue; chat: ReturnType<typeof useSceneChat> }
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
  vi.stubGlobal('WebSocket', FakeSocket)
  vi.stubEnv('NEXT_PUBLIC_REALTIME_ADAPTER', 'guildhub')
  HTMLCanvasElement.prototype.getContext = vi.fn((id: string) => (id === 'webgl2' ? ({} as RenderingContext) : null)) as typeof realGetContext
  window.sessionStorage.clear()
  identity.current = { state: 'signed-in', profile: PROFILE }
  window.history.replaceState(null, '', '/world')
})
afterEach(() => {
  cleanup()
  HTMLCanvasElement.prototype.getContext = realGetContext
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.useRealTimers()
})

const flush = () =>
  act(async () => {
    for (let i = 0; i < 4; i += 1) await Promise.resolve()
  })
/** `page.tsx` 的形狀：`SceneProvider` → `SceneChatProvider` → `WorldCanvas`。 */
async function inHall() {
  holdRoomToken(PROFILE.id, ROOM, 'T')
  const sinkRef: RefObject<Probe | null> = { current: null }
  render(
    <SceneProvider>
      <SceneChatProvider>
        <ProbeSink sinkRef={sinkRef} />
        <WorldCanvas />
      </SceneChatProvider>
    </SceneProvider>,
  )
  await flush()
  const lobby = FakeSocket.instances.at(-1) as FakeSocket
  await act(async () => lobby.ready())
  await flush()
  const probe = () => sinkRef.current as Probe
  const bodies = () => probe().chat.log.map((r) => r.body)
  return { probe, bodies, last: () => FakeSocket.instances.at(-1) as FakeSocket }
}
/** 從大廳進房間：舊的關、等它的 close、新的建。回傳新 socket（還沒 ready）。 */
async function enterRoom(w: Awaited<ReturnType<typeof inHall>>) {
  const old = w.last()
  act(() => w.probe().scene.enterRoom(ROOM, { title: '星際導航' }))
  await flush()
  expect(old.closeCalls).toBe(1)
  await act(async () => old.closeEvent(1000))
  await flush()
  const fresh = w.last()
  expect(fresh.scene).toBe(`room:${ROOM}`)
  return fresh
}

describe('committed 的場景換了才清', () => {
  it('[FE-R11-S06] 過場開始、房間 socket 還沒 ready：大廳的訊息還在；房間 ready 成為 committed：清空，之後的房間 chat 是唯一內容', async () => {
    const w = await inHall()
    await act(async () => w.last().chat('大廳的話'))
    expect(w.bodies()).toEqual(['大廳的話'])
    const room = await enterRoom(w)
    expect(w.probe().scene.transition, '過場中').not.toBeNull()
    expect(w.bodies(), '過場開始不得先清').toEqual(['大廳的話'])
    await act(async () => room.ready())
    await flush()
    expect(w.probe().scene.transition).toBeNull()
    expect(w.bodies(), '房間 committed 了要清空').toEqual([])
    await act(async () => room.chat('房間的話'))
    expect(w.bodies()).toEqual(['房間的話'])
  })

  it('[FE-R11-S06] 房間的 hello 與第一則 chat 在同一個 task 裡到（React 還沒 render 成 committed）：那一則是房間的，不得被清掉', async () => {
    // 真的 WebSocket：hello 之後的下一則 message 是另一個 task，React 排程的 render 不保證排在它前面 —— 清空不能只靠 effect 的時機。
    const w = await inHall()
    await act(async () => w.last().chat('大廳的話'))
    const room = await enterRoom(w)
    await act(async () => {
      room.ready()
      room.chat('房間第一句')
    })
    await flush()
    expect(w.probe().scene.transition).toBeNull()
    expect(w.bodies(), '大廳的清掉、房間的留下').toEqual(['房間第一句'])
  })

  it('[FE-R11-S07] 進房握手被拒、自動回大廳、新的大廳連線 ready：訊息還在；新連線的 chat 進得來 → 兩則', async () => {
    const w = await inHall()
    await act(async () => w.last().chat('大廳的話'))
    const room = await enterRoom(w)
    await act(async () => room.closeEvent(1006))
    await flush()
    // 系統自動回大廳：等房間 socket 的 close 之後建新的大廳連線
    await flush()
    const lobby2 = w.last()
    expect(lobby2.scene).toBe('lobby')
    expect(lobby2).not.toBe(room)
    await act(async () => lobby2.ready())
    await flush()
    expect(w.probe().scene.scene).toEqual({ id: 'hall' })
    expect(w.bodies(), '同一個 wsScene 的新連線 ready 了，不得清').toEqual(['大廳的話'])
    await act(async () => lobby2.chat('第二句'))
    expect(w.bodies()).toEqual(['大廳的話', '第二句'])
  })
})

describe('不是目前連線的訊息不收', () => {
  it('[FE-R11-S08] 保存大廳那條 socket 的 message listener（就是 RemoteWorld 給 client 的 onMessage 那條路），committed 到房間後直接呼叫它：房間的記憶體不變；目前連線的照收（對照）', async () => {
    const w = await inHall()
    const lobby = w.last()
    // 舊連線的 callback 引用：不是透過已關閉的假 socket 發事件，是直接叫它。
    const oldListeners = [...(lobby.listeners.get('message') ?? [])]
    expect(oldListeners.length).toBeGreaterThan(0)
    const room = await enterRoom(w)
    await act(async () => room.ready())
    await flush()
    expect(w.bodies()).toEqual([])
    await act(async () => {
      for (const l of oldListeners) l({ data: JSON.stringify({ t: 'chat', id: 'u1', name: '甲', body: '舊大廳的話' }) })
    })
    expect(w.bodies(), '舊連線晚到的訊息不得進房間').toEqual([])
    await act(async () => room.chat('房間的話'))
    expect(w.bodies()).toEqual(['房間的話'])
  })

  it('[FE-R11-S08] store 層：保存舊連線的 receive，attach 了新連線之後直接呼叫它：記憶體不變', () => {
    const store = createSceneChatStore()
    const oldLink = store.port.attach(() => {}, 'lobby')
    const message: ChatOut = { t: 'chat', id: 'u1', name: '甲', body: '舊大廳的話' }
    oldLink.receive({ ...message, body: '還是舊連線時' })
    expect(store.getLog().map((r) => r.body)).toEqual(['還是舊連線時'])
    store.clear()
    const newLink = store.port.attach(() => {}, 'lobby')
    oldLink.receive(message)
    expect(store.getLog(), '舊連線晚到的訊息不得進來').toEqual([])
    newLink.receive({ ...message, body: '新連線的話' })
    expect(store.getLog().map((r) => r.body)).toEqual(['新連線的話'])
    // detach 之後也一樣
    newLink.detach()
    newLink.receive({ ...message, body: '關了之後' })
    expect(store.getLog().map((r) => r.body)).toEqual(['新連線的話'])
  })
})
