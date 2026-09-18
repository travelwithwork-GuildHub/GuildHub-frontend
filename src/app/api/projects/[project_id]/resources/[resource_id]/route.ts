import { z } from 'zod'
import { ResourceType } from '@/api/contract/rest'
import { handle, noContent } from '@/server/http/handle'
import { pathUuid } from '@/server/http/validation'
import { deleteResource, updateResource } from '@/server/resources'

// `PATCH /api/projects/{project_id}/resources/{resource_id}`：只改有給的欄位，`{}` 回 200 原樣。
// `DELETE …`：204、沒有 body；第二次刪同一筆是 404。規格 `FE-J14`〈本地專案資源四端點〉。
//
// 兩個都走 `handle()`：未登入 401 排在最前面，path 的 uuid 不合法是 422 且 `loc[0]` 是 `path`（`S28`、`S30`）。
// 路徑上的 `resource_id` 不屬於路徑上的專案 → 404（每一句 SQL 都同時帶 `project_id`）。
//
// body schema 自己寫一份、**不帶長度**，理由同 `../route.ts`。三欄是 `.optional()` 不是 `.nullable()`：
// 真後端三欄是 `str`，明確送 `{"label": null}` 是 422（`S30`）。
const ResourceUpdateBody = z.object({
  label: z.string().optional(),
  type: ResourceType.optional(),
  url: z.string().optional(),
})

export const PATCH = handle({ auth: 'required', body: ResourceUpdateBody }, async ({ me, params, body }) =>
  updateResource(pathUuid(params, 'project_id'), pathUuid(params, 'resource_id'), me as string, body),
)

export const DELETE = handle({ auth: 'required' }, async ({ me, params }) => {
  await deleteResource(pathUuid(params, 'project_id'), pathUuid(params, 'resource_id'), me as string)
  return noContent()
})
