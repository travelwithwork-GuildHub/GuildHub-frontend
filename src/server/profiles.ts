import 'server-only'
import { db } from './db'

// 名片的 SQL。規格 `FE-O03`〈我的名片：讀與部分更新〉、〈人才與案件清單：分頁形狀複製真後端〉。
//
// ⚠️ **時間欄位用 `to_char` 產出跟 Pydantic 一字不差的形狀**：`2026-09-11T13:00:33.281950Z`（6 位微秒 + `Z`）。
// `pg` 回 `Date` 只有毫秒；`to_json` 給的是 `+00:00` 且尾零會被吃掉 —— 都不是真後端的樣子（golden 實錄）。
// ⚠️ **不 `select *`**：`password_hash` 與 `login_id` 不能出現在 `ProfileOut` 裡。

export const PAGE_SIZE = 20
export const TS = (col: string) => `to_char(${col} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`
export const PROFILE_COLUMNS = `id, display_name, avatar_id, skills, hours_per_week, bio, ${TS('updated_at')} as updated_at`
/** `ProfileUpdate` 允許的欄位 —— 跟真後端 `ProfileUpdate.model_fields` 一樣，欄位名會拼進 SQL，所以只能來自這張表。 */
export const PROFILE_UPDATABLE = ['display_name', 'avatar_id', 'skills', 'hours_per_week', 'bio'] as const

export interface ProfileRow {
  id: string
  display_name: string
  avatar_id: number
  skills: string[]
  hours_per_week: number | null
  bio: string | null
  updated_at: string
}

export async function profileById(id: string): Promise<ProfileRow | null> {
  const r = await db().query<ProfileRow>(`select ${PROFILE_COLUMNS} from profiles where id = $1`, [id])
  return r.rows[0] ?? null
}

export async function profileExists(id: string): Promise<boolean> {
  const r = await db().query('select 1 from profiles where id = $1', [id])
  return (r.rowCount ?? 0) > 0
}

export async function insertProfile(id: string, displayName: string): Promise<ProfileRow> {
  const r = await db().query<ProfileRow>(`insert into profiles (id, display_name) values ($1, $2) returning ${PROFILE_COLUMNS}`, [id, displayName])
  return r.rows[0] as ProfileRow
}

export async function credentialsOf(loginId: string): Promise<{ id: string; password_hash: string | null } | null> {
  const r = await db().query<{ id: string; password_hash: string | null }>('select id, password_hash from profiles where login_id = $1', [loginId])
  return r.rows[0] ?? null
}

export async function listProfiles(page: number): Promise<ProfileRow[]> {
  // 跟真後端一樣：`max(page, 0) * PAGE_SIZE`，翻過尾頁自然是 `[]`。
  const r = await db().query<ProfileRow>(`select ${PROFILE_COLUMNS} from profiles order by updated_at desc limit $1 offset $2`, [PAGE_SIZE, Math.max(page, 0) * PAGE_SIZE])
  return r.rows
}

/** 只更新有給的欄位（給 `null` 也算有給 —— Pydantic 的 `exclude_unset`）；`updated_at = now()`。 */
export async function updateProfile(id: string, fields: Partial<Record<(typeof PROFILE_UPDATABLE)[number], unknown>>): Promise<ProfileRow | null> {
  const names = PROFILE_UPDATABLE.filter((n) => n in fields)
  if (names.length === 0) return profileById(id)
  const assignments = names.map((n, i) => `${n} = $${i + 2}`).join(', ')
  const r = await db().query<ProfileRow>(
    `update profiles set ${assignments}, updated_at = now() where id = $1 returning ${PROFILE_COLUMNS}`,
    [id, ...names.map((n) => fields[n])],
  )
  return r.rows[0] ?? null
}
