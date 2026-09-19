import { act, render } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { useRef, type RefObject } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createStatusStore, type StatusStore } from '@/realtime/statusStore'
import type { RemoteIdentity } from '@/realtime/remotePlayers'
import type { LocalPose } from '@/world/PositionSync'
import { RemoteWorld } from '@/world/RemoteWorld'
import { importGraph, stripComments } from './lib/importGraph'

// 規格：openspec/changes/fe-k05-status/specs/player-status/spec.md
//   Requirement: 已登入的人可以設定…；沒有連線不送 —— S01（自己的回聲交給 store、不進名單）、S03（ready 之前是 offline）
//   Requirement: 換場景、重連之後自己的狀態要再送一次 —— S04（attach 在 ready 之後、每條連線一次；卸載 detach）
//
// `RemoteWorld` 的接線半邊（design D1／D2）：跟 `scene-chat-transport.test.tsx` 同一組替身（FakeSocket、R3F stub），不連任何外部服務。

vi.mock('@react-three/fiber', () => ({ useFrame: () => {}, useThree: () => ({}) }))
vi.mock('@/world/RemotePlayers', () => ({ RemotePlayers: () => null }))
vi.mock('@/world/PositionSync', () => ({ PositionSync: () => null }))

type Listener = (e: unknown) => void
class FakeSocket {
  static instances: FakeSocket[] = []
  readonly listeners = new Map<string, Set<Listener>>()
  readonly sent: string[] = []
  constructor(readonly url: string) {
    FakeSocket.instances.push(this)
  }
  addEventListener(type: string, l: Listener) {
    this.listeners.set(type, (this.listeners.get(type) ?? new Set()).add(l))
  }
  removeEventListener(type: string, l: Listener) {
    this.listeners.get(type)?.delete(l)
  }
  send(data: string) {
    this.sent.push(data)
  }
  close() {}
  emit(type: string, payload: unknown) {
    for (const l of [...(this.listeners.get(type) ?? [])]) l(payload)
  }
  frame(raw: string) {
    this.emit('message', { data: raw })
  }
}
const statusFrames = (s: FakeSocket) => s.sent.map((raw) => JSON.parse(raw) as { t: string; text?: string }).filter((m) => m.t === 'status')

beforeEach(() => {
  FakeSocket.instances = []
  vi.useFakeTimers()
  vi.stubGlobal('WebSocket', FakeSocket)
  vi.stubEnv('NEXT_PUBLIC_REALTIME_ADAPTER', 'guildhub')
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.useRealTimers()
})

function Harness({ store, scene, onRoster }: { store: StatusStore; scene: string; onRoster?: (r: ReadonlyMap<string, RemoteIdentity>) => void }) {
  const poseRef = useRef<LocalPose>({ x: 0, z: 0, f: 0 } as LocalPose) as RefObject<LocalPose>
  return <RemoteWorld poseRef={poseRef} scene={scene} status={store.port} onRosterChange={onRoster} />
}
async function ready(socket: FakeSocket, you = 'me') {
  await act(async () => {
    socket.emit('open', null)
    socket.frame(JSON.stringify({ t: 'hello', you, hz: 10 }))
  })
}

describe('RemoteWorld 的狀態接線', () => {
  it('[FE-K05-S03][FE-K05-S04] ready 之前 offline；ready 之後 online；set 走 socket；換場景：新連線 ready 後重送恰好一則、舊 socket 沒多收；卸載後 offline', async () => {
    const store = createStatusStore()
    const view = render(<Harness store={store} scene="lobby" />)
    await act(async () => {})
    const hall = FakeSocket.instances[0] as FakeSocket
    expect(store.getSnapshot().online, 'ready 之前不能 online（送了會拋）').toBe(false)
    expect(store.set('趕工中')).toEqual({ ok: false, reason: 'offline' })
    expect(statusFrames(hall)).toEqual([])

    await ready(hall)
    expect(store.getSnapshot().online).toBe(true)
    expect(store.set('趕工中')).toEqual({ ok: true })
    expect(statusFrames(hall)).toEqual([{ t: 'status', text: '趕工中' }])
    await act(async () => hall.frame(JSON.stringify({ t: 'status', id: 'me', text: '趕工中' })))
    expect(store.getSnapshot()).toMatchObject({ text: '趕工中', pending: null })

    // 換場景：新的一條連線
    view.rerender(<Harness store={store} scene="room:b0000000-0000-4000-8000-000000000001" />)
    await act(async () => {})
    const room = FakeSocket.instances[1] as FakeSocket
    expect(room).toBeDefined()
    expect(statusFrames(room), 'ready 之前不能重送').toEqual([])
    await ready(room)
    expect(statusFrames(room), '新連線 ready 後恰好重送一則').toEqual([{ t: 'status', text: '趕工中' }])
    expect(statusFrames(hall), '舊連線不補送').toHaveLength(1)

    view.unmount()
    expect(store.getSnapshot().online).toBe(false)
  })

  it('[FE-K05-S01] 自己的回聲交給 store、不進名單；別人的 status 進名單、不動 store', async () => {
    const store = createStatusStore()
    const rosters: ReadonlyMap<string, RemoteIdentity>[] = []
    render(<Harness store={store} scene="lobby" onRoster={(r) => rosters.push(r)} />)
    await act(async () => {})
    const socket = FakeSocket.instances[0] as FakeSocket
    await ready(socket)
    await act(async () => {
      socket.frame(JSON.stringify({ t: 'snapshot', players: [{ id: 'me', name: '我', av: 0, x: 0, y: 0, f: 0, st: '' }, { id: 'p2', name: '乙', av: 1, x: 32, y: 0, f: 0, st: '' }] }))
    })
    store.set('趕工中')
    await act(async () => socket.frame(JSON.stringify({ t: 'status', id: 'me', text: '趕工中' })))
    expect(store.getSnapshot().text).toBe('趕工中')
    const roster = rosters.at(-1)
    expect(roster?.has('me'), '自己不進名單').toBe(false)
    await act(async () => socket.frame(JSON.stringify({ t: 'status', id: 'p2', text: '找人聊聊' })))
    expect(rosters.at(-1)?.get('p2')?.st).toBe('找人聊聊')
    expect(store.getSnapshot().text, '別人的 status 不動自己的').toBe('趕工中')
    // 不認識的 id：名單不變、store 不變
    const count = rosters.length
    await act(async () => socket.frame(JSON.stringify({ t: 'status', id: 'ghost', text: '鬼' })))
    expect(rosters.length).toBe(count)
    expect(store.getSnapshot().text).toBe('趕工中')
  })

  it('[FE-K05-S01] 靜態邊界：statusStore 的 import 圖沒有 RealtimeClient 的值、不 parse raw frame', () => {
    const root = path.resolve(import.meta.dirname, '..')
    const graph = importGraph(path.join(root, 'src/realtime/statusStore.ts'))
    expect([...graph].map((f) => path.relative(root, f))).not.toContain('src/realtime/client.ts')
    for (const file of graph) {
      const code = stripComments(readFileSync(file, 'utf8'), file)
      expect(code.includes('JSON.parse'), `${path.relative(root, file)} 自己 parse raw frame`).toBe(false)
    }
  })
})
