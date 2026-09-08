// 長度與範圍限制的**單一來源**。規格 FE-O01「長度與範圍限制有單一來源」。
//
// ⚠️ **後端的 OpenAPI 產不出這些數字** —— 整份沒有任何 `maxLength` / `minimum`。
// 所以下面每一個值都是人工從資料庫 schema 抄過來的，**沒有任何機器在對它們**。
// 抓得到這種漂移的是 FE-O05 對真後端的成對邊界測試（W2）。
//
// 為什麼前端非擋不可：**後端超長欄位回 500，不是 422**。
// 長度規則只寫在資料庫，應用層刻意不重複檢查
// （`API-前端整合指南.md` §8）。前端不擋的話，使用者會拿到一個看不懂的
// 伺服器錯誤，而且那個錯誤**不是 JSON**（實測是 text/plain 的
// `Internal Server Error`）。
//
// 長度單位是 **Unicode code point**，與後端一致：
//   後端 Postgres  char_length()   數 code point
//   後端 Python    len()           數 code point
//   Zod            .max()          數 code point（官方文件保證）
// **不是 UTF-16 code unit** —— 用 JS 的 `.length` 會拒絕後端收得下的字串。
// 釘住這件事的測試在 `limits.test.ts`。

/** 「後端沒有上限，前端也還沒決定」。**不要省略這個鍵** —— 省略跟「沒查過」看起來一樣。 */
export const UNBOUNDED = null

/**
 * 每一個值後面的出處是**逐行**對過的，不是照抄散文。
 *
 * `sql/001_schema.sql`
 *   13  display_name   text not null check (char_length(display_name) between 1 and 20)
 *   17  bio            text check (char_length(bio) <= 300)
 *   27  title          text not null                     ← 沒有 check
 *   28  body           text not null                     ← 沒有 check
 *   53  constraint seat_in_range check (seat_index >= 0 and seat_index < 8)
 *   61  body           text not null check (char_length(body) between 1 and 2000)
 *
 * `app/realtime/presence.py`
 *   10  STATUS_MAX_CHARS = 12
 */
export const LIMITS = {
  /** `profiles.display_name`。 */
  displayName: { min: 1, max: 20 },
  /** `profiles.bio`。可以是空的。 */
  bio: { min: 0, max: 300 },
  /** `messages.body`。站內信內文。 */
  messageBody: { min: 1, max: 2000 },
  /**
   * WS 狀態文字。**超過會被後端靜默丟棄，舊狀態不變** ——
   * 使用者會以為壞掉，所以前端一定要擋。
   */
  statusText: { min: 0, max: 12 },
  /**
   * `seats.seat_index`。資料庫的 check 是 `>= 0 and < 8`（硬上界）。
   * ⚠️ **另外還要 `< 專案的 seat_count`**，那一條在應用層（`seats.py` 回 400），
   * 不在資料庫 —— 而且是每個專案不同的值，所以放不進這張表。
   */
  seatIndex: { min: 0, max: 7 },

  /**
   * ⚠️ **後端完全沒有上限的欄位。** 記成 `UNBOUNDED` 而不是省略。
   *
   * 前端自己的上限由 `FE-X05` 決定（WBS：「後端完全沒有上限 —— 前端自己訂並寫進規格」）。
   * 在那之前這裡是 `null`，代表「查過了，沒有」，不是「還沒查」。
   */
  projectTitle: { min: 1, max: UNBOUNDED },
  projectBody: { min: 1, max: UNBOUNDED },
  /** `skills` / `needed_skills` 是 `text[]`，數量與每一項的長度都沒有上限。 */
  skillCount: { min: 0, max: UNBOUNDED },
  skillLength: { min: 1, max: UNBOUNDED },
} as const

/** 後端 `list_*` 的 offset 翻頁大小。沒有 total、沒有 `has_more`（`BE-G05`）。 */
export const PAGE_SIZE = 20
