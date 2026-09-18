import { z } from 'zod'
import { HttpError } from '@/server/http/errors'
import { handle } from '@/server/http/handle'
import { pathUuid } from '@/server/http/validation'
import { hashPassword } from '@/server/passwords'
import { formTeam, projectOwner } from '@/server/projects'

// `POST /api/projects/{project_id}/form-team`。規格 `FE-J04`〈成軍與結案：替身照真後端〉。
// 順序：管線（401）→ 不存在 404 → 非 owner 403（原句）→ 雜湊密碼、更新。**不驗密碼長度**（真後端亦然，上限由前端守）、**不看原 status**。

const FormTeamBody = z.object({ password: z.string() })

export const POST = handle({ auth: 'required', body: FormTeamBody }, async ({ me, body, params }) => {
  const projectId = pathUuid(params, 'project_id')
  const owner = await projectOwner(projectId)
  if (owner === null) throw new HttpError(404, '專案不存在')
  if (owner !== me) throw new HttpError(403, '只有發起人可以做這件事')
  const row = await formTeam(projectId, await hashPassword(body.password))
  if (row === null) throw new HttpError(404, '專案不存在')
  return row
})
