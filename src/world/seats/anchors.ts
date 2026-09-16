import { visualBoundsOf } from '../environment/definition'
import { furnitureDefinition } from '../environment/furnitureProps'
import { ROOM_LAYOUT, STATIONS, type SeatIndex, type Station } from '../layout/projectRoomLayout'
import type { LayoutItem } from '../layout/types'

// 每個工位的投影參考點要掛在哪個世界座標上。規格 `FE-W16-S06`（design D5 補記）。
//
// ⚠️ **x／z 讀的是配置裡那張桌子的中心，不是 `stationAt` 再算一次** —— 桌子搬了錨點要跟著搬；
// 從 `stationAt` 另算一份的話，兩邊會漂而畫面上看不出來（`#451` 審查抓到的同一種「同源尺」，只是這次在產品碼）。
//
// ⚠️ **y 是桌面高度，從家具 definition 讀**：e2e 反算角色的 z 要先扣掉 `s·h/√2` 這個固定偏移（`S08`），
// 寫死的話 `FE-W14` 調桌子高度那天里程計會靜默偏掉。

/** 桌面高度（桌子看得見的包圍盒的頂面；桌腳落地，所以 min y 是 0）。 */
export const DESK_TOP = (visualBoundsOf(furnitureDefinition('desk'))?.halfHeight ?? 0) * 2

export interface SeatAnchor {
  readonly seatIndex: SeatIndex
  readonly x: number
  readonly y: number
  readonly z: number
}

/**
 * 從配置推導八個錨點。**配置裡少了某張桌子就拋** —— 那是配置錯誤（`S03`「缺任何一件 SHALL 是配置錯誤」），
 * 不是「少一個錨點」；靜默少一個的話 `FE-J13` 會有一格永遠沒有標籤。
 */
export function seatAnchorsFor(layout: readonly LayoutItem[], stations: readonly Station[] = STATIONS): SeatAnchor[] {
  return stations.map((station) => {
    const desk = layout.find((item) => item.id === station.deskId)
    if (desk === undefined || desk.kind !== 'desk') {
      throw new Error(`工位 ${station.id} 的桌子（${station.deskId}）不在配置裡。`)
    }
    return { seatIndex: station.seatIndex, x: desk.x, y: DESK_TOP, z: desk.z }
  })
}

export const SEAT_ANCHORS: readonly SeatAnchor[] = seatAnchorsFor(ROOM_LAYOUT)
