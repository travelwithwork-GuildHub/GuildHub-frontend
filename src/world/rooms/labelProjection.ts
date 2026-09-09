import { screenHalfExtents, toScreen } from '../layout/framing'

// 世界座標 → 畫面像素。規格 `FE-W12-S10`／`S11`／`S12`／`S13`。
//
// ⚠️⚠️ **這裡不是「另一份投影公式」。** `sx`／`sy` 走 `framing.ts` 的 `toScreen`
// ——那是構圖判準用的同一份。兩份會漂，而漂掉的症狀是
// 「測試說看得到，畫面上卻歪了」。
//
// ⚠️ **長寬比是執行期真正的比例**，不是 `FRAMING_ASPECT`。
// 那個常數只有測試用（網頁的視窗比例完全不可控：超寬螢幕、直向、分割視窗）。

/**
 * 標籤的固定尺寸（CSS 像素）。
 *
 * ⚠️⚠️ **固定寬度是一條產品決定，不是排版偷懶。**
 * 名稱的長度由後端決定 —— 讓它影響版面等於把版面交給不可控的輸入。
 * 過長的名字**截字**，MUST NOT 把相鄰的標籤擠開（規格 `FE-W12-S12`）。
 *
 * ⚠️ **測試從這裡讀，不得抄一份數字。**
 */
export const LABEL_SIZE = { width: 168, height: 34 } as const

/**
 * 最小支援的畫面尺寸。
 *
 * 「排滿的標籤兩兩不相交」這句話要有意義，就得指定在**哪一個尺寸**下成立 ——
 * 不指定的話判準會隨測試環境漂移，或者直接恆真（畫面越大越不會擠）。
 */
export const MIN_VIEWPORT = { width: 320, height: 480 } as const

export interface Viewport {
  readonly width: number
  readonly height: number
}

export interface LabelRect {
  /** 標籤左上角（CSS 像素）。 */
  readonly left: number
  readonly top: number
}

/**
 * 一個世界座標點的標籤該放在哪。**`null` 代表它在畫面外。**
 *
 * ⚠️ **畫面外要回 `null`，不能靠「它自己會跑出去」。**
 * 絕對定位的元素跑到容器外面仍然在 DOM 與無障礙樹裡 ——
 * 螢幕閱讀器會念出一個看不到的東西（規格 `FE-W12-S13`）。
 */
export function labelRectFor(
  point: { x: number; y: number; z: number },
  target: { x: number; z: number },
  viewport: Viewport,
): LabelRect | null {
  const { sx, sy } = toScreen(point, target)
  const { halfWidth, halfHeight } = screenHalfExtents(viewport.width / viewport.height)

  // 螢幕的 y 往下增加，相機空間的 sy 往上增加 —— 所以是減號。
  const centerX = viewport.width / 2 + (sx / halfWidth) * (viewport.width / 2)
  const centerY = viewport.height / 2 - (sy / halfHeight) * (viewport.height / 2)

  const left = centerX - LABEL_SIZE.width / 2
  const top = centerY - LABEL_SIZE.height
  const outside =
    left + LABEL_SIZE.width < 0 ||
    left > viewport.width ||
    top + LABEL_SIZE.height < 0 ||
    top > viewport.height
  return outside ? null : { left, top }
}

/**
 * 兩個標籤重不重疊。
 *
 * ⚠️⚠️ **判定是「兩個矩形不相交」，不是「中心點的距離大於寬度」** ——
 * 後者不足以證明兩個矩形沒有重疊（審查時被指出過）。
 */
export function labelsOverlap(a: LabelRect, b: LabelRect): boolean {
  return (
    Math.abs(a.left - b.left) < LABEL_SIZE.width && Math.abs(a.top - b.top) < LABEL_SIZE.height
  )
}
