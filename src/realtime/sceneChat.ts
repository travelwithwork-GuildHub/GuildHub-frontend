import type { ChatOut } from '@/api/contract/ws'

// `ws.ts` 的 `ChatOut` 同名匯出 schema（值）與型別；這裡只要型別 —— `import type` 在 import 圖上不留邊。

// 場景聊天的記憶體。規格 `FE-R11`〈目前場景最多留 100 筆、每則最多保留 2000 code point；不用 Web Storage、不呼叫 REST〉（design D3、D5）。
//
// **純 reducer**：不知道 socket、不知道驗證器、不碰 storage —— 這個檔案的 import 圖是 `FE-R11-S05` 的靜態邊界在守的東西
// （不到 `src/api/operations`、`src/api/transport`、任何會碰 storage 的模組）。誰餵它、什麼時候清，是 `sceneChatPort`／`SceneChatProvider` 的事。
//
// 順序＝通過驗證的接收順序（協定沒有 id、沒有時間戳，不發明排序）。淘汰從最舊端。
// 單則 `body` 的預算是**客戶端的資源政策**（後端對 `body` 沒有上限，`LIMITS.chatBody` 如實記 UNBOUNDED）：
// 超過只留前 2000 個 code point、標 `truncated`，那一則仍是一筆紀錄 —— 不丟、不拒收；`name`／`id` 沒有預算。
// 2000 取 Inbox 的既有上限（`LIMITS.messageBody.max`），是產品決定；要改是重開 spec PR。

/** 目前場景最多留幾筆。產品決定（旁觀「最近在聊什麼」，不是歷史）。 */
export const CHAT_KEEP = 100
/** 單則保存的 `body` 預算（code point）。 */
export const CHAT_BODY_BUDGET = 2000

export interface ChatRecord {
  readonly id: string
  readonly name: string
  /** 保存的內文：原值，或前 `CHAT_BODY_BUDGET` 個 code point（那時 `truncated` 是 true）。**沒有 trim、沒有轉義。** */
  readonly body: string
  readonly truncated: boolean
}

export type ChatLog = readonly ChatRecord[]

export const EMPTY_CHAT: ChatLog = []

/** 按 code point 截（`.length` 數的是 UTF-16 code unit，emoji 會被切成半個）。單次迭代：最多收 `budget` 個，第 `budget + 1` 個一出現就截、不再往下走。 */
function keepCodePoints(s: string, budget: number): { body: string; truncated: boolean } {
  const kept: string[] = []
  for (const ch of s) {
    if (kept.length === budget) return { body: kept.join(''), truncated: true }
    kept.push(ch)
  }
  return { body: s, truncated: false }
}

/** 一則通過驗證的 `ChatOut` 進來：建一筆紀錄、超過筆數就淘汰最舊的。**不看內容、不看是不是自己**（回聲照收，design D2）。 */
export function appendChat(log: ChatLog, message: ChatOut): ChatLog {
  const { body, truncated } = keepCodePoints(message.body, CHAT_BODY_BUDGET)
  const record: ChatRecord = { id: message.id, name: message.name, body, truncated }
  const next = log.length >= CHAT_KEEP ? log.slice(log.length - CHAT_KEEP + 1) : log
  return [...next, record]
}
