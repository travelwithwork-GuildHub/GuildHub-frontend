import { HttpError } from '@/server/http/errors'
import { handle } from '@/server/http/handle'
import { pathUuid } from '@/server/http/validation'
import { projectById } from '@/server/projects'

// `GET /api/projects/{project_id}`。不存在 → `404 {"detail":"專案不存在"}`。
export const GET = handle({ auth: 'required' }, async ({ params }) => {
  const row = await projectById(pathUuid(params, 'project_id'))
  if (row === null) throw new HttpError(404, '專案不存在')
  return row
})
