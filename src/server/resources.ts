import 'server-only'
import type { PoolClient } from 'pg'
import { LIMITS } from '@/api/contract/limits'
import { db } from './db'
import { HttpError } from './http/errors'
import { TS } from './profiles'

// 專案資源的 SQL 與權限。規格 `FE-J14`〈本地專案資源四端點：權限、狀態、上限、驗證與真後端相同〉。
// 欄位清單與每一句 detail 照真後端 `app/api/project_resources.py`（逐字，契約測試兩個目標比對）。
//
// ⚠️ **這裡不擋長度、不擋網址格式、不 trim `label`。** 那三件事只寫在資料庫的 check（`001_schema.sql`），
// 違反是 500 text/plain —— 真後端亦然（`handle()` 檔頭那段）。

const COLUMNS = `id, project_id, label, type, url, ${TS('created_at')} as created_at`
/** 一個專案最多幾筆。數字的唯一來源是 `limits.ts`（`LIMIT_SOURCES` 指著後端的 `MAX_RESOURCES`）。 */
const MAX = LIMITS.resourcesPerProject.max
/** 會被拼進 SQL 的欄位名，所以只能來自這張封閉清單（跟 `PROFILE_UPDATABLE` 同一個理由）。 */
const UPDATABLE = ['label', 'type', 'url'] as const

export interface ResourceRow {
  id: string
  project_id: string
  label: string
  type: string
  url: string
  created_at: string
}

export interface ResourceInput {
  label: string
  type: string
  url: string
}

/**
 * 讀：發起人一定讀得到（active／closed／recruiting 都是 200）。
 * 今天別人一律 403 —— 「持有本人有效 room token 的人也讀得到」要等本地有伺服器端的票紀錄（`--room-grants` 那一片）。
 */
export async function listResources(projectId: string, me: string): Promise<ResourceRow[]> {
  const project = await db().query<{ owner_id: string }>('select owner_id from projects where id = $1', [projectId])
  const owner = project.rows[0]?.owner_id
  if (owner === undefined) throw new HttpError(404, '專案不存在')
  if (owner !== me) throw new HttpError(403, '尚未通過房間密碼驗證')
  const r = await db().query<ResourceRow>(`select ${COLUMNS} from project_resources where project_id = $1 order by created_at asc, id asc`, [projectId])
  return r.rows
}

/**
 * 寫入的共同前置：同一個交易裡**先鎖住那一列 project**，再讓 `fn` 去計數與寫入。
 *
 * ⚠️ **鎖跟計數不能擠成一句。** Read Committed 下，同一句 SQL 的計數沿用這句開始時的快照，
 * 看不到等鎖期間別人剛提交的列 —— 上限照樣會被突破（後端 `project_resources.py` 檔頭記了同一件事）。
 * 所以是兩句：第一句 `for update` 鎖，第二句才計數與寫入。
 *
 * 第一句同時把「這是我的、而且現在是 active」與「鎖住它」合成一個動作；零列時才去查原因，
 * 那一句不在成功路徑上，也不參與任何競爭（請求已經失敗了）。
 */
async function inLockedActiveProject<T>(projectId: string, me: string, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await db().connect()
  try {
    await client.query('begin')
    const locked = await client.query("select id from projects where id = $1 and owner_id = $2 and status = 'active' for update", [projectId, me])
    if (locked.rowCount === 0) throw await denial(client, projectId, me)
    const result = await fn(client)
    await client.query('commit')
    return result
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
}

/** 鎖不到的時候，說出為什麼（detail 逐字照真後端）。 */
async function denial(client: PoolClient, projectId: string, me: string): Promise<HttpError> {
  const r = await client.query<{ owner_id: string; status: string }>('select owner_id, status from projects where id = $1', [projectId])
  const row = r.rows[0]
  if (row === undefined) return new HttpError(404, '專案不存在')
  if (row.owner_id !== me) return new HttpError(403, '只有發起人可以做這件事')
  return new HttpError(409, row.status === 'closed' ? '專案已結案，資源不能再修改' : '專案還沒成軍，還沒有房間可以放資源')
}

/** 新增一筆。計數寫在 insert 的 where 裡（第二句），滿了回零列 → 409。 */
export async function insertResource(projectId: string, me: string, input: ResourceInput): Promise<ResourceRow> {
  const row = await inLockedActiveProject(projectId, me, async (client) => {
    const r = await client.query<ResourceRow>(
      `insert into project_resources (project_id, label, type, url) select $1::uuid, $2, $3, $4 ` +
        `where (select count(*) from project_resources where project_id = $1::uuid) < $5 returning ${COLUMNS}`,
      [projectId, input.label, input.type, input.url, MAX],
    )
    return r.rows[0] ?? null
  })
  if (row === null) throw new HttpError(409, `一個專案最多 ${MAX} 筆資源`)
  return row
}

/** 真正的部分更新：沒給的欄位不動，`{}` 回原樣（真後端 `PATCH /api/profiles/me` 也是這個語意）。`created_at` 不動，所以順序不變。 */
export async function updateResource(projectId: string, resourceId: string, me: string, given: Partial<ResourceInput>): Promise<ResourceRow> {
  const row = await inLockedActiveProject(projectId, me, async (client) => {
    const columns = UPDATABLE.filter((name) => given[name] !== undefined)
    if (columns.length === 0) {
      const r = await client.query<ResourceRow>(`select ${COLUMNS} from project_resources where id = $1 and project_id = $2`, [resourceId, projectId])
      return r.rows[0] ?? null
    }
    const assignments = columns.map((name, i) => `${name} = $${i + 3}`).join(', ')
    const r = await client.query<ResourceRow>(
      `update project_resources set ${assignments} where id = $1 and project_id = $2 returning ${COLUMNS}`,
      [resourceId, projectId, ...columns.map((name) => given[name])],
    )
    return r.rows[0] ?? null
  })
  if (row === null) throw new HttpError(404, '資源不存在')
  return row
}

/** 硬刪除。第二次刪同一筆是 404 —— 「我剛刪掉」與「有人先刪了」對使用者是兩件事。 */
export async function deleteResource(projectId: string, resourceId: string, me: string): Promise<void> {
  const deleted = await inLockedActiveProject(projectId, me, async (client) => {
    const r = await client.query<{ id: string }>('delete from project_resources where id = $1 and project_id = $2 returning id', [resourceId, projectId])
    return r.rows[0] ?? null
  })
  if (deleted === null) throw new HttpError(404, '資源不存在')
}
