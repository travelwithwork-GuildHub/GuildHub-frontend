// 鍵盤輸入 → X／Z 平面的方向。**純函式** —— jsdom 測得到。

/** 畫面方向。世界軸的對應由 `world-camera` 決定：+X 右、+Z 下。 */
export interface Direction {
  /** 世界 X。正值往畫面右。 */
  x: number
  /** 世界 Z。正值往畫面下。 */
  z: number
}

const UP = new Set(['KeyW', 'ArrowUp'])
const DOWN = new Set(['KeyS', 'ArrowDown'])
const LEFT = new Set(['KeyA', 'ArrowLeft'])
const RIGHT = new Set(['KeyD', 'ArrowRight'])

export const MOVEMENT_KEYS = new Set([...UP, ...DOWN, ...LEFT, ...RIGHT])

function anyPressed(pressed: ReadonlySet<string>, keys: ReadonlySet<string>): boolean {
  for (const k of keys) if (pressed.has(k)) return true
  return false
}

/**
 * 目前按著的鍵 → 方向。
 *
 * **同時按下相反的鍵時那個軸是零**，不是任選一邊 ——
 * 任選一邊的話，玩家按住 W 再按 S 會突然往回衝。
 *
 * 畫面「上」是世界 −Z（相機在 +Z 側往回看，見 `world-camera`）。
 */
export function directionFromKeys(pressed: ReadonlySet<string>): Direction {
  const up = anyPressed(pressed, UP) ? 1 : 0
  const down = anyPressed(pressed, DOWN) ? 1 : 0
  const left = anyPressed(pressed, LEFT) ? 1 : 0
  const right = anyPressed(pressed, RIGHT) ? 1 : 0

  return { x: right - left, z: down - up }
}
