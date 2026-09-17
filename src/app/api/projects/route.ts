import { ProjectCreate } from '@/api/contract/rest'
import { handle, json } from '@/server/http/handle'
import { queryEnum, queryInt } from '@/server/http/validation'
import { PROJECT_STATUSES, insertProject, listProjects } from '@/server/projects'

// `GET /api/projects?status=recruiting&page=N`。`status` 預設 recruiting、不在三個值裡 → 422；過期的不出現。
// `POST /api/projects`：201，形狀、預設值與到期日照真後端（規格 `FE-J01`〈建案〉）。
//
// body 用 `contract.ProjectCreate` 解析 —— 它只有型別與預設值（`needed_skills` `[]`、`seat_count` 4），
// 跟真後端的 Pydantic `ProjectCreate` 對得上。**這裡不擋長度與範圍**：使用者面向的上限由前端的 `FORM_LIMITS` 守，
// 真後端對這個端點什麼都不驗是 `FE-O08` 演練帳裡的 anomaly、不是任何一方的義務。
export const GET = handle({ auth: 'required' }, async ({ url }) =>
  listProjects(queryEnum(url.searchParams, 'status', PROJECT_STATUSES, 'recruiting'), queryInt(url.searchParams, 'page', 0)),
)

export const POST = handle({ auth: 'required', body: ProjectCreate }, async ({ me, body }) => json(await insertProject(me as string, body), { status: 201 }))
