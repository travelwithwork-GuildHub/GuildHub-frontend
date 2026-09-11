import 'server-only'
import { db } from './db'
import { PAGE_SIZE, TS } from './profiles'

// 站內信的 SQL。規格 `FE-K01`〈本地後端與契約測試補上 messages〉—— 照真後端 `messages.py`。
//
// ⚠️⚠️ **主體條件在 SQL 的 WHERE 裡，不是取回來再過濾**（規格書 §4.3：站內信是全案唯一有實質洩漏風險的資源）。
// 取全部再 filter 的版本在測試裡看起來完全正常（結果一樣），問題是分頁會先套在「全部」上 —— 第 0 頁可能過濾完剩兩筆；
// 更要命的是任何一次重構漏掉那行 filter，全站的私訊就一次外洩。`tests/server-messages.test.ts` 守著這道 SQL 的形狀。
//
// 沒有 PATCH／DELETE（§4.2：講過的話不能反悔）。`read_at` 永遠是 null（`BE-G06`）。

const COLUMNS = `id, sender_id, recipient_id, body, ${TS('created_at')} as created_at, ${TS('read_at')} as read_at`

export interface MessageRow {
  id: string
  sender_id: string
  recipient_id: string
  body: string
  created_at: string
  read_at: string | null
}

/** 我寄的＋我收的，新到舊，20 一頁；翻過尾頁自然是 `[]`。 */
export async function listMessages(me: string, page: number): Promise<MessageRow[]> {
  const r = await db().query<MessageRow>(
    `select ${COLUMNS} from messages where (sender_id = $1 or recipient_id = $1) order by created_at desc limit $2 offset $3`,
    [me, PAGE_SIZE, Math.max(page, 0) * PAGE_SIZE],
  )
  return r.rows
}

/** `messages.recipient_id` 的 FK —— Postgres 對欄位上的 `references` 取的名字（`001_schema.sql:66`）。 */
export const RECIPIENT_FK = 'messages_recipient_id_fkey'

export type InsertMessageResult = { ok: true; row: MessageRow } | { ok: false; reason: 'self-send' | 'no-recipient' }

/**
 * 寄一封。寄給自己由資料庫的 `no_self_send` check 擋（不在這裡判斷 —— 真後端亦然）；收件人不存在是 FK（23503）。
 * 兩者以外的錯誤原樣拋（→ 500）。
 */
export async function insertMessage(me: string, recipientId: string, body: string): Promise<InsertMessageResult> {
  try {
    const r = await db().query<MessageRow>(
      `insert into messages (sender_id, recipient_id, body) values ($1, $2, $3) returning ${COLUMNS}`,
      [me, recipientId, body],
    )
    return { ok: true, row: r.rows[0] as MessageRow }
  } catch (error) {
    const e = error as { code?: unknown; constraint?: unknown }
    if (e.code === '23514' && String(e.constraint ?? '').includes('no_self_send')) return { ok: false, reason: 'self-send' }
    // 只認收件人那條 FK：sender 的 FK（session 指向已刪的名片）或日後別的 FK 是別的事，照 `FE-O03` 回 500（審查抓到的）。
    if (e.code === '23503' && e.constraint === RECIPIENT_FK) return { ok: false, reason: 'no-recipient' }
    throw error
  }
}
