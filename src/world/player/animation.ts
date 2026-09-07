// Idle／Walk 的程式動畫。**沒有任何外部動畫檔案。**

export type AnimationState = 'idle' | 'walk'

/**
 * ⚠️ **暫定值，而且沒有測試釘住**（design.md 的 D3／R3）。
 * `FE-W08`（正式 Avatar）與 `FE-W14`（VisualPolish）會調。
 */
export const ANIMATION = {
  /** Walk 一個完整週期的秒數。 */
  walkPeriod: 0.6,
  /** Idle 呼吸一個完整週期的秒數。 */
  idlePeriod: 2.4,
  /** 身體上下起伏的幅度（世界單位）。 */
  bounce: 0.06,
  /** 手腳擺動的最大角度（弧度）。 */
  swing: 0.7,
} as const

export function animationStateFor(speed: number): AnimationState {
  return speed > 0 ? 'walk' : 'idle'
}

/**
 * 推進動畫相位。
 *
 * **相位是累積的，切換狀態時不重置** —— 重置的話 Idle↔Walk 的那一幀
 * 手腳會瞬間跳到別的位置。用 `performance.now()` 也會有同樣的問題，
 * 而且測試要 mock 時間。
 *
 * 回傳的相位落在 `[0, 1)`。
 */
export function advancePhase(phase: number, dt: number, state: AnimationState): number {
  if (!Number.isFinite(dt)) {
    throw new RangeError(`時間間隔不是有限數值（${dt}）。`)
  }
  if (!Number.isFinite(phase)) {
    throw new RangeError(`動畫相位不是有限數值（${phase}）。`)
  }
  if (dt <= 0) return phase
  const period = state === 'walk' ? ANIMATION.walkPeriod : ANIMATION.idlePeriod
  const next = phase + dt / period
  return next - Math.floor(next)
}

/** 目前相位下的身體起伏、手腳擺動角度。 */
export function poseAt(phase: number, state: AnimationState) {
  const t = phase * Math.PI * 2
  if (state === 'walk') {
    return {
      // 走路時一個週期起伏兩次（左右腳各一次）
      bounce: Math.abs(Math.sin(t)) * ANIMATION.bounce,
      swing: Math.sin(t) * ANIMATION.swing,
    }
  }
  return {
    bounce: Math.sin(t) * ANIMATION.bounce * 0.35,
    swing: 0,
  }
}
