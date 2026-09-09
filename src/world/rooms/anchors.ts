import type { RoomDoorOut } from '@/api/contract/rest'
import { visualBoundsOf } from '../environment/definition'
import { doorDefinition } from '../environment/semantic'
import { doorLabel, doorTargetId } from './labels'
import type { DoorSlot } from './slots'

// 每一扇門的標籤要掛在哪個世界座標上。規格 `FE-W12-S09`／`S10`。
//
// ⚠️ **標籤的錨點與門的幾何從同一份推導。** 換一個造型（門變高）
// 標籤要跟著上去 —— 寫死一個高度的話會插進門板裡。

/** 門頂的高度，**從造型推導**。 */
const DOOR_TOP = (visualBoundsOf(doorDefinition())?.halfHeight ?? 0) * 2

/** 標籤浮在門頂上方一點。 */
const CLEARANCE = 0.15

export interface LabelAnchor {
  /** 跟互動登記**同一個識別字** —— 兩邊指的是同一扇門（規格 `FE-W12-S17`）。 */
  readonly id: string
  readonly text: string
  readonly x: number
  readonly y: number
  readonly z: number
}

/** 第 i 個房間掛在第 i 個槽位上 —— **跟 `ProjectDoors` 走同一條對應**。 */
export function labelAnchorsFor(
  rooms: readonly RoomDoorOut[],
  slots: readonly DoorSlot[],
): LabelAnchor[] {
  return rooms.flatMap((room, index) => {
    const slot = slots[index]
    if (slot === undefined) return []
    return [
      {
        id: doorTargetId(room.project_id),
        text: doorLabel(room),
        x: slot.x,
        y: DOOR_TOP + CLEARANCE,
        z: slot.z,
      },
    ]
  })
}
