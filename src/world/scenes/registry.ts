import { LAYOUT as HALL_LAYOUT, SPAWN as HALL_SPAWN } from '@/world/layout/guildHallLayout'
import { ROOM_LAYOUT, ROOM_SPAWN } from '@/world/layout/projectRoomLayout'
import type { LayoutItem } from '@/world/layout/types'

// 場景註冊表。規格 `FE-V01-S01`（design D1）。
//
// **場景的引用是一個封閉聯集，不是字串。** `'room:abc'` 這種字串要 parse 才知道
// `projectId`，而 parse 就是第二份規則。交給 WebSocket 的 `scene` 參數是**推導**出來的。
//
// ⚠️ **後端只認 `lobby` 與 `room:<id>`**（`scenes.py:11`），而且一條連線只屬於一個 scene ——
// 切場景＝關掉重開。這裡不為任何「視覺分區」預留欄位：那是 `BE-G09` 還沒裁決的事。

export type SceneRef = { readonly id: 'hall' } | { readonly id: 'room'; readonly projectId: string }

export interface SceneDef {
  /** 交給 WebSocket 的 `scene` 查詢參數。只有 `lobby` 與 `room:<uuid>` 兩種形狀。 */
  readonly wsScene: string
  readonly layout: readonly LayoutItem[]
  readonly spawn: { readonly x: number; readonly z: number }
  /** 要不要帶票。只有房間驗（`manager.py:71`）。 */
  readonly needsToken: boolean
}

/**
 * `projectId` 的合法域：**小寫** uuid。
 *
 * 後端的正規式 `[0-9a-zA-Z-]+` 比這寬，但前端的 id 只從 `GET /api/rooms` 與網址來，兩邊都是 uuid；
 * 收寬的話 `?room=abc` 這種東西會「程式內部進得去、序列化出來不穩定」。
 * 大寫也擋：網址那一層 canonical 成小寫，這裡若收大寫就有兩種寫法指同一間房。
 */
const PROJECT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

export class SceneRefError extends Error {
  override name = 'SceneRefError'
}

const HALL: SceneDef = { wsScene: 'lobby', layout: HALL_LAYOUT, spawn: HALL_SPAWN, needsToken: false }

export function sceneOf(ref: SceneRef): SceneDef {
  if (ref.id === 'hall') return HALL
  if (!PROJECT_ID.test(ref.projectId)) {
    throw new SceneRefError(`projectId 不是小寫 uuid：${JSON.stringify(ref.projectId)}`)
  }
  return { wsScene: `room:${ref.projectId}`, layout: ROOM_LAYOUT, spawn: ROOM_SPAWN, needsToken: true }
}

/** 兩個引用指的是不是同一個場景。`wsScene` 相同就是同一個。 */
export function sameScene(a: SceneRef, b: SceneRef): boolean {
  return a.id === b.id && (a.id !== 'room' || b.id !== 'room' || a.projectId === b.projectId)
}
