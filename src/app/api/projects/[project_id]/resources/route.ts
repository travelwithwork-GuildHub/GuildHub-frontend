import { z } from 'zod'
import { ResourceType } from '@/api/contract/rest'
import { handle, json } from '@/server/http/handle'
import { pathUuid } from '@/server/http/validation'
import { insertResource, listResources } from '@/server/resources'

// `GET /api/projects/{project_id}/resources`：全部、`created_at ASC, id ASC`、不分頁（上限 50 筆）。
// `POST …/resources`：201 與新建的那一筆；滿 50 筆是 409。規格 `FE-J14`〈本地專案資源四端點〉。
//
// ⚠️ **body schema 自己寫一份，不用 `contract.ProjectResourceCreate`** —— 跟 `PATCH /api/profiles/me` 同一個理由：
// 契約的那一份帶著 `LIMITS` 的長度（那是**前端送出前**的守門），真後端的 Pydantic `ProjectResourceCreate`
// 只有型別、一個長度都沒有，101 個字的 `label` 是資料庫 check 擋的 **500**，不是 422。
// 直接拿契約 schema 當請求解析器，本地就會比真後端「好用」—— 那是在製造假象（`handle()` 檔頭那段）。
// `type` 的封閉集合**要留**：真後端的 Pydantic enum 也是 422。未知欄位（含 `id`、`project_id`、`created_at`）Zod 預設 strip。
const ResourceCreateBody = z.object({
  label: z.string(),
  type: ResourceType,
  url: z.string(),
})

// 讀取要看「這個 session 有沒有這間房的票」，所以把原始的 `Cookie` header 往下傳（`src/server/roomGrant.ts`）——
// **前端的請求上不帶票**，帶的是它本來就會帶的 cookie，兩個目標的請求因此相同。
export const GET = handle({ auth: 'required' }, async ({ me, params, request }) =>
  listResources(pathUuid(params, 'project_id'), me as string, request.headers.get('cookie')),
)

export const POST = handle({ auth: 'required', body: ResourceCreateBody }, async ({ me, params, body }) =>
  json(await insertResource(pathUuid(params, 'project_id'), me as string, body), { status: 201 }),
)
