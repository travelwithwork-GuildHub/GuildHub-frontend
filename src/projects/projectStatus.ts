import type { ProjectStatus } from '@/api/contract/rest'

// 案件狀態的中文，**唯一一份**。規格 `FE-B02` design D3：`FE-B03` 詳情、`FE-J03` 我的案件、`FE-J04` 成軍／結案的回饋都吃這裡。
// 各寫一份的話「已成軍」在某個地方會變成「進行中」。
//
// 只有文字，沒有顏色：狀態不靠顏色區分（`FE-B02-S02`；ui-ux-pro-max 的 Color Only）。要加顏色是加在文字上，不是取代。

export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  recruiting: '招募中',
  active: '已成軍',
  closed: '已結案',
}

const DAY_MS = 86_400_000

/**
 * 距到期還剩幾天：`ceil` 到天（`FE-B02` design D2）。
 * 剛建的案子 `expires_at = now + 7 天`（差幾秒）→ 7，不是 `floor` 的 6；剩 2 小時 → 1。
 * `≤ 0` 表示已到期 —— 呼叫端不得印負數（`S03`）。
 */
export function daysLeft(expiresAt: string, now: number): number {
  return Math.ceil((Date.parse(expiresAt) - now) / DAY_MS)
}
