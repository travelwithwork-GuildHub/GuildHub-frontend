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
  const unique = dedupe(rooms)
  const sorted = [...unique].sort((a, b) => {
    if (a.project_id < b.project_id) return -1
    if (a.project_id > b.project_id) return 1
    return 0
  })
  return {
    doors: sorted.slice(0, Math.max(0, capacity)),
    hidden: Math.max(0, unique.length - Math.max(0, capacity)),
  }
}

/**
 * 去掉重複的 `project_id`，**保留第一筆**。
 *
 * ⚠️⚠️ **這是這個 repo 少數「不明顯失敗」的地方，而它有理由。**
 *
 * 互動系統對重複的 id **拋錯**（`FE-W06-S16` 刻意的設計：兩個物件共用一個 id
 * 會讓「提示指著誰、按 E 觸發誰」變成不確定）。而門的 id 是 `door:${project_id}` ——
 * 所以後端多回一筆重複的房間，兩個 `<Interactable>` 會撞在一起、
 * error boundary 接手，**整個 3D 世界變成白畫面**。
 *
 * **一筆髒資料不該讓世界消失。** 走廊少一扇門是可以承受的降級。
 *
 * ⚠️ **但不靜默** —— `console.error` 帶著那個 `project_id`，讓它定位得到。
 * 也**不拋 `ContractDriftError`**：後端從來沒有承諾 `project_id` 唯一，
 * 所以重複不算違反契約，而那條路一樣是白畫面。
 */
function dedupe(rooms: readonly RoomDoorOut[]): RoomDoorOut[] {
  const seen = new Set<string>()
  const out: RoomDoorOut[] = []
  for (const room of rooms) {
    if (seen.has(room.project_id)) {
      console.error(
        `GET /api/rooms 回了重複的 project_id「${room.project_id}」，已略過第二筆。` +
          '兩個門共用一個互動識別字會讓整個世界拋錯 —— 這是後端的資料問題。',
      )
      continue
    }
    seen.add(room.project_id)
    out.push(room)
  }
  return out
}
