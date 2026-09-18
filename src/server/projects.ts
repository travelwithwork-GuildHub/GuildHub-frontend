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

// ── 成軍／結案（`FE-J04`）：照真後端 `projects.py` 的 `form_team`／`close_project`。owner 檢查在 route（403 原句），這裡只做資料。

/** 只給 route 判 owner 用：不存在 → null。 */
export async function projectOwner(id: string): Promise<string | null> {
  const r = await db().query<{ owner_id: string }>('select owner_id from projects where id = $1', [id])
  return r.rows[0]?.owner_id ?? null
}

/**
 * 成軍：`status → active`、`room_template`、`password_hash`。**不看原本的 status**（真後端亦然：active 再成軍是換密碼；closed 再成軍會復活 —— 那是 anomaly，前端圍堵）。
 * `room_template` 照真後端固定挑 0（只有一種模板；`FE-W16` 的 `project-room-layout` 只有一種）。
 */
export async function formTeam(id: string, passwordHash: string): Promise<ProjectRow | null> {
  const r = await db().query<ProjectRow>(
    `update projects set status = 'active', room_template = 0, password_hash = $2, updated_at = now() where id = $1 returning ${COLUMNS}`,
    [id, passwordHash],
  )
  return r.rows[0] ?? null
}

/** 結案：`status → closed`、座位整批刪（真後端 `BE-G07`）；`password_hash`／`room_template` 留著（`closed` 但有密碼的 enter 仍 200，`FE-N08-S12`）。冪等。 */
export async function closeProject(id: string): Promise<ProjectRow | null> {
  const client = await db().connect()
  try {
    await client.query('begin')
    await client.query('delete from seats where project_id = $1', [id])
    const r = await client.query<ProjectRow>(`update projects set status = 'closed', updated_at = now() where id = $1 returning ${COLUMNS}`, [id])
    await client.query('commit')
    return r.rows[0] ?? null
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
}
