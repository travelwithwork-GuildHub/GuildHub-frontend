import { PHYSICS } from './world'

// 固定時間步的累積器。**純函式** —— 寫錯會變成「影格率高時物理跑得快」，
// 而那不會有錯誤訊息（design.md 的 R2）。

export interface StepPlan {
  /** 這一幀要跑幾個物理步。 */
  steps: number
  /** 剩下不足一步的時間，留到下一幀。 */
  remainder: number
}

/**
 * 累積 render 的 `dt`，算出這一幀該跑幾個固定步。
 *
 * `maxStepsPerFrame` 是保護：分頁切回前景時 `dt` 可能是好幾秒，
 * 不設上限會一次追一萬步然後卡住。**被上限砍掉的時間直接丟棄，不累積** ——
 * 累積的話下一幀會再爆一次，然後永遠追不上。
 */
export function planSteps(accumulated: number, dt: number): StepPlan {
  if (!Number.isFinite(dt) || !Number.isFinite(accumulated)) {
    throw new RangeError(`時間不是有限數值（accumulated=${accumulated}, dt=${dt}）。`)
  }
  const total = accumulated + Math.max(0, dt)
  const wanted = Math.floor(total / PHYSICS.fixedStep)
  const steps = Math.min(wanted, PHYSICS.maxStepsPerFrame)
  const remainder = steps === wanted ? total - wanted * PHYSICS.fixedStep : 0
  return { steps, remainder }
}
