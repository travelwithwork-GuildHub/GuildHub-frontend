import type { ListKind } from './paging'

// 網址 ⇄ 面板狀態。規格 `FE-B09`〈網址表示開著哪一層，複製它就能還原〉。
//
// `/world?panel=profiles&profile=<id>&page=N`：開著哪一種清單、哪一筆詳情、第幾頁。
// 這裡是**純函式**：解析（含 canonical 化，design `D5`）與序列化。誰去讀 `window.location`、
// 誰去寫 `history` 在 `PanelUrlSync`。
//
// ⚠️ **解析出來的一定是 canonical 的。** `page=0` 省略、`page=abc` 去掉、`panel=bogus` 全部去掉、
// 單獨的 `profile` 視為 `panel=profiles`、`panel=projects` 帶 `profile` 去掉 `profile`（案件面板沒有人才詳情）。
// 寫回時比較的是「序列化後一不一樣」—— 解析不 canonical 的話，`?page=0` 每次掛載都會被判成「網址不一樣」而多寫一次。

export interface PanelUrlState {
  panel: ListKind | null
  /** 只有 `panel === 'profiles'` 時才會非 null。 */
  profile: string | null
  /** 0-based。`panel === null` 時一定是 0。 */
  page: number
}

export const CLOSED: PanelUrlState = { panel: null, profile: null, page: 0 }

const KINDS: readonly ListKind[] = ['projects', 'profiles']
/** `<id>` 只做形狀檢查；存不存在由 `GET /api/profiles/{id}` 的 404 決定（`FE-X04`）。 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function parsePage(raw: string | null): number {
  // `-1`、`abc`、`1.5`、`1e2` 都不是頁碼：只收十進位非負整數的寫法。
  // 超過安全整數的也不是（審查抓到的）：`Number('9'.repeat(20))` 序列化回去不是同一串，canonical 就不是定點。
  if (raw === null || !/^\d+$/.test(raw)) return 0
  const page = Number(raw)
  return Number.isSafeInteger(page) ? page : 0
}

/** `search` 是 `window.location.search` 那種形狀（可帶或不帶 `?`）。 */
export function parsePanelUrl(search: string): PanelUrlState {
  const params = new URLSearchParams(search)
  const rawPanel = params.get('panel')
  const rawProfile = params.get('profile')
  const profile = rawProfile !== null && UUID.test(rawProfile) ? rawProfile : null
  // 沒有 `panel` 但有合法的 `profile`：視為人才面板。
  const panel = rawPanel === null && profile !== null ? 'profiles' : (KINDS as readonly string[]).includes(rawPanel ?? '') ? (rawPanel as ListKind) : null
  if (panel === null) return CLOSED
  return { panel, profile: panel === 'profiles' ? profile : null, page: parsePage(params.get('page')) }
}

/** 回 `''` 或 `?panel=…`，可以直接接在 pathname 後面。 */
export function serializePanelUrl(state: PanelUrlState): string {
  if (state.panel === null) return ''
  const params = new URLSearchParams({ panel: state.panel })
  if (state.profile !== null) params.set('profile', state.profile)
  if (state.page > 0) params.set('page', String(state.page))
  return `?${params.toString()}`
}

/** 開著幾層：世界 0、清單 1、詳情 2。上一頁／Escape 一次少一層。 */
export function depthOf(state: PanelUrlState): 0 | 1 | 2 {
  if (state.panel === null) return 0
  return state.profile === null ? 1 : 2
}
