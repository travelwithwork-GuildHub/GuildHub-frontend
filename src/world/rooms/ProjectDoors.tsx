'use client'

import type {} from '@react-three/fiber'
import type { RoomDoorOut } from '@/api/contract/rest'
import { PropParts } from '../environment/PropParts'
import { doorDefinition } from '../environment/semantic'
import { Interactable } from '../interaction/Interactable'
import { doorLabel, doorTargetId } from './labels'
import type { DoorSlot } from './slots'

// 走廊上依 `GET /api/rooms` 生成的門。規格 `FE-W12-S01`／`S14`／`S16`／`S17`。
//
// ⚠️ **`key` 是 `project_id`，因為一扇門的身分就是那個專案。**
//
// **誠實寫下這一點：把它改成陣列索引，今天一條測試都不會紅**（實測）。
// 理由是 `Interactable` 把 `id`／`x`／`z`／`label` 都放進 effect 的依賴，
// 清單換掉時它會先全部註銷再全部重新註冊 —— 所以登記的內容是對的。
// 外部審查者在規格階段就講過這件事：
// 「用陣列索引當 key 並不必然令更新後的標籤與事件資料錯位」。
//
// 那為什麼還是用 `project_id`？因為**索引當 key 會讓元件實例跨專案重用** ——
// 今天門沒有任何自己的狀態，所以看不出來；等它有了（開門動畫、sensor、
// 或是一個記著「我是誰」的 ref），那個狀態會靜靜地留在別的專案的門上。
// **這件事今天沒有判準守著**，是一個刻意的取捨，不是漏做。
//
// 真正被 `FE-W12-S17` 守住的是另一件事：畫面上的名字與互動登記
// **一路釘回同一筆房間**（兩邊一起綁到同一個錯的 id 也要紅）。
//
// ⚠️ **門不帶 `onInteract`。** 「進入專案房間」是場景切換（`FE-V01`，W4）。
// `spatial-interaction` 的契約明文允許沒有動作的物件
// ——「只顯示提示，按下去什麼都不做」。今天造一個交給空函式的 callback prop，
// 是這個 repo 三次否決過的「沒有讀取者的抽象」。

export interface ProjectDoorsProps {
  /** 已經排好序、已經截斷的房間（`doorsFor`）。 */
  readonly rooms: readonly RoomDoorOut[]
  /** 走廊的槽位（`doorSlots`）。**第 i 個房間放在第 i 個槽位。** */
  readonly slots: readonly DoorSlot[]
}

export function ProjectDoors({ rooms, slots }: ProjectDoorsProps) {
  return (
    <>
      {rooms.map((room, index) => {
        const slot = slots[index]
        // 房間比槽位多的時候應該已經在 `doorsFor` 截斷過了 ——
        // 走到這裡代表呼叫端給錯了，**靜靜少畫一扇門比畫在原點好**。
        if (slot === undefined) return null
        return (
          <group
            key={room.project_id}
            position={[slot.x, 0, slot.z]}
            rotation={[0, (slot.turns * Math.PI) / 2, 0]}
          >
            <PropParts definition={doorDefinition()} />
            <Interactable
              id={doorTargetId(room.project_id)}
              x={slot.x}
              z={slot.z}
              label={doorLabel(room)}
            />
          </group>
        )
      })}
    </>
  )
}
