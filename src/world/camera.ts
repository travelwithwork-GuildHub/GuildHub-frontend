/** 可寫的三維座標。`three` 的 `Vector3Like` 是唯讀的，而 target 要每幀被寫入。 */
export interface MutableVector3 {
  x: number
  y: number
  z: number
}

// 相機的平滑與方位。**平滑是純函式** —— 這一項的核心邏輯不需要瀏覽器就測得到。

/**
 * ⚠️ 這兩個是**暫定值**，`FE-W14`（VisualPolish）會調。
 *
 * **它們沒有任何測試釘住** —— 這是刻意的（design.md 的 D4／R1）：
 * 它們是視覺選擇，不是單位定義。寫死在 Requirement 的話，
 * `FE-W14` 調整構圖時就得回來打破這份規格。
 *
 * 對照 `coords.ts` 的 `PIXELS_PER_UNIT`：**那個有測試釘住**，
 * 因為它是單位定義，沒有待發現的正確值。兩者不同類。
 */
export const CAMERA_DEFAULTS = {
  /**
   * orthographic 垂直可見的世界高度。
   *
   * 12 是實際看畫面調出來的：一開始寫 20，地板只佔畫面七成、方塊小得像顆沙 ——
   * `FE-W03` 的 Chibi 角色約 1.6 個世界單位，在 20 的可見高度下只有畫面的 8%，
   * 那一項會做不下去。
   */
  viewHeight: 12,
  /** 相機相對 target 的偏移。**Y 與 Z 都必須是正的** —— 見 `cameraOffset`。 */
  offset: { x: 0, y: 12, z: 12 },
  /** 平滑的半衰期（秒）。 */
  halfLife: 0.12,
} as const

/**
 * 相機相對 target 的偏移：**上方且 +Z 側**。
 *
 * 這個方位不是美觀選擇，是 `world-coordinates` 那份對映的**視覺依據**：
 * 相機在 target 的 +Z 側往回看，所以世界的 +Z 出現在**畫面下方**、
 * +X 出現在**畫面右方**。
 *
 * **把 Z 偏移改成負的，`FE-W02` 的整個對映就跟畫面反過來** ——
 * 而兩邊各自的單元測試都會是綠的。
 */
export function cameraOffset(): MutableVector3 {
  return { ...CAMERA_DEFAULTS.offset }
}

/**
 * 與影格率無關的衰減係數。
 *
 * **不要用「每幀乘一個固定係數」那種寫法**（`pos += (target - pos) * 0.1`）：
 * 那個 `0.1` 是每幀的比例，在 120 Hz 的機器上會比 60 Hz 快一倍，
 * 而且沒有任何東西會告訴你。
 *
 * 半衰期的定義讓它可以被釘死：`dt` 等於一個半衰期時，係數剛好是 `0.5`。
 *
 * `dt` 極大時（分頁切回前景）係數趨近 `1` —— 相機收斂到 target
 * 而不會越過它。那是這個公式自帶的性質。
 */
export function dampFactor(dt: number, halfLife: number): number {
  if (!Number.isFinite(dt)) {
    throw new RangeError(`時間間隔不是有限數值（${dt}）。`)
  }
  if (!Number.isFinite(halfLife) || halfLife <= 0) {
    throw new RangeError(`半衰期必須是正的有限數值（${halfLife}）。`)
  }
  if (dt <= 0) return 0
  return 1 - 2 ** (-dt / halfLife)
}

/** 把 `current` 朝 `target` 平滑一步。回傳新的值。 */
export function damp(current: number, target: number, dt: number, halfLife: number): number {
  return current + (target - current) * dampFactor(dt, halfLife)
}

/**
 * orthographic 的視錐體：**垂直可見範圍固定，水平隨長寬比**。
 *
 * 視窗變寬時看到更多左右，而不是把世界拉扁。
 */
export function orthoFrustum(aspect: number, viewHeight: number) {
  if (!Number.isFinite(aspect) || aspect <= 0) {
    throw new RangeError(`長寬比必須是正的有限數值（${aspect}）。`)
  }
  const halfHeight = viewHeight / 2
  const halfWidth = halfHeight * aspect
  return { left: -halfWidth, right: halfWidth, top: halfHeight, bottom: -halfHeight }
}
