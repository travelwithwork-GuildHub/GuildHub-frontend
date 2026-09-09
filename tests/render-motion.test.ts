import { describe, expect, it } from 'vitest'
import { MOVE_SPEED } from '@/world/player/movement'
import { PHYSICS } from '@/world/physics/world'
import { advanceRenderMotion, createRenderMotion, type Position } from '@/world/player/renderMotion'

// 規格：openspec/changes/fe-w03-render-interpolation/specs/world-player/spec.md
//   Requirement: 畫面上的位置與影格率無關 —— FE-W03-S14 / S15 / S16
//
// ⚠️ **判準是「速率恆定」，不是「畫面看起來平滑」**（design 的 D5）。
// 用瀏覽器量抖動當測試會 flaky（影格間隔本來就會變），而且它證明不了原因。
//
// 這裡驗的是一條可以手算的恆等式：畫面位置 = v·T − v·h，
// 於是逐幀的 `畫面位移 / dt` 恆等於 v。拿掉插值的話同一組輸入會算出
// 0（那一幀沒走）或 2v（走了兩步）。

const H = PHYSICS.fixedStep

/** 等速往 +x 走的一步。**只換掉「一步怎麼走」**，不換「幾步、畫在哪」。 */
function constantVelocityStep(cur: Position): () => Position {
  return () => {
    cur.x += MOVE_SPEED * H
    return { x: cur.x, z: cur.z }
  }
}

/**
 * 刻意不整除固定步的一串影格間隔。
 *
 * 三種都要有 —— 少了任何一種，那一類的錯誤就沒有被打到：
 *   比一個固定步**短**（那一幀會 0 步）
 *   比一個固定步**長**（那一幀會 2 步）
 *   剛好**等於**一個固定步
 */
const JITTERY_DTS = [
  H * 0.4,
  H * 0.7,
  H * 1.3,
  H,
  H * 0.9,
  H * 1.8,
  H * 0.55,
  H * 1.1,
  H,
  H * 0.35,
  H * 2.4,
  H * 0.8,
  // `as const` 讓它是 tuple 而不是陣列 —— 這個 repo 開了
  // `noUncheckedIndexedAccess`，一般陣列的 `[0]` 型別是 `number | undefined`。
] as const

describe('畫面位置的插值', () => {
  it('[FE-W03-S14] 不均勻的影格間隔下畫面速率恆定', () => {
    const physics = { x: 0, z: 0 }
    const state = createRenderMotion({ x: 0, z: 0 })
    const step = constantVelocityStep(physics)

    // ⚠️ **暖機一個固定步。** 起步的頭幾幀 `prev === cur`（還沒跑滿一步），
    // 畫面停在起點 —— 不可能往回外插到「起點之前」。
    // 恆等式從第一個固定步之後才成立，那個暫態最長就是一個固定步。
    advanceRenderMotion(state, H, step)

    let previous = advanceRenderMotion(state, JITTERY_DTS[0], step).x
    const rates: number[] = []
    for (const dt of JITTERY_DTS.slice(1)) {
      const rendered = advanceRenderMotion(state, dt, step).x
      rates.push((rendered - previous) / dt)
      previous = rendered
    }

    // **每一幀都要成立，不是總和。** 目前的實作總距離就是對的，
    // 錯的是每一幀的分配 —— 只驗總和的話這條會綠，而畫面照樣在抖。
    expect(rates).toHaveLength(JITTERY_DTS.length - 1)
    for (const [i, rate] of rates.entries()) {
      expect(rate, `第 ${i + 1} 幀的畫面速率是 ${rate}，不是 ${MOVE_SPEED}`).toBeCloseTo(
        MOVE_SPEED,
        9,
      )
    }
  })

  it('[FE-W03-S15] 畫面位置落後真實位置至多一個固定步', () => {
    const physics = { x: 0, z: 0 }
    const state = createRenderMotion({ x: 0, z: 0 })
    const step = constantVelocityStep(physics)

    // 暖機理由同上。
    let elapsed = H
    advanceRenderMotion(state, H, step)
    let rendered = 0
    for (const dt of JITTERY_DTS) {
      elapsed += dt
      rendered = advanceRenderMotion(state, dt, step).x
    }

    expect(rendered).toBeCloseTo(MOVE_SPEED * elapsed - MOVE_SPEED * H, 9)

    // 「MUST NOT 隨時間累積」—— 再跑一輪，落差還是**同一個**。
    for (const dt of JITTERY_DTS) {
      elapsed += dt
      rendered = advanceRenderMotion(state, dt, step).x
    }
    expect(rendered).toBeCloseTo(MOVE_SPEED * elapsed - MOVE_SPEED * H, 9)
  })

  it('[FE-W03-S16] 沒有按鍵時畫面位置完全不動', () => {
    const state = createRenderMotion({ x: 3, z: -2 })
    // 站著不動：每一步回傳同一個位置。
    const stand = () => ({ x: 3, z: -2 })

    let previous = advanceRenderMotion(state, JITTERY_DTS[0], stand)
    for (const dt of JITTERY_DTS.slice(1)) {
      const now = advanceRenderMotion(state, dt, stand)
      // 插值寫錯的話角色會在放開按鍵之後繼續往前漂 ——
      // 而那個症狀跟「輸入沒有被放開」長得一模一樣。
      expect(now.x, '站著不動竟然漂了').toBe(previous.x)
      expect(now.z, '站著不動竟然漂了').toBe(previous.z)
      previous = now
    }
    expect(previous).toEqual({ x: 3, z: -2 })
  })

  it('[FE-W03-S14] 物理位置本身仍然只走整數個固定步', () => {
    // **對照組。** 沒有這一條，一個「把物理也改成跟著 dt 連續走」的實作
    // 會讓上面每一條都綠 —— 而那等於拆掉固定時間步，也就是 FE-W04 談定的東西。
    const physics = { x: 0, z: 0 }
    const state = createRenderMotion({ x: 0, z: 0 })
    const step = constantVelocityStep(physics)

    for (const dt of JITTERY_DTS) advanceRenderMotion(state, dt, step)

    const steps = state.cur.x / (MOVE_SPEED * H)
    expect(steps, `物理位置不是整數個固定步（${steps}）`).toBeCloseTo(Math.round(steps), 9)
  })
})
