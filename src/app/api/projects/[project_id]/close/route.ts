import { HttpError } from '@/server/http/errors'
import { handle } from '@/server/http/handle'
import { pathUuid } from '@/server/http/validation'
import { closeProject, projectOwner } from '@/server/projects'

// `POST /api/projects/{project_id}/close`。規格 `FE-J04`〈成軍與結案：替身照真後端〉。
// 401 → 404 → 403（原句）→ 結案（冪等：closed 再 close 仍 200；座位整批刪，`password_hash` 留著）。

export const POST = handle({ auth: 'required' }, async ({ me, params }) => {
  const projectId = pathUuid(params, 'project_id')
  const owner = await projectOwner(projectId)
  if (owner === null) throw new HttpError(404, '專案不存在')
  if (owner !== me) throw new HttpError(403, '只有發起人可以做這件事')
  const row = await closeProject(projectId)
  if (row === null) throw new HttpError(404, '專案不存在')
  return row
})
