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
  // ⚠️ **待機時角色垂直靜止（`bounce: 0`）—— 走動穩定。**
  // 以前待機也有 `sin(t)` 的呼吸起伏（幅度 `bounce*0.35 ≈ 0.021` 世界單位）。但在 `dpr 0.25`（角色僅約 30px 高、
  // 眼/嘴只有 1–2px）下，那個**次像素**的每幀移動讓臉部細節一幀落在這格、一幀落在那格 → 洗進洗出、看起來糊且會變化
  // （antialias 關閉後是硬跳）。幅度 `0.021` 遠小於一個 render 像素（≈0.06–0.12 世界單位），所以起伏**本來就幾乎看不見**，
  // 拿掉沒有可見損失，卻換來站定時角色（連同臉、身體邊緣）完全穩定。兩模型（codex／gemini）一致選此法。
  // walk 的起伏不動（移動中本就有位移，殘留抖動可接受）。這些值原本就是「暫定、未被測試釘住、FE-W14 會調」。
  return {
    bounce: 0,
    swing: 0,
  }
}
