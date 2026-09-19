import { act, render } from '@testing-library/react'
import { useRef, type RefObject } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LocalPose } from '@/world/PositionSync'
import { RemoteWorld, type RemoteWorldProps } from '@/world/RemoteWorld'
import type { ConnectionEvent } from '@/world/scenes/SceneProvider'

// 規格：openspec/changes/fe-r12-reconnect/specs/connection-recovery/spec.md
//   Requirement: 單一迴圈…等待時間到的那一刻，系統 SHALL 再確認這條連線仍是目前場景的、而且沒有過場進行中 —— S10 的謂詞那一半
//   Requirement: `ready` 之後意外斷線…開始一則通知 —— `recovering` 事件只在真的排下重連時發（design D4）；S08 沒 ready 過不發
//
// 直接掛 `RemoteWorld`（跟 `remote-world-status.test.tsx` 同一組替身）：整合層（`remote-world-reconnect.test.tsx`）裡 React 的 effect 在 act 底下同步
// cleanup，模擬不出「排程在 setDesired 之後、cleanup 之前跑」那扇窗 —— 這裡直接把謂詞釘成 false，證明排程執行前真的有問它。

vi.mock('@react-three/fiber', () => ({ useFrame: () => {}, useThree: () => ({}) }))
vi.mock('@/world/RemotePlayers', () => ({ RemotePlayers: () => null }))
vi.mock('@/world/PositionSync', () => ({ PositionSync: () => null }))

type Listener = (e: unknown) => void
class FakeSocket {
  static instances: FakeSocket[] = []
  readonly listeners = new Map<string, Set<Listener>>()
  constructor(readonly url: string) {
    FakeSocket.instances.push(this)
  }
  addEventListener(type: string, l: Listener) {
    this.listeners.set(type, (this.listeners.get(type) ?? new Set()).add(l))
  }
  removeEventListener(type: string, l: Listener) {
    this.listeners.get(type)?.delete(l)
  }
  send() {}
  close() {}
  emit(type: string, payload: unknown) {
    for (const l of [...(this.listeners.get(type) ?? [])]) l(payload)
  }
  ready() {
    this.emit('open', null)
    this.emit('message', { data: JSON.stringify({ t: 'hello', you: 'me', hz: 10 }) })
    this.emit('message', { data: JSON.stringify({ t: 'snapshot', players: [{ id: 'me', name: '我', av: 0, x: 0, y: 0, f: 0, st: '' }, { id: 'p2', name: '乙', av: 1, x: 32, y: 0, f: 0, st: '' }] }) })
  }
  drop(code = 1012) {
    this.emit('close', { code, reason: '', wasClean: false })
  }
}

beforeEach(() => {
  FakeSocket.instances = []
  vi.useFakeTimers()
  vi.spyOn(Math, 'random').mockReturnValue(0.5)
  vi.stubGlobal('WebSocket', FakeSocket)
  vi.stubEnv('NEXT_PUBLIC_REALTIME_ADAPTER', 'guildhub')
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.useRealTimers()
})

function Harness(props: Omit<RemoteWorldProps, 'poseRef'>) {
  const poseRef = useRef<LocalPose>({ x: 0, z: 0, f: 0 } as LocalPose) as RefObject<LocalPose>
  return <RemoteWorld poseRef={poseRef} scene="lobby" {...props} />
}
const tick = async (ms: number) => act(async () => vi.advanceTimersByTimeAsync(ms))

describe('重連前再問一次「還是我嗎」', () => {
  it('[FE-R12-S10] canReconnect 回 false：等待到了不建、不再排；事件仍有 recovering（排下時）但沒有 connecting', async () => {
    const events: ConnectionEvent['kind'][] = []
    const canReconnect = vi.fn(() => false)
    const onConnection = (e: ConnectionEvent) => events.push(e.kind)
    render(<Harness canReconnect={canReconnect} onConnection={onConnection} />)
    await act(async () => {})
    const first = FakeSocket.instances[0]!
    await act(async () => first.ready())
    expect(events).toEqual(['connecting', 'ready'])
    await act(async () => first.drop())
    expect(events.at(-1), '真的排下重連才發').toBe('recovering')
    expect(canReconnect, '排下的那一刻不問（React 還沒換 prop），等到了才問').not.toHaveBeenCalled()
    await tick(500)
    expect(canReconnect).toHaveBeenCalledTimes(1)
    expect(canReconnect).toHaveBeenCalledWith('lobby')
    expect(FakeSocket.instances, '謂詞說不是 → 不建').toHaveLength(1)
    await tick(60_000)
    expect(FakeSocket.instances, '也不再排').toHaveLength(1)
    expect(events.filter((k) => k === 'connecting')).toHaveLength(1)
  })

  it('[FE-R12-S10] canReconnect 回 true（或沒給）：等待到了建一條、發 connecting；ready 之後 recovering 結束', async () => {
    const events: ConnectionEvent['kind'][] = []
    render(<Harness canReconnect={() => true} onConnection={(e) => events.push(e.kind)} />)
    await act(async () => {})
    await act(async () => FakeSocket.instances[0]!.ready())
    await act(async () => FakeSocket.instances[0]!.drop())
    await tick(500)
    expect(FakeSocket.instances).toHaveLength(2)
    expect(events).toEqual(['connecting', 'ready', 'recovering', 'connecting'])
    await act(async () => FakeSocket.instances[1]!.ready())
    expect(events.at(-1)).toBe('ready')
  })

  it('[FE-R12-S08] 沒 ready 過就 close：沒有 recovering 事件、不排', async () => {
    const events: ConnectionEvent['kind'][] = []
    render(<Harness onConnection={(e) => events.push(e.kind)} />)
    await act(async () => {})
    await act(async () => {
      FakeSocket.instances[0]!.emit('open', null)
      FakeSocket.instances[0]!.drop(1006)
    })
    await tick(60_000)
    expect(FakeSocket.instances).toHaveLength(1)
    expect(events).toEqual(['connecting', 'closed'])
  })

  it('[FE-R12-S07] 等待中卸載：不建（含 Strict Mode 的第二次 effect 也只有一條在等）', async () => {
    const view = render(<Harness />)
    await act(async () => {})
    await act(async () => FakeSocket.instances[0]!.ready())
    await act(async () => FakeSocket.instances[0]!.drop())
    view.unmount()
    await tick(60_000)
    expect(FakeSocket.instances).toHaveLength(1)
  })
})
