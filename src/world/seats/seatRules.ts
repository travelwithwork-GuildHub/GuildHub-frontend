import type { ProjectStatus, SeatOut } from '@/api/contract/rest'

// 座位的純規則。規格 `FE-J13`〈一鍵入座〉〈失敗回饋可恢復、兩種 409 分得開〉。

/** 房間裡座位輪詢的週期。跟走廊的門一樣（`useRooms.POLL_INTERVAL_MS`）：協定沒有座位事件，30 秒是「別人坐了看得到」的時間尺度。 */
export const SEATS_POLL_MS = 30_000

export type Claim409 = 'seat-taken' | 'already-seated' | 'unknown'

/**
 * 兩種 409 只靠後端的 `detail` 文字分（`FE-O08` anomaly `seat-409-detail`）。**整個前端只有這一處在讀那兩句** ——
 * 給後端的清單 1.4 要 `code`，來了只改這裡。不認得的 409 是 `unknown`（畫成一般失敗、仍重取）。
 */
export function classify409(detail: string | null | undefined): Claim409 {
  if (detail === '這個座位已經有人了') return 'seat-taken'
  if (detail === '你已經在這個房間有座位了') return 'already-seated'
  return 'unknown'
}

/** 自己坐在哪一格；沒有就 undefined。 */
export const seatOf = (seats: readonly SeatOut[], me: string): SeatOut | undefined => seats.find((s) => s.user_id === me)

/**
 * 現在能不能按「入座」（純推導，`S02`）：房間 `active`（`closed` 是 anomaly 圍堵、`recruiting` 進不來）、票沒失效、沒有在送、自己還沒有座位（一人一格，不用等 409）。
 */
export function canClaim({ status, locked, claiming, seats, me }: { status: ProjectStatus; locked: boolean; claiming: number | null; seats: readonly SeatOut[]; me: string }): boolean {
  return status === 'active' && !locked && claiming === null && seatOf(seats, me) === undefined
}
