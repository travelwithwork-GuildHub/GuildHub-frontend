import type { GeometrySpec } from '../primitives/geometry'
import type { MaterialSpec } from '../primitives/material'

// 場景元件的描述。規格 `FE-W10-S02`／`S04`／`S05`／`S06`／`S07`。
//
// **三類元件（結構／家具／語意）共用這一種描述** —— 結構與語意元件從自己的
// props 算出一份，家具直接寫成常數表。只有一種描述，下面那條碰撞判準才會
// 對三類一致地成立。
//
// ⚠️ **這裡不建立任何 GPU 資源，也不建立任何碰撞體。**
// 幾何與材質是**規格**（傳給 `geometryFor`／`materialFor` 的參數）。
//
// 碰撞是**局部座標的一個盒子**，要不要註冊進物理世界是 `FE-W11` 的事。

export interface PartDefinition {
  readonly geometry: GeometrySpec
  readonly material: MaterialSpec
  /** 相對於元件原點。 */
  readonly position: readonly [number, number, number]
  /** 繞 Y 軸旋轉（弧度）。**擋路的部件只允許 90° 的整數倍**，見 `blocks`。 */
  readonly rotationY?: number
  /**
   * 這個部件擋不擋路。**省略＝不擋。**
   *
   * 盆栽的葉片、燈罩、招牌的板子都不該擋 —— 標了的話玩家會在離樹幹
   * 還有一段距離的空氣中被擋住。
   */
  readonly blocks?: boolean
  /** 省略＝投射陰影。平貼地面的東西（地板、地毯）設 `false`。 */
  readonly castShadow?: boolean
  /** 省略＝接收陰影。 */
  readonly receiveShadow?: boolean
}

export interface PropDefinition {
  readonly parts: readonly PartDefinition[]
}
/** 局部座標的碰撞盒。**沒有世界座標** —— 元件不知道自己會被放在哪裡。 */
export interface BoxFootprint {
  readonly offsetX: number
  readonly offsetZ: number
  readonly halfWidth: number
  readonly halfDepth: number
  readonly halfHeight: number
}

/** 一個幾何在自己的原點上佔的半尺寸（未旋轉）。 */
function halfExtentsOf(spec: GeometrySpec): [number, number, number] {
  switch (spec.shape) {
    case 'RoundedBox':
      return [spec.width / 2, spec.height / 2, spec.depth / 2]
    case 'Capsule':
      // `CapsuleGeometry(radius, length)` 的總高是 `length + 2 × radius`。
      return [spec.radius, spec.length / 2 + spec.radius, spec.radius]
    case 'Sphere':
      return [spec.radius, spec.radius, spec.radius]
    case 'Cylinder':
      return [spec.radius, spec.height / 2, spec.radius]
  }
}

const QUARTER = Math.PI / 2

/**
 * 把弧度換成 90° 的圈數（0–3）。**不是整數倍就拋錯。**
 *
 * 規格：靜態阻擋物的旋轉只支援 90° 的整數倍。任意角度只有兩條路 ——
 * 擴充碰撞介面，或退化成軸對齊的包圍盒（碰撞盒比視覺大，那就是「撞到空氣」）。
 * 靜默接受一個 30° 會讓碰撞盒悄悄長大，**而畫面上看起來完全正常**。
 */
export function quarterTurnsOf(rotationY: number): number {
  const turns = rotationY / QUARTER
  const rounded = Math.round(turns)
  if (Math.abs(turns - rounded) > 1e-9) {
    throw new RangeError(
      `擋路的部件只能旋轉 90° 的整數倍，收到 ${rotationY} 弧度（${(rotationY * 180) / Math.PI}°）。` +
        '任意角度需要可旋轉的碰撞描述，那還沒有 —— 見 FE-W10 的 design D2。',
    )
  }
  return ((rounded % 4) + 4) % 4
}

/**
 * 一個元件的局部碰撞盒：**所有擋路部件套用各自 transform 之後的 AABB 聯集**。
 * 沒有擋路的部件時回 `undefined`。
 *
 * ⚠️ **聯集是一個盒子，所以部件之間的空隙會被填滿** —— 四隻桌腳的聯集
 * 就是整張桌子的佔地，玩家不能從桌子底下穿過去。
 * **那是單盒碰撞模型的限制，不是這個函式算錯。**
 */
export function footprintOf(def: PropDefinition): BoxFootprint | undefined {
  let minX = Infinity, maxX = -Infinity
  let minY = Infinity, maxY = -Infinity
  let minZ = Infinity, maxZ = -Infinity
  let found = false

  for (const part of def.parts) {
    if (part.blocks !== true) continue
    found = true
    const [hx, hy, hz] = halfExtentsOf(part.geometry)
    const turns = quarterTurnsOf(part.rotationY ?? 0)
    // 90°／270° 時 X 與 Z 的半尺寸互換。
    const [ex, ez] = turns % 2 === 0 ? [hx, hz] : [hz, hx]
    const [px, py, pz] = part.position
    minX = Math.min(minX, px - ex); maxX = Math.max(maxX, px + ex)
    minY = Math.min(minY, py - hy); maxY = Math.max(maxY, py + hy)
    minZ = Math.min(minZ, pz - ez); maxZ = Math.max(maxZ, pz + ez)
  }

  if (!found) return undefined
  return {
    offsetX: (minX + maxX) / 2,
    offsetZ: (minZ + maxZ) / 2,
    halfWidth: (maxX - minX) / 2,
    halfDepth: (maxZ - minZ) / 2,
    halfHeight: (maxY - minY) / 2,
  }
}

/**
 * 把碰撞盒轉 90° 的整數倍。繞 Y 軸轉 +90° 時 `(x, z) → (z, -x)`。
 *
 * `FE-W11` 擺放家具時用它。**這裡不產生世界座標** —— 呼叫端再加上 instance 的位置。
 */
export function rotateFootprint(box: BoxFootprint, turns: number): BoxFootprint {
  const t = ((Math.round(turns) % 4) + 4) % 4
  const { offsetX: x, offsetZ: z } = box
  const offset: [number, number] =
    t === 0 ? [x, z] : t === 1 ? [z, -x] : t === 2 ? [-x, -z] : [-z, x]
  const swapped = t % 2 === 1
  return {
    offsetX: offset[0],
    offsetZ: offset[1],
    halfWidth: swapped ? box.halfDepth : box.halfWidth,
    halfDepth: swapped ? box.halfWidth : box.halfDepth,
    halfHeight: box.halfHeight,
  }
}
