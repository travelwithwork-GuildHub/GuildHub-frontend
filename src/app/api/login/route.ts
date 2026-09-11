import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { HttpError } from '@/server/http/errors'
import { handle, json } from '@/server/http/handle'
import { verifyPassword } from '@/server/passwords'
import { credentialsOf, insertProfile, profileById } from '@/server/profiles'
import { sessionCookie } from '@/server/session'

// `POST /api/login`。規格 `FE-O03`〈登入有三種模式，剛好給一組〉—— 照真後端 `auth.py` 的 `LoginIn`。
//
// ⚠️ **這裡沒有長度**：`nickname` 空字串或 21 字由資料庫的 check 擋 → 500（真後端亦然）。
// `src/api/contract/rest.ts` 的 `LoginIn` 有長度，那是**前端送出前**的擋法；伺服器這邊照 Pydantic 的模型寫。

const LoginBody = z
  .object({
    nickname: z.string().nullable().optional(),
    resume_token: z.uuid().nullable().optional(),
    login_id: z.string().nullable().optional(),
    password: z.string().nullable().optional(),
  })
  .superRefine((v, ctx) => {
    // 跟 `LoginIn.exactly_one_mode` 同一個順序、同一句話。
    if ((v.login_id == null) !== (v.password == null)) {
      ctx.addIssue({ code: 'custom', message: 'login_id 與 password 要一起給' })
      return
    }
    const given = [v.nickname != null, v.resume_token != null, v.login_id != null].filter(Boolean).length
    if (given !== 1) ctx.addIssue({ code: 'custom', message: 'nickname／resume_token／login_id+password 剛好給一組' })
  })

export const POST = handle({ auth: 'none', body: LoginBody }, async ({ body }) => {
  let row
  if (body.login_id != null && body.password != null) {
    const cred = await credentialsOf(body.login_id)
    // 帳號不存在與密碼錯誤回同一個碼、同一句話（不送出帳號存在性）。
    if (cred === null || !(await verifyPassword(body.password, cred.password_hash))) throw new HttpError(403, '帳號或密碼錯誤')
    row = await profileById(cred.id)
  } else if (body.resume_token != null) {
    row = await profileById(body.resume_token)
    if (row === null) throw new HttpError(404, '名片不存在')
  } else {
    row = await insertProfile(randomUUID(), body.nickname as string)
  }
  if (row === null) throw new HttpError(404, '名片不存在')
  return json(row, { headers: { 'set-cookie': sessionCookie(row.id) } })
})
