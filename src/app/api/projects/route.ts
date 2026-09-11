import { handle } from '@/server/http/handle'
import { queryEnum, queryInt } from '@/server/http/validation'
import { PROJECT_STATUSES, listProjects } from '@/server/projects'

// `GET /api/projects?status=recruiting&page=N`。`status` 預設 recruiting、不在三個值裡 → 422；過期的不出現。
// **沒有 `POST`**：建案件是 W6 的能力（`FE-B02`），沒匯出的 method 由 Next 回 405（`S05`）。
export const GET = handle({ auth: 'required' }, async ({ url }) =>
  listProjects(queryEnum(url.searchParams, 'status', PROJECT_STATUSES, 'recruiting'), queryInt(url.searchParams, 'page', 0)),
)
