import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { HttpError } from '@/server/http/errors'
import { handle, json } from '@/server/http/handle'
import { hashPassword } from '@/server/passwords'
import { insertAccount } from '@/server/profiles'
import { sessionCookie } from '@/server/session'

// `POST /api/register`。規格 `FE-A08`〈本地後端與契約測試補上 register 與密碼登入〉—— 照真後端 `auth.py` 的 `register`。
//
// 建一張帶帳號密碼的名片，**註冊完直接是登入狀態**（寫 session cookie）。撞名由 `profiles.login_id` 的 unique 擋 → 409，
// **不先查再寫**（`S15`：兩個人同時註冊同一個帳號，恰好一個 200、一個 409）。
//
// ⚠️ **這裡只有 Pydantic 有的長度**：`RegisterIn` 只有 `password` 的 `min_length=8`（→ 422）；`login_id` 3–32 與 `nickname` 1–20 是資料庫的 check
// → **500**（真後端亦然；`src/api/contract/rest.ts` 的 `RegisterIn` 有長度，那是前端送出前的擋法）。
// 密碼是 `hashPassword`（跟真後端同參數），所以這裡註冊的帳號在真後端也登得進（`FE-O03` design `D4`）。

const RegisterBody = z.object({
  login_id: z.string(),
  password: z.string().min(8),
  nickname: z.string(),
})

export const POST = handle({ auth: 'none', body: RegisterBody }, async ({ body }) => {
  const row = await insertAccount(randomUUID(), body.nickname, body.login_id, await hashPassword(body.password))
  if (row === null) throw new HttpError(409, '這個帳號已經有人用了')
  return json(row, { headers: { 'set-cookie': sessionCookie(row.id) } })
})
