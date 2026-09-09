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
// ⚠️ **`blocks` 今天沒有任何呼叫端。** 把它算成碰撞盒的那一半
//（`footprintOf`、90° 旋轉的轉換、`FE-W10-S05` 的雙向判準）在下一刀，
// 跟第一批真的會擋路的家具一起交 —— **沒有呼叫端的抽象證明不了自己是對的**。
// 這裡先定義它，是因為結構元件的 definition 現在就要寫哪些部件擋路。

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
