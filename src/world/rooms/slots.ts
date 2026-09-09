import { rotateFootprint, visualBoundsOf } from '../environment/definition'
import { doorDefinition } from '../environment/semantic'
import { ZONES } from '../layout/guildHallLayout'
import type { LayoutItem, QuarterTurn, Zone } from '../layout/types'

// 走廊上門的槽位。規格 `FE-W12-S06`／`S07`／`S08`。
//
// ⚠️⚠️ **座標是算出來的，不是寫死的。**
// 這一份跟 `FE-W11` 的走廊分區之間是**推導關係** —— 有人把走廊挪了，
// 門要跟著走。寫死 `-2 / 0 / 2 / 4 / 6 / 8` 的話兩邊會脫鉤，
// 而脫鉤的症狀是「門留在原地穿牆」，不是「有人忘了改一個數字」。
//
// ⚠️ **容量也是算出來的。** `FE-W11` 明文拒絕在分區上帶 `capacity`
//（「今天沒有讀取者」）—— 那個「今天」就是現在，所以推導寫在這一邊。
//
// **座標系**：+X 在畫面右方、+Z 在畫面下方。走廊在西側（x 為負），
// 門沿著它的長邊（z）排開，貼著西緣。

/**
 * 門的朝向：**面朝南（+Z），也就是朝著相機**。
 *
 * ⚠️⚠️ **不是「面朝走廊裡的人」。** 第一版是 `turns: 1`（面朝東，貼著西牆），
 * 那在語意上比較對 —— 但這個世界的相機是**固定的** 45° 俯視，
 * **它只看得見朝南或朝上的面**。量出來：面朝東的門在畫面上的橫向輪廓是 **0.22**，
 * 而角色的直徑是 **0.5**。六扇門是六條約 10 像素的細縫（人工截圖）。
 *
 * `turns: 0` 之後是 1.58。代價是門**不再貼在牆上**，
 * 而是立在走廊裡的一排門框 —— 那是一個**已知的、有票追蹤的**折衷（`FE-W18`
 * 的鋸齒牆會把它們搬回牆上，而且仍然朝南）。
 *
 * 規格 `FE-W12-S25`／`S26` 守著這件事：改回 `1` 會紅。
 */
export const DOOR_TURNS: QuarterTurn = 0

/**
 * 兩扇門之間的最小淨距。
 *
 * ⚠️ **這是視覺常數，沒有量測依據** —— 兩扇門之間要看得出來是兩扇，
 * 不是一整片木牆。它是 `FE-W14 VisualPolish` 可以調的東西，
 * 而**調它會改變容量**（那是刻意的，不是副作用）。
 */
export const MIN_GAP = 0.4

/** 門在自己的局部座標下的包圍盒，**從造型推導**。門一定有看得見的部件。 */
const DOOR_LOCAL = visualBoundsOf(doorDefinition()) ?? {
  offsetX: 0,
  offsetZ: 0,
  halfWidth: 0,
  halfDepth: 0,
  halfHeight: 0,
}

/** 門在世界座標下的包圍盒（已經轉過）。 */
const DOOR_BOX = rotateFootprint(DOOR_LOCAL, DOOR_TURNS)

/**
 * 一個槽位**保留**的寬度：門**最寬的那一個方向**。
 *
 * ⚠️⚠️ **與門的朝向無關，這是刻意的。**
 * 用「門沿走廊軸的跨度」算的話，門一旦轉成面朝南，那個跨度只剩厚度 0.22 ——
 * 走廊會被算成放得下 **19 扇**。**純視覺的轉向不得改變生成的數量。**
 */
export const DOOR_SPAN = Math.max(DOOR_LOCAL.halfWidth, DOOR_LOCAL.halfDepth) * 2

export interface DoorSlot {
  /** 槽位在走廊上的序號，由北往南。 */
  readonly index: number
  readonly x: number
  readonly z: number
  readonly turns: QuarterTurn
}

/**
 * 一條走廊排得下幾扇門。
 *
 * **不是挑的數字** —— 走廊變長就多一個槽位，`MIN_GAP` 變大就少一個。
 */
export function slotCapacity(zone: Zone): number {
  return Math.floor((zone.halfDepth * 2) / (DOOR_SPAN + MIN_GAP))
}

/**
 * 走廊上每一個槽位的位置。
 *
 * z 是把走廊的長邊等分之後取每一段的中點 —— 這樣**頭尾的邊距自動相等**，
 * 而且相鄰兩個的間距（`pitch`）一定大於門寬（因為容量是用
 * `門寬 + MIN_GAP` 除出來的）。
 *
 * x 讓門的包圍盒**最小的那一側貼齊走廊的西緣**。
 * ⚠️ 不能直接用 `zone.x - zone.halfWidth + halfWidth`：
 * 門的包圍盒**不是對稱的**（把手凸出去一邊），所以要把 `offsetX` 扣回來。
 */
export function doorSlots(zone: Zone): readonly DoorSlot[] {
  const count = slotCapacity(zone)
  const pitch = (zone.halfDepth * 2) / count
  const northEdge = zone.z - zone.halfDepth
  const x = zone.x - zone.halfWidth + DOOR_BOX.halfWidth - DOOR_BOX.offsetX

  return Array.from({ length: count }, (_, index) => ({
    index,
    x,
    z: northEdge + pitch * (index + 0.5),
    turns: DOOR_TURNS,
  }))
}

/** 一個槽位對應的配置項 —— 讓它可以走 `visualBoxFor` 那條既有的幾何管道。 */
export function doorItemAt(slot: DoorSlot, id: string): LayoutItem {
  return { id, kind: 'door', x: slot.x, z: slot.z, turns: slot.turns }
}

/** Guild Hall 的走廊。**取不到就拋錯** —— 回一個假的矩形會讓門靜靜跑到原點。 */
function corridorZone(): Zone {
  const zone = ZONES.find((candidate) => candidate.id === 'corridor')
  if (zone === undefined) {
    throw new Error('配置裡沒有走廊分區 —— 走廊的門沒有地方可以排。')
  }
  return zone
}

/** Guild Hall 走廊上的槽位。**這是產品用的那一份**（測試用 `doorSlots(zone)` 餵別的矩形）。 */
export const CORRIDOR_SLOTS: readonly DoorSlot[] = doorSlots(corridorZone())
