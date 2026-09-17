import 'server-only'
import { db } from './db'
import { PAGE_SIZE, TS } from './profiles'

// 案件與走廊門位的 SQL。規格 `FE-O03`〈人才與案件清單：分頁形狀複製真後端〉。
// 欄位清單照真後端 `projects.py` 的 `_COLUMNS`（回應不含 `password_hash`）。

export const PROJECT_STATUSES = ['recruiting', 'active', 'closed'] as const
export type ProjectStatus = (typeof PROJECT_STATUSES)[number]

const COLUMNS = `id, owner_id, title, body, needed_skills, status, room_template, seat_count, ${TS('expires_at')} as expires_at, ${TS('updated_at')} as updated_at`

export interface ProjectRow {
  id: string
  owner_id: string
  title: string
  body: string
  needed_skills: string[]
  status: ProjectStatus
  room_template: number | null
  seat_count: number
  expires_at: string
  updated_at: string
}

/** 過期的（`expires_at <= now()`）不出現 —— 真後端亦然。 */
export async function listProjects(status: ProjectStatus, page: number): Promise<ProjectRow[]> {
  const r = await db().query<ProjectRow>(
    `select ${COLUMNS} from projects where status = $1 and expires_at > now() order by updated_at desc limit $2 offset $3`,
    [status, PAGE_SIZE, Math.max(page, 0) * PAGE_SIZE],
  )
  return r.rows
}

/** 建案的輸入：跟 `contract.ProjectCreate` 一樣的四個鍵（預設值由 Zod 填好再進來）。 */
export interface ProjectInput {
  title: string
  body: string
  needed_skills: string[]
  seat_count: number
}

/**
 * 建一筆。規格 `FE-J01`〈建案：形狀、預設值與到期日照真後端〉。
 * 只帶這四欄＋ owner：`status`、`room_template`、`expires_at`（＋7 天）都由資料庫預設 —— 真後端 `create_project` 亦然
 * （「expires_at 用資料庫預設值，不在應用層算」）。**不驗長度**（`handle()` 檔頭那段）。
 */
export async function insertProject(ownerId: string, input: ProjectInput): Promise<ProjectRow> {
  const r = await db().query<ProjectRow>(
    `insert into projects (owner_id, title, body, needed_skills, seat_count) values ($1, $2, $3, $4, $5) returning ${COLUMNS}`,
    [ownerId, input.title, input.body, input.needed_skills, input.seat_count],
  )
  return r.rows[0] as ProjectRow
}

export async function projectById(id: string): Promise<ProjectRow | null> {
  const r = await db().query<ProjectRow>(`select ${COLUMNS} from projects where id = $1`, [id])
  return r.rows[0] ?? null
}

/** 房間密碼的雜湊；專案不存在、或還沒成軍（`password_hash` 是 NULL）都是 `null` —— 真後端 `enter_room` 對兩者同一句 404。 */
export async function projectPasswordHash(id: string): Promise<string | null> {
  const r = await db().query<{ password_hash: string | null }>('select password_hash from projects where id = $1', [id])
  return r.rows[0]?.password_hash ?? null
}

/** 走廊：成軍中（active）的專案就是門，最多 12 個門位（`rooms.py` 的 `DOOR_SLOTS`）。 */
export async function activeRooms(): Promise<Array<{ project_id: string; title: string }>> {
  const r = await db().query<{ project_id: string; title: string }>(
    "select id as project_id, title from projects where status = 'active' order by updated_at desc limit 12",
  )
  return r.rows
}
