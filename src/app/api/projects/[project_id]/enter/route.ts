import { z } from 'zod'
import { internalSessionSecret } from '@/config/env'
import { HttpError } from '@/server/http/errors'
import { handle, json } from '@/server/http/handle'
import { pathUuid } from '@/server/http/validation'
import { verifyPassword } from '@/server/passwords'
import { projectPasswordHash } from '@/server/projects'
import { roomGrantCookie } from '@/server/roomGrant'
import { signRoomToken } from '@/server/roomToken'

// `POST /api/projects/{project_id}/enter`。規格 `FE-N08`〈本地後端的 enter 在下列語意上與真後端相同，票本地替身收得下〉—— 照真後端 `enter_room`。
//
// 順序：管線（沒 session、名片不在 → 401）→ `password_hash IS NULL`（不存在或還沒成軍）→ 404 → 密碼不合 → 403 → 簽票。
// **不看 `status`**（`closed` 但留著 `password_hash` 照簽，真後端亦然）、**不看座位**（座位是 `FE-J13` 的事）。
// 票綁房間也綁人（`src/server/roomToken.ts`，跟替身同一份、同一把 secret）。
//
// 成功時**另外**發一個那一間房的票記錄 cookie（`src/server/roomGrant.ts`，design D4）：真後端把票存進自己的 session
// 給需要票的 REST 端點驗，本地用 cookie 記同一件事。回給前端的 `room_token` 是給即時層握手用的，兩者不同用途、
// 前端不解析任何一個。
//
// body 照 Pydantic `EnterIn`：`password: str`，**沒有長度、可以是空字串**（空字串照驗 → 403，不是 422）。

const EnterBody = z.object({ password: z.string() })

export const POST = handle({ auth: 'required', body: EnterBody }, async ({ me, body, params }) => {
  const projectId = pathUuid(params, 'project_id')
  const stored = await projectPasswordHash(projectId)
  if (stored === null) throw new HttpError(404, '專案不存在或房間尚未開啟')
  if (!(await verifyPassword(body.password, stored))) throw new HttpError(403, '房間密碼錯誤')
  return json(
    { room_token: signRoomToken(internalSessionSecret(), projectId, me as string) },
    { headers: { 'set-cookie': roomGrantCookie(projectId, me as string) } },
  )
})
