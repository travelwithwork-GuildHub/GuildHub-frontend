import { z } from 'zod'
import { HttpError } from '@/server/http/errors'
import { handle, json } from '@/server/http/handle'
import { queryInt } from '@/server/http/validation'
import { insertMessage, listMessages } from '@/server/messages'

// `GET /api/messages?page=N`、`POST /api/messages`。規格 `FE-K01`〈本地後端與契約測試補上 messages〉—— 照真後端 `messages.py`。
//
// GET：主體條件在 SQL（`src/server/messages.ts`）；20 一頁、0-based、負數當 0、非整數 422（`queryInt`）、尾頁後 `[]`。
// POST：201；寄給自己 400（資料庫 check）；收件人不存在 404（FK）；body 形狀照 Pydantic `MessageCreate`：`recipient_id` uuid、`body: str`
// —— **沒有長度**（1–2000 是資料庫的 check → 500，真後端亦然；`src/api/contract/rest.ts` 的 `MessageCreate` 有長度，那是前端送出前的擋法）。

const MessageBody = z.object({
  recipient_id: z.uuid(),
  body: z.string(),
})

export const GET = handle({ auth: 'required' }, async ({ me, url }) => listMessages(me as string, queryInt(url.searchParams, 'page', 0)))

export const POST = handle({ auth: 'required', body: MessageBody }, async ({ me, body }) => {
  const result = await insertMessage(me as string, body.recipient_id, body.body)
  if (!result.ok) {
    if (result.reason === 'self-send') throw new HttpError(400, '不能寄信給自己')
    throw new HttpError(404, '收件人不存在')
  }
  return json(result.row, { status: 201 })
})
