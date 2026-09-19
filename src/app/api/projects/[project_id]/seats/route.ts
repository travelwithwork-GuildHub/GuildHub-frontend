import { z } from 'zod'
import { handle, json } from '@/server/http/handle'
import { pathUuid } from '@/server/http/validation'
import { claimSeat, listSeats } from '@/server/seats'

// `GET`／`POST /api/projects/{project_id}/seats`。規格 `FE-J13`〈座位：替身照真後端〉（`internal-backend` S06）。
// 門在 `src/server/seats.ts`（票的 cookie 往下傳，跟 `resources` 一樣：前端的請求上不帶票、帶的是它本來就會帶的 cookie）。
// body 照 Pydantic `SeatClaim`：`seat_index: int`、`desk_template: int = 0`；型別錯 → 422（管線）。**不擋範圍**：`seat_index` 的 [0, 8) 是資料庫的 check → 400（跟真後端一樣，不是 422）。

const SeatClaimBody = z.object({ seat_index: z.number().int(), desk_template: z.number().int().default(0) })

export const GET = handle({ auth: 'required' }, async ({ me, params, request }) => listSeats(pathUuid(params, 'project_id'), me as string, request.headers.get('cookie')))

export const POST = handle({ auth: 'required', body: SeatClaimBody }, async ({ me, params, request, body }) =>
  json(await claimSeat(pathUuid(params, 'project_id'), me as string, request.headers.get('cookie'), body), { status: 201 }),
)
