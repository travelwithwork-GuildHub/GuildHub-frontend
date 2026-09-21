import { AISLE_CENTER_X, stationAt } from '@/world/layout/projectRoomLayout'
import { FACING, type Facing } from '@/world/coords'
import type { Relocation } from '@/world/player/relocation'

// 座位 → 就位命令（`FE-J13-S07`）。純函式：同一 `seat_index` 永遠是同一站位、同一朝向。
//
// 朝向由**站位與桌子的相對 x** 導出，不是硬抄方向：站位在通道側（|x| 較小）、桌子在更外側（|x| 較大），
// 所以「面向桌子」＝ 朝遠離通道那一側 —— 西側工位（x < 通道中線）朝 `left`、東側朝 `right`。

/** 面向那一格的桌子（西側 `left`、東側 `right`）。 */
export function facingForSeat(seatIndex: number): Facing {
  return stationAt(seatIndex).x < AISLE_CENTER_X ? FACING.left : FACING.right
}

/** 入座成功後要把角色搬到哪：該工位的站位座標＋面向桌子的朝向。 */
export function relocationForSeat(seatIndex: number): Relocation {
  const station = stationAt(seatIndex)
  return { x: station.x, z: station.z, f: facingForSeat(seatIndex) }
}
