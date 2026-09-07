import type { Direction } from './input'

// 移動。**純函式** —— 速度限制與影格率無關性都測得到。

/**
 * ⚠️ **暫定值，而且沒有測試釘住**（design.md 的 D3／R3）。
 * 它是手感係數，`FE-W08`（正式 Avatar）與 `FE-W14`（VisualPolish）會調。
 *
 * 對照 `coords.ts` 的 `PIXELS_PER_UNIT`：那個是單位定義，**有**測試釘住。
 */
export const MOVE_SPEED = 4 // 世界單位／秒

/**
 * 把方向正規化成單位長度。零向量回零向量。
 *
 * **不正規化的話對角線會快約 41%** —— 那是遊戲開發最常見的 bug 之一，
 * 而且看得出來但很少有人查得出來：玩家只會覺得「斜著走比較快」。
 */
export function normalize(dir: Direction): Direction {
  const len = Math.hypot(dir.x, dir.z)
  if (len === 0) return { x: 0, z: 0 }
  return { x: dir.x / len, z: dir.z / len }
}

/**
 * 位移。與影格率無關 —— 距離只跟 `dt` 成正比，不跟呼叫次數有關。
 */
export function displacement(dir: Direction, dt: number, speed = MOVE_SPEED): Direction {
  if (!Number.isFinite(dt)) {
    throw new RangeError(`時間間隔不是有限數值（${dt}）。`)
  }
  if (dt <= 0) return { x: 0, z: 0 }
  const unit = normalize(dir)
  return { x: unit.x * speed * dt, z: unit.z * speed * dt }
}

/** 目前的速率（世界單位／秒）。動畫狀態靠它判斷。 */
export function speedOf(dir: Direction, speed = MOVE_SPEED): number {
  return Math.hypot(dir.x, dir.z) === 0 ? 0 : speed
}
