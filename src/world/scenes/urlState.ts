import { CLOSED, parsePanelUrl, serializePanelUrl, type PanelUrlState } from '@/list-panel/urlState'

// `/world` 整段網址的 codec。規格 `FE-V01-S08`（design D2）。
//
// `?room=<uuid>` 表示人在哪一間 Project Room；沒有就是 Guild Hall。面板那三個參數的 codec 還是 `list-panel/urlState`
// 的 —— 這裡只**組合**：`room` 存在時面板參數一律去掉（房間裡沒有看板，也就沒有清單那一層）。
//
// canonical 對整段 query 成立：未知參數去掉、重複的 `room` 取第一個（`URLSearchParams.get` 的語意）、
// 大寫 uuid 轉小寫、順序固定 `room` → `panel` → `profile` → `page`。**解析出來的一定是 canonical 的**，
// 序列化再解析是定點 —— 不然每次掛載都會被判成「網址不一樣」而多寫一次（`FE-B09` 的同一個教訓）。

export interface WorldUrlState {
  /** 小寫 uuid；`null` 是 Guild Hall。 */
  readonly room: string | null
  /** `room` 非 null 時一定是 `CLOSED`。 */
  readonly panel: PanelUrlState
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function parseWorldUrl(search: string): WorldUrlState {
  const raw = new URLSearchParams(search).get('room')
  const room = raw !== null && UUID.test(raw) ? raw.toLowerCase() : null
  return { room, panel: room === null ? parsePanelUrl(search) : CLOSED }
}

/** 回 `''` 或 `?…`，可以直接接在 pathname 後面。 */
export function serializeWorldUrl(state: WorldUrlState): string {
  if (state.room !== null) return `?room=${state.room}`
  return serializePanelUrl(state.panel)
}
