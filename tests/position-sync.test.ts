import { describe, expect, it } from 'vitest'
import {
  SEND_INTERVAL_MS,
  createSyncState,
  markSent,
  planSend,
  resetSync,
} from '@/realtime/positionSync'

// 規格：openspec/changes/fe-r03-position-sync/specs/position-sync/spec.md
//   Requirement: 最多每 100 毫秒送一次，而且只在整數像素改變時送
//   —— Scenario FE-R03-S02 / S03 / S04
//
// ⚠️ Scenario ID 只放在 `it` 標題上，而且那條 `it` 要把該 Scenario 的每一個
// WHEN/THEN 子句都跑過。
//
// 1 世界單位 = 32 協定像素（`world-coordinates`）。所以 1/32 個世界單位
// 剛好是一個像素，這些測試用它當「移動一格」的單位。

const PIXEL = 1 / 32

/** 模擬 render loop：每幀推進 `dtMs`，把真的送出去的都記下來。 */
function run(
  frames: number,
  dtMs: number,
  positionAt: (frame: number) => { x: number; z: number },
) {
  const state = createSyncState()
  const sent: Array<{ x: number; y: number }> = []
  for (let i = 0; i < frames; i++) {
    const point = planSend(state, positionAt(i), dtMs)
    if (point !== null) {
      sent.push(point)
      markSent(state, point)
    }
  }
  return { state, sent }
}

describe('位置同步的節流與去重', () => {
  it('[FE-R03-S02] 靜止時不送，移動時最多每 100 毫秒一次', () => {
    // 60 幀 × 16.67ms ≈ 1 秒
    const still = run(60, 1000 / 60, () => ({ x: 1, z: 2 }))
    // 第一幀會送一次（初始位置還沒送過），之後都不送。
    expect(still.sent.length, '靜止之後不該再送').toBe(1)

    // 每幀都移動一整個像素 —— 1 秒內最多 10 則
    const moving = run(60, 1000 / 60, (i) => ({ x: i * PIXEL, z: 0 }))
    expect(moving.sent.length, `1 秒內送了 ${moving.sent.length} 則，超過 10 Hz`).toBeLessThanOrEqual(
      10,
    )
    expect(moving.sent.length, '一直在動卻幾乎不送').toBeGreaterThan(5)
  })

  it('[FE-R03-S03] 同一個整數像素內的移動不送', () => {
    const state = createSyncState()
    // 先把第一個位置送掉，讓 lastSent 有值
    const first = planSend(state, { x: 0, z: 0 }, 100)
    expect(first).toEqual({ x: 0, y: 0 })
    markSent(state, first!)

    // 移動不到一個像素（1/32 個世界單位是一格，這裡只走 1/4 格）
    let sends = 0
    for (let i = 1; i <= 60; i++) {
      if (planSend(state, { x: i * PIXEL * 0.25 * 0.01, z: 0 }, 1000 / 60) !== null) sends++
    }
    expect(sends, '同一個整數像素內的漂移不該送').toBe(0)

    // 走到下一個整數像素
    const next = planSend(state, { x: PIXEL, z: 0 }, 1000 / 60)
    expect(next, '跨越像素邊界之後應該送').toEqual({ x: 1, y: 0 })
  })

  it('[FE-R03-S04] 停在一個還沒送出的位置，節流時間到還是要送', () => {
    // **少了這一條，角色會在別人畫面上停在上一個像素** ——
    // 差一格，而且只有在「移動後立刻停下」時才會發生。
    const state = createSyncState()
    markSent(state, planSend(state, { x: 0, z: 0 }, SEND_INTERVAL_MS)!)

    // 移動到新的像素，但只過了 50 毫秒 —— 還不到節流門檻
    expect(planSend(state, { x: PIXEL, z: 0 }, 50), '50 毫秒時不該送').toBeNull()

    // 然後**停下不動**。時間繼續走。
    expect(planSend(state, { x: PIXEL, z: 0 }, 60), '超過 100 毫秒之後應該送出最後的位置').toEqual({
      x: 1,
      y: 0,
    })
  })

  it('卡頓一大段時間只送最新的一筆，不補送中間的', () => {
    const state = createSyncState()
    markSent(state, planSend(state, { x: 0, z: 0 }, SEND_INTERVAL_MS)!)

    // 一幀之內過了 1 秒（分頁切回前景那種）。角色已經在 10 格外。
    const point = planSend(state, { x: 10 * PIXEL, z: 0 }, 1000)
    expect(point, '只送現在的位置').toEqual({ x: 10, y: 0 })
    markSent(state, point!)

    // 沒有第二則排隊
    expect(planSend(state, { x: 10 * PIXEL, z: 0 }, 1000 / 60)).toBeNull()
  })

  it('[FE-R03-S06] 重置之後，同一個位置要重新送一次', () => {
    const state = createSyncState()
    const here = { x: 3, z: 4 }
    markSent(state, planSend(state, here, SEND_INTERVAL_MS)!)
    expect(planSend(state, here, SEND_INTERVAL_MS), '沒動就不送').toBeNull()

    resetSync(state)

    // **不重置的話，換場景後的第一個位置會被跳過** ——
    // 症狀是「換場景之後別人看不到我」。
    expect(planSend(state, here, 0), '重置之後應該立刻可以送，不必再等 100 毫秒').toEqual({
      x: 96,
      y: 128,
    })
  })

  it('沒送成功就不更新 —— 那個位置不會被跳過', () => {
    // 規格：只有真的送出去之後才可以呼叫 markSent。
    // 模擬「連線還沒 ready，所以沒送」。
    const state = createSyncState()
    const point = planSend(state, { x: PIXEL, z: 0 }, SEND_INTERVAL_MS)
    expect(point).toEqual({ x: 1, y: 0 })
    // 不呼叫 markSent

    expect(planSend(state, { x: PIXEL, z: 0 }, 0), '沒送成功的位置，下一幀還要再給一次').toEqual({
      x: 1,
      y: 0,
    })
  })

  it('送出的一定是整數', () => {
    const state = createSyncState()
    // 世界座標是浮點，取整之後必須是整數 ——
    // 送浮點會讓**整則訊息**被後端靜默丟棄。
    const point = planSend(state, { x: 1.234567, z: -2.345678 }, SEND_INTERVAL_MS)
    expect(point).not.toBeNull()
    expect(Number.isInteger(point!.x), `x=${point!.x} 不是整數`).toBe(true)
    expect(Number.isInteger(point!.y), `y=${point!.y} 不是整數`).toBe(true)
  })

  it('節流的間隔就是後端的 HZ', () => {
    // 後端 protocol.py 的 HZ = 10 → 100 毫秒。
    // 這個常數漂掉的話，我們會送得比後端廣播還快。
    expect(SEND_INTERVAL_MS).toBe(100)
  })
})
