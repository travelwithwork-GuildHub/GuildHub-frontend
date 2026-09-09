import { describe, expect, it, vi } from 'vitest'
import ReactThreeTestRenderer from '@react-three/test-renderer'
import type { RefObject } from 'react'
import { PositionSync, type LocalPose } from '@/world/PositionSync'
import type { RealtimeClient } from '@/realtime/client'

// 規格：openspec/changes/fe-r03-position-sync/specs/position-sync/spec.md
//   Requirement: 送出的一定是整數，而且只在 ready 時送 —— FE-R03-S05
//   Requirement: 換連線時重置 —— FE-R03-S06
//
// ⚠️ Scenario ID 只放在 `it` 標題上，而且那條 `it` 要把該 Scenario 的每一個
// WHEN/THEN 子句都跑過。
//
// 用 `@react-three/test-renderer`：這個元件的行為全部在 `useFrame` 裡。
// 理由照 `player-no-rerender.test.tsx` 的檔頭。

/**
 * 一個只有 `state` 與 `send` 的替身 client。
 *
 * ⚠️ **`state` 要可以就地改**：真實情況是**同一個 client 物件**從
 * `connecting` 變成 `ready`。用「換一個新 client」來模擬會觸發換連線的重置，
 * 而那會把「提前更新 lastSent」這個 bug 洗掉 —— 負向驗證抓到的。
 */
function fakeClient(state: 'connecting' | 'open' | 'ready') {
  const sent: string[] = []
  const client = {
    state,
    send: vi.fn((data: string) => sent.push(data)),
  }
  return {
    client: client as unknown as RealtimeClient,
    sent,
    raw: client,
    becomeReady: () => {
      client.state = 'ready'
    },
  }
}

const pose = (x = 0, z = 0, f = 0): RefObject<LocalPose> => ({ current: { x, z, f } })

/** 推進幾幀（每幀 1/60 秒）。 */
async function frames(
  renderer: Awaited<ReturnType<typeof ReactThreeTestRenderer.create>>,
  n: number,
) {
  await ReactThreeTestRenderer.act(async () => {
    await renderer.advanceFrames(n, 1 / 60)
  })
}

const parsed = (sent: string[]) => sent.map((s) => JSON.parse(s) as Record<string, unknown>)

describe('位置同步接上連線', () => {
  it('[FE-R03-S05] 連線還沒 ready 時不送、不拋錯，ready 之後立刻送', async () => {
    const notReady = fakeClient('connecting')
    const clientRef: RefObject<RealtimeClient | null> = { current: notReady.client }
    const poseRef = pose(1, 2, 3)

    const renderer = await ReactThreeTestRenderer.create(
      <PositionSync clientRef={clientRef} poseRef={poseRef} />,
    )

    // 超過 100 毫秒（10 幀 × 16.7ms）
    await frames(renderer, 10)
    expect(notReady.sent, '還沒 ready 就送了').toHaveLength(0)
    expect(notReady.raw.send, '不該呼叫 send').not.toHaveBeenCalled()

    // **同一個 client 變成 ready** —— 換一個新的會觸發重置，
    // 那樣就驗不到「沒送成功不可以更新 lastSent」這件事。
    notReady.becomeReady()
    await frames(renderer, 1)

    // **立刻送，不必再等 100 毫秒**，而且那個位置沒有被跳過 ——
    // 沒送成功卻更新 `lastSent` 的話，這裡會是 0 則。
    expect(notReady.sent, 'ready 之後第一幀就該送出那個位置').toHaveLength(1)
    expect(parsed(notReady.sent)[0]).toEqual({ t: 'move', x: 32, y: 64, f: 3 })
  })

  it('[FE-R04-S02] 一個超長的幀不會送出一串位置', async () => {
    // 規格：openspec/changes/fe-r04-background-tab/specs/position-sync/spec.md
    //   Requirement: 超長的一幀最多只送一則
    //
    // 分頁從背景回到前景時，render loop 的第一幀可能是好幾分鐘。
    // 補送是錯的：背景期間 rAF 停了、角色**根本沒有移動**，
    // 所謂「漏掉的位置」並不存在；而補送出去的會是一段已經過去的移動。
    const ready = fakeClient('ready')
    const clientRef: RefObject<RealtimeClient | null> = { current: ready.client }
    const poseRef = pose(5, 7, 1)

    const renderer = await ReactThreeTestRenderer.create(
      <PositionSync clientRef={clientRef} poseRef={poseRef} />,
    )

    // **只推進一幀，而那一幀是 300 秒。**
    await ReactThreeTestRenderer.act(async () => {
      await renderer.advanceFrames(1, 300)
    })

    expect(
      ready.sent,
      `一幀 300 秒送出了 ${ready.sent.length} 則 —— 節流計時器累積了多久` +
        '都不該讓同一幀送出第二則',
    ).toHaveLength(1)
    // 送的是**當下**的位置（5 × 32 = 160、7 × 32 = 224），不是中間任何一個
    expect(parsed(ready.sent)[0]).toEqual({ t: 'move', x: 160, y: 224, f: 1 })
  })

  it('[FE-R03-S06] 換連線之後，同一個位置要重新送一次', async () => {
    const first = fakeClient('ready')
    const clientRef: RefObject<RealtimeClient | null> = { current: first.client }
    const poseRef = pose(1, 2, 0)

    const renderer = await ReactThreeTestRenderer.create(
      <PositionSync clientRef={clientRef} poseRef={poseRef} />,
    )
    await frames(renderer, 10)
    expect(first.sent, '第一個連線應該送過一次').toHaveLength(1)

    // 位置完全沒變，換一個連線
    const second = fakeClient('ready')
    clientRef.current = second.client
    await frames(renderer, 1)

    expect(second.sent, '換連線之後同一個位置要重新送 —— 否則新場景裡別人看不到我').toHaveLength(1)
    expect(parsed(second.sent)[0]).toEqual({ t: 'move', x: 32, y: 64, f: 0 })
    // 舊連線不再收到任何東西
    expect(first.sent, '舊連線不該再收到訊息').toHaveLength(1)
  })

  it('送出的一定是整數，而且格式是協定的 move', async () => {
    const c = fakeClient('ready')
    const clientRef: RefObject<RealtimeClient | null> = { current: c.client }
    // 刻意用會產生浮點的世界座標
    const poseRef = pose(1.234567, -2.345678, 2)

    const renderer = await ReactThreeTestRenderer.create(
      <PositionSync clientRef={clientRef} poseRef={poseRef} />,
    )
    await frames(renderer, 2)

    expect(c.sent).toHaveLength(1)
    const msg = parsed(c.sent)[0]!
    expect(msg.t).toBe('move')
    // **送浮點會讓整則訊息被後端靜默丟棄** —— 症狀是「別人看不到我動」
    expect(Number.isInteger(msg.x), `x=${String(msg.x)} 不是整數`).toBe(true)
    expect(Number.isInteger(msg.y), `y=${String(msg.y)} 不是整數`).toBe(true)
    expect(msg.f).toBe(2)
  })

  it('沒有連線時什麼都不做', async () => {
    const clientRef: RefObject<RealtimeClient | null> = { current: null }
    const renderer = await ReactThreeTestRenderer.create(
      <PositionSync clientRef={clientRef} poseRef={pose(1, 1, 0)} />,
    )
    // 不拋錯就是通過
    await frames(renderer, 20)
    expect(clientRef.current).toBeNull()
  })

  it('這個元件不渲染任何東西', async () => {
    const clientRef: RefObject<RealtimeClient | null> = { current: null }
    const renderer = await ReactThreeTestRenderer.create(
      <PositionSync clientRef={clientRef} poseRef={pose()} />,
    )
    expect(renderer.scene.children, '同步元件不該在場景裡放東西').toHaveLength(0)
  })
})
