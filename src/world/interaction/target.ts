import { FACING, type Facing } from '@/world/coords'

// 誰是目前的互動目標。規格 `FE-W06`。
//
// ⚠️ **這個模組刻意不 import React 也不 import three** ——
// 跟 `world/physics/world.ts` 同一個理由：這樣它在 jsdom 裡完全驗得到，
// 而這一層的錯誤（選錯目標、提示閃爍）本來就是純邏輯的錯。

/** 朝向 → 世界平面上的單位方向。**編碼由 `coords.ts` 決定，不要在這裡重寫判斷。** */
const FACING_DIRECTION: Record<Facing, { x: number; z: number }> = {
  [FACING.down]: { x: 0, z: 1 },
  [FACING.left]: { x: -1, z: 0 },
  [FACING.right]: { x: 1, z: 0 },
  [FACING.up]: { x: 0, z: -1 },
}

/** 一個可互動的物件。**id 是穩定鍵**，`label` 是提示上要出現的名字。 */
export interface InteractableEntry {
  id: string
  x: number
  z: number
  label: string
}

export interface PlayerPose {
  x: number
  z: number
  f: Facing
}

export interface TargetTuning {
  /** 互動範圍的半徑（世界單位）。超過這個距離的不列入候選。 */
  range: number
  /**
   * 朝向在分數裡的權重。
   *
   * ⚠️ **它有上界，而且上界是算出來的。** 分數是
   * `facingWeight × 對齊度 + 接近度`，其中對齊度 ∈ [-1, 1]、接近度 ∈ [0, 1]。
   * 「貼著 A 但面向遠處的 B 時應該選 A」這個判準給出一條不等式 ——
   * 見 `TUNING` 的說明。權重太大的話，站在一個物件正上方也會選到遠處那個。
   */
  facingWeight: number
  /**
   * 切換目標需要的分數優勢（遲滯）。
   *
   * ⚠️ **這一項防的不是「不決定性」，是「閃爍」。** 平手時用 id 決斷可以保證
   * 同樣的輸入得到同樣的輸出 —— 但使用者站在兩個物件的等分數線上時，
   * 位置每幀都在動，輸入本來就不一樣，分數會在兩側來回。
   */
  hysteresis: number
}

export interface TargetResult {
  id: string | null
  /**
   * 到 active target 的距離（世界單位）。
   *
   * ⚠️ **沒有目標時是 `null`，不是 `0`。** `0` 是最糟的預設值：
   * 下游寫 `if (distance < 1)` 的人會在「沒有目標」時得到「貼在旁邊」（規格 `FE-W06-S07`）。
   */
  distance: number | null
}

/**
 * 選出唯一一個 active target。
 *
 * 規則（規格 `FE-W06-S01`～`S05`）：
 *
 * 1. 距離超過 `range` 的不列入候選
 * 2. 分數 = `facingWeight × 對齊度 + 接近度`；**朝向優先於距離**
 * 3. 目前的目標額外得到 `hysteresis` 的加成 —— 新的候選要贏過它才換
 * 4. 分數完全相同時，**id 小的贏**（決定性）
 *
 * **背後的物件不硬性排除。** 排除的話，站在兩個物件中間轉身時會出現
 * 「兩邊都沒有目標」的空窗；讓它進分數、由分數輸掉就好。
 */
export function chooseTarget(
  player: PlayerPose,
  candidates: Iterable<InteractableEntry>,
  current: string | null,
  tuning: TargetTuning,
): TargetResult {
  const facing = FACING_DIRECTION[player.f]
  let bestId: string | null = null
  let bestScore = Number.NEGATIVE_INFINITY
  let bestDistance = 0

  for (const entry of candidates) {
    const dx = entry.x - player.x
    const dz = entry.z - player.z
    const distance = Math.hypot(dx, dz)
    if (distance > tuning.range) continue

    // 站在物件正上方時沒有方向可言 —— 當成「完全對齊」，
    // 而不是除以零得到 NaN（NaN 會讓下面每一個比較都是 false，
    // 症狀是「站上去反而沒有目標」）。
    const alignment = distance === 0 ? 1 : (dx * facing.x + dz * facing.z) / distance
    const proximity = 1 - distance / tuning.range
    let score = tuning.facingWeight * alignment + proximity
    if (entry.id === current) score += tuning.hysteresis

    // `>` 而不是 `>=`：平手時不換人。平手的決勝在下一行，用 id ——
    // 兩個都寫才是決定性的（只有 `>` 的話，結果取決於候選被走訪的順序，
    // 而那個順序是 Map 的插入順序，也就是誰先掛載）。
    if (score > bestScore || (score === bestScore && bestId !== null && entry.id < bestId)) {
      bestId = entry.id
      bestScore = score
      bestDistance = distance
    }
  }

  return { id: bestId, distance: bestId === null ? null : bestDistance }
}
