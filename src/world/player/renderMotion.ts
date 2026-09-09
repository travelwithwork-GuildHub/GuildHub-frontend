import { planSteps } from '@/world/physics/accumulator'
import { PHYSICS } from '@/world/physics/world'

// 畫面位置與物理位置之間那一層。規格 `FE-W03`「畫面上的位置與影格率無關」。
//
// ⚠️ **為什麼需要這一層**（design 的 M1，量出來的）：
// 物理走固定時間步（1/60），render 的節拍跟它**永遠對不齊**。
// 直接把 rigid body 的位置畫出去的話，每一幀走的步數是 0、1 或 2 ——
// 實測 120 幀裡 35 幀完全沒動、18 幀跳兩格，佔 44%。
// 畫面一直是 60 fps，掉的不是幀，是**位移的均勻性**。
//
// 解法是標準的 render interpolation：畫在**前一個**與**目前**的物理位置之間，
// 比例是累加器裡還沒消化的時間佔一個固定步的比例。
//
// 代數上（design 的 M2，可以手算）：
//
//     畫面位置 = prev + (cur − prev)·α
//              = v·h·(N−1) + v·h·(T/h − N)
//              = v·T − v·h
//
// **畫面位置是「真實位置延後剛好一個固定步」的線性函數**，
// 所以逐幀的 `畫面位移 / dt` 恆等於速度 —— 不是近似，是恆等。
// 那條恆等式就是 `FE-W03-S14` 的判準。
//
// ⚠️ **這不是一個新發明。** `@react-three/rapier` 的 `<Physics>` 內建同一件事
//（`interpolation` prop，預設開啟，`timeStep` 預設 1/60）——
// 把 mesh 掛成 `<RigidBody>` 的子物件，它就會替你插值。
// 我們沒有走那條路：`FE-W04` 談定的是**自己持有 Rapier world**、
// 角色是 kinematic 而且由 `LocalPlayer` 手動推進，
// 所以 mesh 的 transform 也由我們自己寫 —— 那一層的插值也就要自己做。
//
// **這裡不是在說那個決定是錯的**，是在說它有一個沒有被寫下來的代價，
// 而那個代價就是這個檔案。`package.json` 目前還留著 `@react-three/rapier`
// 這個沒有人 import 的相依 —— 要嘛用它，要嘛拿掉，那是另一個決定。

export interface Position {
  x: number
  z: number
}

export interface RenderMotion {
  /** 還沒被消化成固定步的時間。 */
  accumulator: number
  /** 上一個物理步之後的位置。 */
  prev: Position
  /** 最新一個物理步之後的位置。**送給網路層的是這個，不是畫面位置。** */
  cur: Position
}

/**
 * 跑**一個**固定步，回傳新的物理位置。
 *
 * ⚠️ **這是唯一被替換的東西。** 正式碼傳的是「呼叫 Rapier 的 character
 * controller 再讀 `translation()`」；測試傳一個等速位移的。
 *
 * 被換掉的是「一步怎麼走」，**不是「幾步、畫在哪」** ——
 * 而後者正是會抖的那一半，測試打的就是它（design 的 D6）。
 */
export type StepOnce = () => Position

export function createRenderMotion(start: Position): RenderMotion {
  return {
    accumulator: 0,
    prev: { x: start.x, z: start.z },
    cur: { x: start.x, z: start.z },
  }
}

/**
 * 推進一幀，回傳**畫面上**該畫的位置。
 *
 * `state` 被就地改寫 —— 每幀配置一個新的狀態物件是沒有意義的分配。
 * 回傳值是新物件，跟 `displacement()` 一致。
 *
 * ⚠️ **MUST NOT 改成直接回傳 `state.cur`。** 那就是這個模組存在之前的行為，
 * 而 `FE-W03-S14` 會立刻紅（速率變成 0 或 2 倍）。
 */
export function advanceRenderMotion(state: RenderMotion, dt: number, stepOnce: StepOnce): Position {
  const plan = planSteps(state.accumulator, dt)
  state.accumulator = plan.remainder

  for (let i = 0; i < plan.steps; i++) {
    state.prev.x = state.cur.x
    state.prev.z = state.cur.z
    const next = stepOnce()
    state.cur.x = next.x
    state.cur.z = next.z
  }

  // 站著不動時 `prev` 與 `cur` 相等，所以這個比例乘上零 ——
  // `FE-W03-S16`（放開按鍵之後不得繼續漂）因此是**結構上**成立的，
  // 不是靠一個額外的 if。
  const alpha = plan.remainder / PHYSICS.fixedStep
  return {
    x: state.prev.x + (state.cur.x - state.prev.x) * alpha,
    z: state.prev.z + (state.cur.z - state.prev.z) * alpha,
  }
}
