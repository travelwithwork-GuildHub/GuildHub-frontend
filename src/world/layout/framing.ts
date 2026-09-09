import { CAMERA_DEFAULTS, orthoFrustum } from '../camera'
import type { StaticBox } from '../physics/world'

// 固定相機下的構圖。規格 `FE-W11-S12`／`S13`／`S14`。
//
// ⚠️ **一律用正交投影算，不用像素比對。** 這個 repo 還沒有決定 3D 的視覺回歸
// 怎麼做（`FE-O13`），而截圖比對會把「構圖對不對」跟「顏色差一階」綁在一起。
//
// ⚠️ **長寬比要固定。** 不固定的話判準會隨測試環境漂移，或者直接恆真
//（畫面越寬看得越多，於是「看得到」永遠成立）。
//
// **相機的基底**（從 `CAMERA_DEFAULTS.offset` 推出來，不是抄的）：
// 相機在目標的 `(0, 12, 12)`，往回看 —— 俯角 45°。
//   right = (1, 0, 0)
//   up    = (0, √2/2, -√2/2)
// 所以螢幕座標是
//   sx = px - tx
//   sy = (py - pz + tz) × √2/2
// **高度與 -Z 對螢幕縱向的貢獻一樣大** —— 一個 2 單位高的看板，
// 在畫面上等於往北多站 2 個單位。這就是為什麼看板容易「頭超出畫面」。

/**
 * **驗證用**的長寬比。固定值 —— 見檔頭。
 *
 * ⚠️ **只有測試用它。** 產品那一邊（地板要鋪多大）**必須用執行期真正的長寬比** ——
 * 網頁的視窗比例完全不可控（超寬螢幕、直向、分割視窗），
 * 寫死 16:9 的話那些情況一定會看到世界的盡頭。
 */
export const FRAMING_ASPECT = 16 / 9

export interface ScreenPoint {
  readonly sx: number
  readonly sy: number
}

const SQRT_HALF = Math.SQRT1_2

/** 世界座標 → 螢幕座標（相機空間的單位，不是像素）。 */
export function toScreen(
  point: { x: number; y: number; z: number },
  target: { x: number; z: number },
): ScreenPoint {
  return {
    sx: point.x - target.x,
    sy: (point.y - point.z + target.z) * SQRT_HALF,
  }
}

/** 畫面的半寬與半高（相機空間）。 */
export function screenHalfExtents(aspect = FRAMING_ASPECT) {
  const { top, right } = orthoFrustum(aspect, CAMERA_DEFAULTS.viewHeight)
  return { halfWidth: right, halfHeight: top }
}

/** 一個世界座標點在不在畫面內。 */
export function isOnScreen(
  point: { x: number; y: number; z: number },
  target: { x: number; z: number },
  aspect = FRAMING_ASPECT,
): boolean {
  const { sx, sy } = toScreen(point, target)
  const { halfWidth, halfHeight } = screenHalfExtents(aspect)
  return Math.abs(sx) <= halfWidth && Math.abs(sy) <= halfHeight
}

/** 一個碰撞盒的八個角（用 `halfHeight` 當高度，底面在 y = 0）。 */
function corners(box: StaticBox): { x: number; y: number; z: number }[] {
  const h = (box.halfHeight ?? 0) * 2
  const out: { x: number; y: number; z: number }[] = []
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      for (const y of [0, h]) {
        out.push({ x: box.x + sx * box.halfWidth, y, z: box.z + sz * box.halfDepth })
      }
    }
  }
  return out
}

/** 一個碰撞盒**整個**在畫面內。 */
export function boxOnScreen(
  box: StaticBox,
  target: { x: number; z: number },
  aspect = FRAMING_ASPECT,
): boolean {
  return corners(box).every((c) => isOnScreen(c, target, aspect))
}

/**
 * 從相機到角色的視線有沒有被某個盒子擋住。
 *
 * ⚠️ **不是「角色 +Z 一定距離內不得有高物件」那種粗略規則。**
 * 相機同時有 Y 與 Z 位移，遮擋取決於高度與距離的組合 ——
 * 一個 0.4 高的平台在 0.5 單位外不會擋住，一個 2 高的牆在 2 單位外會。
 *
 * 做法：沿著相機到角色胸口的線段取樣，看有沒有落在某個盒子裡面。
 * 取樣步長比最薄的牆（0.5）小一個量級，不會跳過去。
 */
export function occluders(
  stance: { x: number; z: number },
  boxes: readonly StaticBox[],
  chestHeight = 1,
  /**
   * 忽略比這個窄的東西（水平、垂直於視線方向的寬度）。
   *
   * ⚠️ **相機看的方向是 -Z，所以「垂直於視線」的水平軸是 X。**
   *
   * 省略＝一律不忽略（代表站位用這個，那幾個點是設計上保證看得清楚的地方）。
   * 掃整個可走區域時傳角色的直徑：**一根 0.08 寬的旗桿不構成「遮住角色」**
   * —— 它只蓋掉一條縫。硬要求「連細桿都不能在視線上」的話，
   * 判準會逼人把所有立柱貼到牆上，而那不是產品問題。
   */
  minWidth = 0,
): number[] {
  const camera = {
    x: stance.x + CAMERA_DEFAULTS.offset.x,
    y: CAMERA_DEFAULTS.offset.y,
    z: stance.z + CAMERA_DEFAULTS.offset.z,
  }
  const chest = { x: stance.x, y: chestHeight, z: stance.z }
  const STEPS = 400
  const hit = new Set<number>()
  for (let i = 1; i < STEPS; i += 1) {
    const t = i / STEPS
    const p = {
      x: camera.x + (chest.x - camera.x) * t,
      y: camera.y + (chest.y - camera.y) * t,
      z: camera.z + (chest.z - camera.z) * t,
    }
    for (const [index, box] of boxes.entries()) {
      if (box.halfWidth * 2 < minWidth) continue
      const h = (box.halfHeight ?? 0) * 2
      if (p.y < 0 || p.y > h) continue
      if (Math.abs(p.x - box.x) > box.halfWidth) continue
      if (Math.abs(p.z - box.z) > box.halfDepth) continue
      hit.add(index)
    }
  }
  return [...hit].sort((a, b) => a - b)
}

/**
 * 視覺地板要延伸到多遠，畫面上才不會看到世界外面。
 *
 * **從相機投影到地面的範圍推導**，不是隨手挑一個常數 ——
 * 相機參數改的那天，隨手挑的常數會靜默失效。
 *
 * 螢幕角落反投影到地面的偏移是：X 方向 `halfWidth`、Z 方向 `halfHeight × √2`。
 * 取兩者的大值，加上角色走得到的最遠位置。
 */
export function groundOverscan(reachableHalf: number, aspect = FRAMING_ASPECT): number {
  const { halfWidth, halfHeight } = screenHalfExtents(aspect)
  const exact = reachableHalf + Math.max(halfWidth, halfHeight * Math.SQRT2)
  // ⚠️ **量化到整數單位。** 這個值會變成 `geometryFor` 的快取鍵，
  // 而視窗每拉一個像素長寬比就變一次 —— 不量化的話，
  // 拉一次視窗就在快取裡留下一份新的地板幾何（`FE-W07` 在看的正是這種成長）。
  return Math.ceil(exact)
}
