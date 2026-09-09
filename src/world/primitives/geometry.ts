import {
  BufferGeometry,
  CapsuleGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  Shape,
  SphereGeometry,
} from 'three'

// 場景元件可用的幾何。規格 `FE-W09-S04`／`S05`。
//
// ⚠️ **快取的鍵是完整的參數，不是「每種 primitive 一份」。**
// 「一份 geometry 再靠縮放共用」是錯的，而且是量出來的：
//
//     把 1×1×1 圓角 0.12 的 geometry 縮放成 (4, 0.2, 4)
//     → X/Z 的圓角變成 0.48，Y 的圓角變成 0.024
//     → **同一個角在三個軸上是三個半徑**，那就是變形
//
// ⚠️⚠️ **回傳的實例是不可變的。**
// `scene.traverse(child => { child.material.envMap = tex })` 這種
// three.js 圈子的標準慣例，在共用實例之上會**無差別污染**每一個使用者。
// 要差異化就用完整的參數另外取一個。
//
// ⚠️ **MUST NOT 對這些實例呼叫 `dispose()`。**
// `world-resources`（`FE-W07`）的管轄是「**建立**它的那一層」，
// 而且它明寫「用 prop 傳進 tree 的物件不是 instance，不在它的管轄內」——
// 這裡回傳的正是那種。
//
// **誤釋放的症狀是「看不出來」**：three.js 會在下一次 render 重新上傳，
// 畫面照樣顯示，只是每次都重傳一次 GPU 資源。這比畫面壞掉更值得防。
//
// ⚠️ 模組層級的快取**今天沒有任何人釋放它**。在 `next dev` 的 HMR 之下
// 模組重新求值會產生新的快取，舊的實例留在記憶體裡。
// 那只影響開發期，而且尚未量測 —— 規格把它列為待答問題，不是需求。

/** 半徑的上界比例。**嚴格小於 0.5** —— 等於 0.5 時內縮後的 shape 是零高度，
 *  `ExtrudeGeometry` 會產生退化幾何（實測 `(4, 0.2, 4)` r=0.1 的 bbox 高度是 0）。 */
const MAX_RADIUS_FRACTION = 0.49

/** 圓角與曲面的細分。實測 `RoundedBox` seg=2 是 132 個頂點（`BoxGeometry` 是 24）。 */
const SEGMENTS = 2

export const PRIMITIVE_SHAPES = ['RoundedBox', 'Capsule', 'Sphere', 'Cylinder'] as const

export type PrimitiveShape = (typeof PRIMITIVE_SHAPES)[number]

/**
 * 幾何的完整規格。**是 discriminated union 不是共用一組 `size`** ——
 * `Sphere` 沒有寬高深，硬塞一組共用參數只會讓呼叫端猜哪幾個欄位有效。
 */
export type GeometrySpec =
  | { readonly shape: 'RoundedBox'; readonly width: number; readonly height: number; readonly depth: number; readonly radius: number }
  | { readonly shape: 'Capsule'; readonly radius: number; readonly length: number }
  | { readonly shape: 'Sphere'; readonly radius: number }
  | { readonly shape: 'Cylinder'; readonly radius: number; readonly height: number }

/**
 * 圓角方塊。three.js 沒有內建，`@react-three/drei` 的版本在內部
 * `useMemo` 建自己的 geometry、自行管理生命週期，**不接受外部傳入的共用實例**
 * —— 跟這裡的快取直接衝突，所以自己寫。
 *
 * 做法是 `ExtrudeGeometry` ＋ bevel。**bevel 會讓成品往外擴 `radius`**，
 * 所以 shape 要先內縮 `2 × radius`；沒有內縮的話 1×1×1 會做出 1.24×1.24×1.0（實測）。
 */
function roundedBox(width: number, height: number, depth: number, requested: number): BufferGeometry {
  const radius = Math.min(requested, Math.min(width, height, depth) * MAX_RADIUS_FRACTION)
  const sw = width - 2 * radius
  const sh = height - 2 * radius
  const sd = depth - 2 * radius

  const shape = new Shape()
  shape.moveTo(-sw / 2, -sh / 2)
  shape.lineTo(sw / 2, -sh / 2)
  shape.lineTo(sw / 2, sh / 2)
  shape.lineTo(-sw / 2, sh / 2)
  shape.closePath()

  const geometry = new ExtrudeGeometry(shape, {
    depth: sd,
    bevelEnabled: true,
    bevelSize: radius,
    bevelThickness: radius,
    bevelSegments: SEGMENTS,
    curveSegments: SEGMENTS,
  })
  // extrude 是從 z=0 往 +z 長的，把它移回以原點為中心
  geometry.translate(0, 0, -sd / 2)
  geometry.computeVertexNormals()
  return geometry
}

function build(spec: GeometrySpec): BufferGeometry {
  switch (spec.shape) {
    case 'RoundedBox':
      return roundedBox(spec.width, spec.height, spec.depth, spec.radius)
    case 'Capsule':
      return new CapsuleGeometry(spec.radius, spec.length, SEGMENTS * 2, SEGMENTS * 4)
    case 'Sphere':
      return new SphereGeometry(spec.radius, SEGMENTS * 8, SEGMENTS * 6)
    case 'Cylinder':
      return new CylinderGeometry(spec.radius, spec.radius, spec.height, SEGMENTS * 8)
  }
}

const cache = new Map<string, BufferGeometry>()

/** 快取的鍵。**每一個影響幾何的參數都要進去** —— 少一個就會有兩個
 *  不同的呼叫拿到同一個實例，而那是靜默的錯誤。 */
function keyOf(spec: GeometrySpec): string {
  switch (spec.shape) {
    case 'RoundedBox':
      return `RoundedBox|${spec.width}|${spec.height}|${spec.depth}|${spec.radius}`
    case 'Capsule':
      return `Capsule|${spec.radius}|${spec.length}`
    case 'Sphere':
      return `Sphere|${spec.radius}`
    case 'Cylinder':
      return `Cylinder|${spec.radius}|${spec.height}`
  }
}

/**
 * 取一個幾何。同一組參數回同一個實例，不同參數回不同實例。
 *
 * ⚠️ **不要 `dispose()` 它，也不要改它的屬性**（見檔頭）。
 */
export function geometryFor(spec: GeometrySpec): BufferGeometry {
  if (!(PRIMITIVE_SHAPES as readonly string[]).includes(spec.shape)) {
    throw new Error(
      `沒有「${String(spec.shape)}」這個 primitive。合法的有：${PRIMITIVE_SHAPES.join('、')}。` +
        '要新增形狀要先改規格 —— 十幾種場景元件各自捏形狀的話，風格會在做的過程中就散掉。',
    )
  }
  const key = keyOf(spec)
  const hit = cache.get(key)
  if (hit !== undefined) return hit
  const made = build(spec)
  cache.set(key, made)
  return made
}
