import { act, cleanup, render, screen } from '@testing-library/react'
import { useEffect, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Identity } from '@/identity/types'
import { useRequestEntry } from '@/world/scenes/EntryGate'
import { holdRoomToken } from '@/world/scenes/roomTokens'
import { SceneNotices, GATE_TEXT } from '@/world/scenes/SceneNotices'
import { SceneProvider, useScene, type SceneValue } from '@/world/scenes/SceneProvider'
import WorldCanvas from '@/world/WorldCanvas'

// 門的動作接到整條鏈上：網址、舊 socket 關、新 socket 帶 scene 與票、只建一次；沒票：沒有 socket、網址不變、一句說明。
// 規格 `FE-V01-S10`／`S11`／`FE-W12-S16`。「按 E → requestEntry」那半截由 `world-scenes-door.test.tsx` 用真的互動系統驗；
// 這裡從 `useRequestEntry()` 之後接下去（`WorldCanvas` 裡的 `InteractionProvider` 從外面碰不到），其餘都是正式碼。

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
  // 進了房間會問座位（`FE-J13`）：這裡不驗座位，讓它一直在飛
  listSeats: vi.fn(() => new Promise(() => {})),
  getProject: vi.fn(() => new Promise(() => {})),
  listRooms,
  listProfiles: vi.fn(async () => []),
  listProjects: vi.fn(async () => []),
  getProfile: vi.fn(async () => null),
}))
const fetchSpy = vi.fn()

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
  ready() {
    this.emit('open', null)
    this.emit('message', { data: JSON.stringify({ t: 'hello', you: 'u-self', hz: 10 }) })
    this.emit('message', { data: JSON.stringify({ t: 'snapshot', players: [] }) })
  }
  closeEvent(code: number) {
    this.emit('close', { code, reason: '', wasClean: code === 1000 })
  }
}

const ROOM = 'a0000000-0000-4000-8000-00000000000a'
const PROFILE = { id: 'p0000000-0000-4000-8000-00000000000p', display_name: 'P', avatar_id: 0, skills: [], hours_per_week: null, bio: null, updated_at: '2026-09-14T00:00:00Z' }

let latest: { scene: SceneValue; requestEntry: ReturnType<typeof useRequestEntry> } | null = null
function Probe() {
  const scene = useScene()
  const requestEntry = useRequestEntry()
  useEffect(() => {
    latest = { scene, requestEntry }
  })
  return null
}

const realGetContext = HTMLCanvasElement.prototype.getContext
beforeEach(() => {
  FakeSocket.instances = []
  vi.useFakeTimers()
  vi.stubGlobal('WebSocket', FakeSocket)
  vi.stubGlobal('fetch', fetchSpy)
  vi.stubEnv('NEXT_PUBLIC_REALTIME_ADAPTER', 'guildhub')
  HTMLCanvasElement.prototype.getContext = vi.fn((id: string) => (id === 'webgl2' ? ({} as RenderingContext) : null)) as typeof realGetContext
  window.sessionStorage.clear()
  identity.current = { state: 'signed-in', profile: PROFILE }
  listRooms.mockReset()
  listRooms.mockResolvedValue([{ project_id: ROOM, title: '星際導航', online_count: 3 }])
  fetchSpy.mockReset()
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
const url = () => `${window.location.pathname}${window.location.search}`

async function inHall() {
  window.history.replaceState(null, '', '/world')
  render(
    <SceneProvider>
      <Probe />
      <SceneNotices />
      <WorldCanvas />
    </SceneProvider>,
  )
  await flush()
  const lobby = FakeSocket.instances.at(-1)!
  expect(lobby.scene).toBe('lobby')
  await act(async () => lobby.ready())
  await flush()
  return lobby
}

describe('門的動作接到整條鏈', () => {
  it('[FE-V01-S10] 持有票：網址變 ?room、舊 socket 先關、新 socket 帶 scene 與票、只建一條', async () => {
    holdRoomToken(PROFILE.id, ROOM, 'T')
    const lobby = await inHall()
    act(() => latest!.requestEntry(ROOM, '星際導航'))
    await flush()
    expect(url()).toBe(`/world?room=${ROOM}`)
    expect(lobby.closeCalls, '舊的先關').toBe(1)
    expect(FakeSocket.instances, 'close 事件還沒到，新的不得建').toHaveLength(1)
    await act(async () => lobby.closeEvent(1000))
    await flush()
    const room = FakeSocket.instances.at(-1)!
    expect(room.scene).toBe(`room:${ROOM}`)
    expect(room.token).toBe('T')
    expect(FakeSocket.instances.filter((s) => s.scene === `room:${ROOM}`)).toHaveLength(1)
    expect(screen.getByRole('status', { name: /前往 星際導航/ })).toBeTruthy()
  })

  it('[FE-V01-S11]／[FE-W12-S16] 沒有票、預設門禁：一句說明；沒有新 socket、沒有請求、網址不變', async () => {
    const lobby = await inHall()
    const before = url()
    const sockets = FakeSocket.instances.length
    fetchSpy.mockClear()
    act(() => latest!.requestEntry(ROOM, '星際導航'))
    await flush()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000)
    })
    expect(url()).toBe(before)
    expect(FakeSocket.instances).toHaveLength(sockets)
    expect(lobby.closeCalls, '大廳的連線沒被關').toBe(0)
    expect(fetchSpy, '沒有送出任何請求').not.toHaveBeenCalled()
    expect(screen.getByRole('status', { name: GATE_TEXT }).textContent).toContain('輸入密碼的功能還沒開放')
    expect(screen.queryByRole('alert')).toBeNull()
    expect(latest!.scene.transition).toBeNull()
  })
})
