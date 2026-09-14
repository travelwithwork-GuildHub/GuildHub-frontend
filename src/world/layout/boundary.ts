import { PHYSICS } from '../physics/world'
import { WORLD_HALF_EXTENT } from './geometry'
import type { LayoutItem } from './types'

// 四面邊界牆。規格 `FE-W11-S06`／`FE-V01-S02`。
//
// ⚠️ **兩個場景吃同一份推導。** Guild Hall 與 Project Room 各自寫一組的話，
// 改了 `halfExtent` 只有一邊會動 —— 另一邊的玩家會走到牆外面。

const HALF = WORLD_HALF_EXTENT
/** 邊界牆比場地長一個厚度，讓四個角接起來。 */
const BOUNDARY_LENGTH = HALF * 2 + PHYSICS.wallThickness
/**
 * 邊界牆的中心。
 *
 * ⚠️ **牆的內側面要貼齊 `±HALF`，所以中心在 `HALF + 厚度/2`。**
 * 把中心放在 `HALF` 的話牆會有一半長在遊玩區域裡面 ——
 * 角色會停在牆的正中間，看起來像半個身體陷進牆裡。
 */
const BOUNDARY_AT = HALF + PHYSICS.wallThickness / 2

export const BOUNDARY_WALLS: readonly LayoutItem[] = [
  { id: 'boundary-north', kind: 'wall', role: 'boundary', x: 0, z: -BOUNDARY_AT, length: BOUNDARY_LENGTH },
  { id: 'boundary-south', kind: 'wall', role: 'boundary', x: 0, z: BOUNDARY_AT, length: BOUNDARY_LENGTH },
  { id: 'boundary-west', kind: 'wall', role: 'boundary', x: -BOUNDARY_AT, z: 0, turns: 1, length: BOUNDARY_LENGTH },
  { id: 'boundary-east', kind: 'wall', role: 'boundary', x: BOUNDARY_AT, z: 0, turns: 1, length: BOUNDARY_LENGTH },
]
