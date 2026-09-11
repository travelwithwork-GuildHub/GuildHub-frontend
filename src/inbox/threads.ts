import type { MessageOut } from '@/api/contract/rest'
import { codePointLength } from '@/api/contract/limits'

// 站內信的推導：扁平清單 → 對話。規格 `FE-K01`〈清單是對話，不是信〉；design `D2`、`D5`。
//
// 後端給的是一份混合清單（我寄的＋我收的，新到舊，20 一頁）。對話是**前端推導**出來的：以對方分組；「載入更多」之後
// 重新分組整份已載入的信（同一個對方會出現在多頁）。**這裡全是純函式**，沒有 React、沒有請求。

export interface Thread {
  /** 對方的名片 id。 */
  with: string
  /** 舊到新（詳情由上往下讀）。 */
  messages: MessageOut[]
  /** 最新一封。 */
  latest: MessageOut
}

/** 一封信的對方：`sender_id`／`recipient_id` 裡不是我的那個。 */
export function counterpartOf(message: MessageOut, me: string): string {
  return message.sender_id === me ? message.recipient_id : message.sender_id
}

/** 以 `id` 合併、**只增不減**：GET 不會覆寫 POST 已合併的；重複的（同一封兩次載入）只留一份。 */
export function mergeById(existing: readonly MessageOut[], incoming: readonly MessageOut[]): MessageOut[] {
  const seen = new Set(existing.map((m) => m.id))
  const out = [...existing]
  for (const m of incoming) {
    if (seen.has(m.id)) continue
    seen.add(m.id)
    out.push(m)
  }
  return out
}

/**
 * 分組：同一個對方一組；組內依 `created_at` 舊到新；組依最新一封新到舊排。以 `id` 去重。
 * `created_at` 是 ISO 字串（`YYYY-MM-DDTHH:MM:SS.ssssssZ`），字串比較就是時間比較。
 */
export function groupThreads(messages: readonly MessageOut[], me: string): Thread[] {
  const byWith = new Map<string, MessageOut[]>()
  for (const m of mergeById([], messages)) {
    const key = counterpartOf(m, me)
    const list = byWith.get(key)
    if (list) list.push(m)
    else byWith.set(key, [m])
  }
  const threads: Thread[] = []
  for (const [withId, list] of byWith) {
    list.sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0))
    threads.push({ with: withId, messages: list, latest: list[list.length - 1] as MessageOut })
  }
  threads.sort((a, b) => (a.latest.created_at > b.latest.created_at ? -1 : a.latest.created_at < b.latest.created_at ? 1 : 0))
  return threads
}

export const PREVIEW_LENGTH = 40

/** 清單的摘要：連續空白（含換行、tab）壓成一個空格、trim，再取前 40 個 code point（超過加「…」）。 */
export function preview(body: string, length = PREVIEW_LENGTH): string {
  const flat = body.replace(/\s+/gu, ' ').trim()
  if (codePointLength(flat) <= length) return flat
  return `${[...flat].slice(0, length).join('')}…`
}

/** 名字解析不到時顯示的縮短 id：前 4 碼…後 4 碼。 */
export function shortId(id: string): string {
  return `${id.slice(0, 4)}…${id.slice(-4)}`
}
