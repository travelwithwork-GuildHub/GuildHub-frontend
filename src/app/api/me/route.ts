import { handle } from '@/server/http/handle'
import { UNAUTHENTICATED } from '@/server/http/errors'
import { profileById } from '@/server/profiles'

// `GET /api/me`。規格 `FE-O03`〈我的名片：讀與部分更新〉。
// `handle` 已經確認 session 有效且名片存在；這裡再查一次是拿整張名片（`S06`、`S08`）。

export const GET = handle({ auth: 'required' }, async ({ me }) => {
  const row = await profileById(me as string)
  if (row === null) throw UNAUTHENTICATED()
  return row
})
