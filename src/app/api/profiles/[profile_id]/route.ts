import { HttpError } from '@/server/http/errors'
import { handle } from '@/server/http/handle'
import { pathUuid } from '@/server/http/validation'
import { profileById } from '@/server/profiles'

// `GET /api/profiles/{profile_id}`。不存在 → `404 {"detail":"名片不存在"}`；不是 uuid → 422（FastAPI 的路徑參數驗證）。
export const GET = handle({ auth: 'required' }, async ({ params }) => {
  const row = await profileById(pathUuid(params, 'profile_id'))
  if (row === null) throw new HttpError(404, '名片不存在')
  return row
})
