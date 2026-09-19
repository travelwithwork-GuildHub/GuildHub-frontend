import 'server-only'
import { db } from './db'
import { HttpError } from './http/errors'
import { hasRoomGrant } from './roomGrant'
import { TS } from './profiles'

// 座位的替身。規格 `FE-J13`〈座位：替身照真後端〉（`internal-backend` S06）—— 照真後端 `app/api/seats.py`。
//
// 門：這個 session 要有這間房的票（`enter` 發的房間 cookie，`roomGrant.ts`，跟 `resources` 同一道）。
// **先驗票再查案子**（真後端的 `require_room_token` 是 dependency，比 handler 先跑）：不存在的 id 對有票的人也是 403，不是 404。
// 不看 `status`：`closed` 但有票照放行（真後端亦然，`FE-O08` anomaly `close-keeps-token`，前端不給入口圍堵）。
//
// ⚠️ **寫入是單一句 `INSERT … SELECT … WHERE seat_index < seat_count`，沒有先查再寫**（後端檔頭的長註解、守則 §4.1）：
// 「這格有沒有人」交給資料庫的兩個約束（PK 一格一人、unique 一人一格），兩個人同時按只有一個成功；
// 容量檢查查的是 `projects.seat_count`（跟誰在搶無關），跟競爭正交。`rowCount = 0` 才去查原因 —— 那一句不在成功路徑上。
//
// 兩種 409 的 `detail` **逐字同真後端**（前端只靠這兩句分 —— anomaly `seat-409-detail`）；PG 用 constraint 名分：
// unique (project_id, user_id) 的預設名含 `user_id`，PK 不含。

export interface SeatRow {
  seat_index: number
  user_id: string
  desk_template: number
  claimed_at: string
}

const COLUMNS = `seat_index, user_id, desk_template, ${TS('claimed_at')} as claimed_at`

function requireTicket(cookie: string | null, projectId: string, me: string): void {
  if (!hasRoomGrant(cookie, projectId, me)) throw new HttpError(403, '尚未通過房間密碼驗證')
}

export async function listSeats(projectId: string, me: string, cookie: string | null): Promise<SeatRow[]> {
  requireTicket(cookie, projectId, me)
  const r = await db().query<SeatRow>(`select ${COLUMNS} from seats where project_id = $1 order by seat_index`, [projectId])
  return r.rows
}

export async function claimSeat(projectId: string, me: string, cookie: string | null, input: { seat_index: number; desk_template: number }): Promise<SeatRow> {
  requireTicket(cookie, projectId, me)
  let row: SeatRow | undefined
  try {
    const r = await db().query<SeatRow>(
      'insert into seats (project_id, seat_index, user_id, desk_template) ' +
        'select $1::uuid, $2::smallint, $3::uuid, $4::smallint from projects where id = $1::uuid and $2::smallint < seat_count ' +
        `returning ${COLUMNS}`,
      [projectId, input.seat_index, me, input.desk_template],
    )
    row = r.rows[0]
  } catch (error) {
    const e = error as { code?: unknown; constraint?: unknown }
    if (e.code === '23505') throw new HttpError(409, String(e.constraint ?? '').includes('user_id') ? '你已經在這個房間有座位了' : '這個座位已經有人了')
    if (e.code === '23514') throw new HttpError(400, '座位編號超出範圍') // seat_in_range：0 ≤ seat_index < 8
    if (e.code === '23503') throw new HttpError(404, '專案不存在')
    // smallint 裝不下（22003）跟真後端一樣是 500：契約只釘 [0, 8) 的 check 與 seat_count
    throw error
  }
  if (row !== undefined) return row
  // where 沒命中：專案不存在，或座位編號 ≥ 這個房間的座位數。只在失敗之後才跑，不參與競爭。
  const count = await db().query<{ seat_count: number }>('select seat_count from projects where id = $1', [projectId])
  const seatCount = count.rows[0]?.seat_count
  if (seatCount === undefined) throw new HttpError(404, '專案不存在')
  throw new HttpError(400, `這個房間只有 ${seatCount} 個座位（可選 0–${seatCount - 1}）`)
}
