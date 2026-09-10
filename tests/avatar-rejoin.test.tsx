import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { useRef, type RefObject } from 'react'
import { RemoteWorld } from '@/world/RemoteWorld'
import type { LocalPose } from '@/world/PositionSync'

// 規格 `FE-A05-S04`：儲存成功之後，**已經在場的其他人**也要看到新外觀。
//
// ⚠️⚠️ **為什麼這需要一條判準：`PATCH` 成功不等於別人看得到。**
//
// 即時層每個人的 `av` 來自**那條連線背後的 session**，而後端是在**登入時**
// 把 `avatar_id` 寫進 session 的。所以改了 profile 之後，
// **已經在場的人看到的仍然是舊外觀** —— 除非那條連線關掉重開。
//
// ⚠️ **這一份守的是「換代就重連」這件事本身。**
// 真正的驗收（B 先在場、A 儲存之後 B 看到新外觀）要兩個真的瀏覽器，
// 那是 `tasks` 6.4。這裡守的是那條路上唯一在 jsdom 量得到的一段。
//
// ⚠️ **被換掉的是全域的 `WebSocket`，不是我們自己的任何一層** ——
// `RemoteWorld` → `RealtimeClient` → `browserSocket` → `new WebSocket(url)`，
// 中間沒有注入點，而那是刻意的。從全域替換等於走正式碼真正的那條路。

vi.mock('@react-three/fiber', () => ({
  useThree: (selector?: (s: unknown) => unknown) => {
    const state = { set: () => {}, size: { width: 800, height: 600 } }
    return selector ? selector(state) : state
  },
  useFrame: () => {},
}))
vi.mock('@/world/RemotePlayers', () => ({ RemotePlayers: () => null }))
vi.mock('@/world/PositionSync', () => ({ PositionSync: () => null }))

class FakeSocket {
  static opened = 0
  static closed = 0
  constructor() {
    FakeSocket.opened++
  }
  addEventListener() {}
  removeEventListener() {}
  send() {}
  close() {
    FakeSocket.closed++
  }
}

beforeEach(() => {
  FakeSocket.opened = 0
  FakeSocket.closed = 0
  vi.stubGlobal('WebSocket', FakeSocket)
  vi.stubEnv('NEXT_PUBLIC_REALTIME_ADAPTER', 'guildhub')
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

/** `RemoteWorld` 要一個 pose ref；內容不重要，`PositionSync` 已經被換掉了。 */
function Harness({ generation }: { generation: number }) {
  const poseRef = useRef<LocalPose>({
    x: 0,
    z: 0,
    facing: 0,
    moving: false,
  } as unknown as LocalPose) as RefObject<LocalPose>
  return <RemoteWorld poseRef={poseRef} generation={generation} />
}

describe('換代就重新建立連線', () => {
  it('[FE-A05-S04] `generation` 改變時，舊連線關掉、新連線建立', () => {
    const { rerender } = render(<Harness generation={0} />)
    expect(FakeSocket.opened, '第一次掛載就沒有連線 —— 這條判準的前提壞了').toBe(1)
    expect(FakeSocket.closed).toBe(0)

    rerender(<Harness generation={1} />)

    expect(
      FakeSocket.opened,
      '換代之後沒有建立新連線 —— `generation` 是不是沒進 effect 的依賴陣列？' +
        '沒有它的話，使用者改了角色，已經在場的人永遠看到舊外觀（規格 S04）',
    ).toBe(2)
    expect(FakeSocket.closed, '換代時舊連線沒有關掉 —— 那會留下一條孤兒連線').toBe(1)
  })

  it('[FE-A05-S04] `generation` 沒變時 SHALL NOT 重連', () => {
    // ⚠️ **沒有這一條，上一條可以用「每次重繪都重連」通過** ——
    // 而那個實作會讓世界每秒斷線重連好幾次，別人看到的是你一直在閃。
    const { rerender } = render(<Harness generation={0} />)
    expect(FakeSocket.opened).toBe(1)

    rerender(<Harness generation={0} />)
    rerender(<Harness generation={0} />)

    expect(FakeSocket.opened, '同一代重繪了三次卻連了不只一次').toBe(1)
    expect(FakeSocket.closed).toBe(0)
  })

  it('[FE-A05-S04] 卸載時連線要關掉', () => {
    // 這一條不是新行為（既有的 cleanup 本來就會關），但換代靠的正是那個
    // cleanup —— 它壞掉的話，上面第一條會用「開了兩條、一條都沒關」通過。
    const { unmount } = render(<Harness generation={0} />)
    unmount()
    expect(FakeSocket.closed).toBe(1)
  })
})
