import type { RoomDoorOut } from '@/api/contract/rest'

// 哪些房間排得進走廊、排不下的有幾個。規格 `FE-W12-S01`／`S05`。
//
// ⚠️ **這是純函式，不碰 React 也不碰網路。** 排序與截斷算錯的症狀是
// 「門的順序不對」，而那跟「請求失敗」「元件沒掛載」長得完全不一樣 ——
// 混在一起的話紅燈說不出是哪一個。

export interface RoomDoors {
  /** 排得進走廊的房間，**已經排好序**。 */
  readonly doors: readonly RoomDoorOut[]
  /** 排不下的數量。**要說出來**（規格 `FE-W12-S05`：不得靜默截斷）。 */
  readonly hidden: number
}

/**
 * 依 `project_id` 字典序排列，取前 `capacity` 個。
 *
 * ⚠️⚠️ **`online_count` MUST NOT 決定順序。**
 * 它在列表產品裡是合理的排序鍵，**在可行走的空間裡不是** ——
 * 門的位置形成空間記憶，依在線數重排會讓玩家正在走近的專案突然換門、
 * 甚至掉出畫面。它只決定顯示的內容（change 的 design D4）。
 *
 * ⚠️ **後端沒有承諾順序**，所以不排序的話每次輪詢都可能讓門互換位置。
 *
 * ⚠️ **誠實寫下這個做法的缺陷**：`project_id` 是 UUID，新專案可以插進中間、
 * 把既有的門整排往後推，甚至把最後一扇擠掉。
 * 「同一份資料永遠得到同一個排列」成立，**「門的位置永遠不動」不成立** ——
 * 後者需要伺服器端的槽位指派，那是 `FE-V01` 的事。
 */
export function doorsFor(rooms: readonly RoomDoorOut[], capacity: number): RoomDoors {
  const sorted = [...rooms].sort((a, b) => {
    if (a.project_id < b.project_id) return -1
    if (a.project_id > b.project_id) return 1
    return 0
  })
  return {
    doors: sorted.slice(0, Math.max(0, capacity)),
    hidden: Math.max(0, rooms.length - Math.max(0, capacity)),
  }
}
