import type { ListKind } from './paging'

// 網址 ⇄ 面板狀態。規格 `FE-B09`〈網址表示開著哪一層，複製它就能還原〉（`FE-B03` 加 `project`）。
//
// `/world?panel=profiles&profile=<id>&page=N`、`/world?panel=projects&project=<id>&page=N`：開著哪一種清單、哪一筆詳情、第幾頁。
// 這裡是**純函式**：解析（含 canonical 化，design `D5`）與序列化。誰去讀 `window.location`、
// 誰去寫 `history` 在 `PanelUrlSync`（`WorldUrlSync`；`FE-V01` 之後它也管 `room`）。
//
// ⚠️ **解析出來的一定是 canonical 的。** `page=0` 省略、`page=abc` 去掉、`panel=bogus` 全部去掉（**不**因 `profile`／`project` 推導面板）、
// 單獨的 `profile` 視為 `panel=profiles`、單獨的 `project` 視為 `panel=projects`、兩個單獨同時出現取 `profile`（要有一個確定的答案，選既有的那個）、
// 帶錯面板的詳情參數去掉（`panel=projects` 帶 `profile`、`panel=profiles` 帶 `project`）、同名重複取第一個（`URLSearchParams.get`）。
// 寫回時比較的是「序列化後一不一樣」—— 解析不 canonical 的話，`?page=0` 每次掛載都會被判成「網址不一樣」而多寫一次。

export interface PanelUrlState {
  panel: ListKind | null
  /** 只有 `panel === 'profiles'` 時才會非 null。 */
  profile: string | null
  /** 只有 `panel === 'projects'` 時才會非 null（`FE-B03`）。 */
  project: string | null
  /** 0-based。`panel === null` 時一定是 0。 */
  page: number
}

export const CLOSED: PanelUrlState = { panel: null, profile: null, project: null, page: 0 }

const KINDS: readonly ListKind[] = ['projects', 'profiles']
/** `<id>` 只做形狀檢查；存不存在由 `GET /api/profiles/{id}`／`GET /api/projects/{id}` 的 404 決定（`FE-X04`）。 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function parsePage(raw: string | null): number {
  // `-1`、`abc`、`1.5`、`1e2` 都不是頁碼：只收十進位非負整數的寫法。
  // 超過安全整數的也不是（審查抓到的）：`Number('9'.repeat(20))` 序列化回去不是同一串，canonical 就不是定點。
  if (raw === null || !/^\d+$/.test(raw)) return 0
  const page = Number(raw)
  return Number.isSafeInteger(page) ? page : 0
}
const parseId = (raw: string | null) => (raw !== null && UUID.test(raw) ? raw : null)

/** `search` 是 `window.location.search` 那種形狀（可帶或不帶 `?`）。 */
export function parsePanelUrl(search: string): PanelUrlState {
  const params = new URLSearchParams(search)
  const rawPanel = params.get('panel')
  const profile = parseId(params.get('profile'))
  const project = parseId(params.get('project'))
  // 沒有 `panel` 但有合法的詳情參數：視為對應的面板（兩個都有取 `profile`）。
  const inferred = profile !== null ? 'profiles' : project !== null ? 'projects' : null
  const panel = rawPanel === null ? inferred : (KINDS as readonly string[]).includes(rawPanel) ? (rawPanel as ListKind) : null
  if (panel === null) return CLOSED
  return {
    panel,
    profile: panel === 'profiles' ? profile : null,
    project: panel === 'projects' ? project : null,
    page: parsePage(params.get('page')),
  }
}

/** 回 `''` 或 `?panel=…`，可以直接接在 pathname 後面。 */
export function serializePanelUrl(state: PanelUrlState): string {
  if (state.panel === null) return ''
  const params = new URLSearchParams({ panel: state.panel })
  // 序列化也只認對應面板的那一個：拿到錯位的狀態（`profiles` 帶 `project`）不能寫出非 canonical 的網址（審查抓到的）
  if (state.panel === 'profiles' && state.profile !== null) params.set('profile', state.profile)
  if (state.panel === 'projects' && state.project !== null) params.set('project', state.project)
  if (state.page > 0) params.set('page', String(state.page))
  return `?${params.toString()}`
}

/** 開著幾層：世界 0、清單 1、詳情 2。上一頁／Escape 一次少一層。 */
export function depthOf(state: PanelUrlState): 0 | 1 | 2 {
  if (state.panel === null) return 0
  return state.profile === null && state.project === null ? 1 : 2
}
