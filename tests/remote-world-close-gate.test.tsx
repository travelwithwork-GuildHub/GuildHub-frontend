import { act, render } from '@testing-library/react'
import { useRef, type RefObject } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RemoteWorld } from '@/world/RemoteWorld'
import type { LocalPose } from '@/world/PositionSync'
import { CLOSE_ACK_TIMEOUT_MS } from '@/realtime/client'

// `RemoteWorld` 換 scene（子樹重掛）時，新連線要等舊 socket 的 close 事件。規格 `FE-V01-S18`（元件那一半）。
//
// 跟 `avatar-rejoin.test.tsx` 同一套：被換掉的是**全域的 `WebSocket`**，
// `RemoteWorld` → `RealtimeClient` → `browserSocket` → `new WebSocket(url)` 整條是正式碼。

vi.mock('@react-three/fiber', () => ({ useFrame: () => {}, useThree: () => ({}) }))
vi.mock('@/world/RemotePlayers', () => ({ RemotePlayers: () => null }))
vi.mock('@/world/PositionSync', () => ({ PositionSync: () => null }))

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
  emitClose() {
    for (const l of [...(this.listeners.get('close') ?? [])]) l({ code: 1000, reason: '', wasClean: true })
  }
}

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

function Harness({ scene, gateRef }: { scene: string; gateRef: RefObject<Promise<void> | null> }) {
  const poseRef = useRef<LocalPose>({ x: 0, z: 0, f: 0 } as LocalPose) as RefObject<LocalPose>
  // `key={scene}` 模擬 `WorldCanvas` 的場景子樹：換 scene 是卸載再掛，不是改 prop。
  return <RemoteWorld key={scene} poseRef={poseRef} scene={scene} closeGateRef={gateRef} />
}

async function flush() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

describe('RemoteWorld 重掛時的 close 閘門', () => {
  it('[FE-V01-S18] 新 socket 在舊 socket 的 close 事件之後才建；沒等到就 1 秒', async () => {
    const gateRef: RefObject<Promise<void> | null> = { current: null }
    const view = render(<Harness scene="lobby" gateRef={gateRef} />)
    await flush()
    expect(FakeSocket.instances).toHaveLength(1)
    const old = FakeSocket.instances[0]!

    view.rerender(<Harness scene="room:a" gateRef={gateRef} />)
    await flush()
    expect(old.closeCalls, '舊的先關').toBe(1)
    expect(FakeSocket.instances, 'close 事件還沒到，不得建新的').toHaveLength(1)

    await act(async () => {
      vi.advanceTimersByTime(200)
      old.emitClose()
    })
    await flush()
    expect(FakeSocket.instances).toHaveLength(2)
    expect(new URL(FakeSocket.instances[1]!.url).searchParams.get('scene')).toBe('room:a')

    // 第二次換：舊的永遠不發 close 事件 → 1 秒時建
    view.rerender(<Harness scene="lobby" gateRef={gateRef} />)
    await flush()
    expect(FakeSocket.instances).toHaveLength(2)
    await act(async () => {
      vi.advanceTimersByTime(CLOSE_ACK_TIMEOUT_MS - 1)
    })
    await flush()
    expect(FakeSocket.instances, '上限之前不得建').toHaveLength(2)
    await act(async () => {
      vi.advanceTimersByTime(1)
    })
    await flush()
    expect(FakeSocket.instances, '1 秒時建').toHaveLength(3)
    view.unmount()
  })

  it('[FE-V01-S18] 等閘門期間就卸載：不建 socket、也不在 console 留錯', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const gateRef: RefObject<Promise<void> | null> = { current: null }
    const view = render(<Harness scene="lobby" gateRef={gateRef} />)
    await flush()
    view.rerender(<Harness scene="room:a" gateRef={gateRef} />)
    await flush()
    view.unmount()
    await act(async () => {
      FakeSocket.instances[0]!.emitClose()
      vi.advanceTimersByTime(CLOSE_ACK_TIMEOUT_MS + 1)
    })
    await flush()
    expect(FakeSocket.instances, '卸載之後不得再建').toHaveLength(1)
    // 卸載後還去 `connect()` 一個已關的 client 會拋 —— 那條 promise 鏈把它印成 console.error，這裡要是零。
    expect(consoleError, '卸載後仍嘗試連線').not.toHaveBeenCalled()
    consoleError.mockRestore()
  })

  it('[FE-V01-S18] 連換兩次（A→B→C）：C 要等 A 的 close 事件，不因 B 沒有 socket 就立刻連', async () => {
    const gateRef: RefObject<Promise<void> | null> = { current: null }
    const view = render(<Harness scene="lobby" gateRef={gateRef} />)
    await flush()
    const a = FakeSocket.instances[0]!
    view.rerender(<Harness scene="room:b" gateRef={gateRef} />)
    await flush()
    view.rerender(<Harness scene="room:c" gateRef={gateRef} />) // B 還在等 A 的 ack 就被換掉
    await flush()
    expect(FakeSocket.instances, 'A 的 close 事件還沒到，C 不得連').toHaveLength(1)
    await act(async () => {
      a.emitClose()
    })
    await flush()
    expect(FakeSocket.instances).toHaveLength(2)
    expect(new URL(FakeSocket.instances[1]!.url).searchParams.get('scene'), '只有 C 連，B 從來沒連').toBe('room:c')
    view.unmount()
  })
})
