import { z } from 'zod'

// 錯誤 envelope。規格 FE-O01「錯誤 envelope 只涵蓋 JSON 的錯誤回應」。
//
// **只描述線路上的形狀，不描述處置。**「401 要導向登入」「409 要重拉座位圖」
// 屬於 `FE-X03` 的唯一一份錯誤語彙，不在這裡。
// 也**不列舉 status code** —— 那會是一份沒有任何測試證明得了的清單。

/** FastAPI 自動產生的驗證錯誤項目。 */
export const ValidationError = z.object({
  loc: z.array(z.union([z.string(), z.number()])),
  msg: z.string(),
  type: z.string(),
  // ⚠️ 要 `.optional()`。`z.unknown()` 在 Zod 4 產生的是**必填**的鍵
  // （`unknown` 雖然包含 undefined，鍵本身仍是必填），而產出的型別是 `input?:`。
  // 少了它，涵蓋率之外的相等斷言會紅在這一條。
  input: z.unknown().optional(),
  ctx: z.record(z.string(), z.never()).optional(),
})

/**
 * ⚠️ **同一個 `detail` 鍵有兩種形狀。**
 *
 *   後端自己丟的       `{"detail": "這個座位已經有人了"}`   中文，可直接顯示
 *   框架自動產的 422   `{"detail": [{loc, msg, type}, …]}`  結構化，不適合直接顯示
 *
 * 而且 `profiles.py` 自己也會丟 detail 是字串的 422 —— **連 422 都不是單一形狀**。
 * 型別寫成 `detail: string` 會在第一個驗證錯誤時就爆掉。
 */
export const ErrorEnvelope = z.object({
  detail: z.union([z.string(), z.array(ValidationError)]),
})

export type ValidationError = z.infer<typeof ValidationError>
export type ErrorEnvelope = z.infer<typeof ErrorEnvelope>

/**
 * ⚠️ **500 不是 JSON。**
 *
 * 實測 `POST /api/login`（資料庫未連上）：
 *
 *     HTTP/1.1 500 Internal Server Error
 *     content-type: text/plain; charset=utf-8
 *
 *     Internal Server Error
 *
 * 而 500 正是**超長欄位**會走到的那一條路 —— 後端的長度規則只寫在資料庫，
 * 應用層刻意不檢查，所以超長的結果是資料庫錯誤直接冒出來。
 *
 * 也就是說「先 `JSON.parse` 再套 envelope」會在最容易發生的錯誤上直接拋。
 * 這個函式是給呼叫端在 parse 之前用的守衛。
 *
 * **歸一化成一個可顯示的錯誤不在這一層做** —— 那是 `FE-O02` 的 adapter
 * 與 `FE-X03` 的事（design.md 的 Open Questions）。
 */
export function isJsonErrorBody(contentType: string | null): boolean {
  if (contentType === null) return false
  return contentType.split(';')[0]?.trim().toLowerCase() === 'application/json'
}
