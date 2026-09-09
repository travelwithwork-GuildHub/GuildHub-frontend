import type { RoomDoorOut } from '@/api/contract/rest'

// 門的名字。規格 `FE-W12-S09`／`S14`／`S17`。
//
// ⚠️ **只有一份。** 常態顯示的標籤與走近時的互動提示講的是同一件事 ——
// 兩邊各寫一份的話，改了其中一邊會變成「走過去之後名字不一樣」。

/**
 * 一扇門的互動識別字。**帶著 `project_id`**（規格 `FE-W12-S14`）。
 *
 * ⚠️ **不是陣列索引。** 清單重排之後索引指的是別的專案，
 * 而畫面上看起來完全正常 —— 玩家會從 A 的門進到 B。
 */
export function doorTargetId(projectId: string): string {
  return `door:${projectId}`
}

/** 從互動識別字取回 `project_id`。`null` 代表那不是一扇門。 */
export function projectIdOfTarget(targetId: string): string | null {
  return targetId.startsWith('door:') ? targetId.slice('door:'.length) : null
}

/** 一扇門顯示的字：名稱與在線數。 */
export function doorLabel(room: RoomDoorOut): string {
  return `進入「${room.title}」（${room.online_count} 人在線）`
}

/** 兩塊看板的互動識別字與名字。**它們不接任何 API** —— 只是接上互動系統。 */
export const BOARD_LABELS = {
  projectBoard: '看專案看板',
  talentBoard: '看人才看板',
} as const

export type BoardKind = keyof typeof BOARD_LABELS
