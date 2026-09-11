import type { ValidationError } from '@/api/contract/errors'
import { ContractDriftError, HttpError } from '@/api/transport'

// 唯一一份錯誤語彙。規格 `FE-X03`（error-vocabulary）。
//
// 把資料層丟出來的**任何**東西翻譯成一個 `UiError`：一個封閉的 `kind`，
// 配一句前端自己寫的、安全的話。**這個檔案不畫任何東西** —— 清單的裝幀是
// `FE-X04`，表單是 `FE-X05`。
//
// ⚠️⚠️ **翻譯永遠不拋。** 一個在 catch 裡拋錯的翻譯器會把「拿不到清單」
// 升級成「整個面板炸掉」。所以這裡對輸入零信任：`instanceof` 先，讀屬性後，
// 連 `error.message` 這種看起來無害的讀取都包起來（規格 `S10` 餵的是一個
// 每個 getter 都會拋錯的物件）。
//
// ⚠️ **`message` 永遠是這裡的字，不是後端的、不是例外的。**
// `Internal Server Error`、Zod 的 `Expected string, received number`、`fetch failed`
// 出現在畫面上的那一天，使用者會拿它去搜尋，而不會去做對的事（`S12`）。
//
// ⚠️ **`HttpError` 只能被 `src/api/`（建立它）與這裡（翻譯它）引用**（`S16`）。
// 別處要知道「這個失敗是哪一種」，看 `kind`。

export type UiErrorKind =
  | 'authentication-required' // 401
  | 'permission-denied' // 403
  | 'not-found' // 404
  | 'conflict' // 409
  | 'validation' // 422、400
  | 'request-rejected' // 其他 4xx
  | 'server-error' // 5xx —— 含 text/plain 的資料庫錯誤，到這一層分不開（design D3）
  | 'network-unavailable' // fetch 在拿到回應之前 reject
  | 'contract-drift' // ContractDriftError
  | 'aborted' // AbortError —— 呼叫端自己中止的，不是錯誤
  | 'unexpected' // 認不得的一切，含 AdapterNotImplementedError

export interface UiError {
  kind: UiErrorKind
  /** 語彙表裡那一句。**永遠不是後端的字。** */
  message: string
  /** 欄位級驗證錯誤，原樣。給 `FE-X05`。 */
  issues?: ValidationError[]
  /** 後端寫的字串 `detail`。**未經信任的資料** —— 不是語彙，消費者要自己決定要不要用、怎麼用。 */
  detail?: string
  /** HTTP status，有的話。給 log 與除錯，**不給畫面決定用**。 */
  status?: number
  /** 原始的東西。給 log。 */
  cause: unknown
}

/**
 * 語彙表。**`Record` 讓「少一鍵」在 typecheck 就紅**（`S11`），
 * 每一句互不相同由 `S13` 守。
 *
 * ⚠️ 這裡是整個前端**唯一**可以出現這些句子的地方。`FE-X04` 與 `FE-X05`
 * 拿 `message` 去畫，不自己寫。
 */
export const VOCABULARY: Record<UiErrorKind, string> = {
  'authentication-required': '要先登入才看得到這裡。',
  'permission-denied': '你沒有權限做這件事。',
  'not-found': '找不到這個東西 —— 它可能已經被移除了。',
  conflict: '這件事跟目前的狀態衝突了，重新整理之後再試一次。',
  validation: '有些內容不符合要求。',
  'request-rejected': '這個請求沒有被接受。',
  'server-error': '伺服器暫時出了問題，稍後再試。',
  'network-unavailable': '連不上伺服器 —— 檢查一下網路。',
  'contract-drift': '收到的資料跟預期的不一樣，這一版可能需要更新。',
  aborted: '已取消。',
  unexpected: '發生了預期之外的錯誤。',
}

/** 把 status 對到種類。**這是整個前端唯一一張對照表。** */
function kindOfStatus(status: number): UiErrorKind {
  if (status >= 500) return 'server-error'
  switch (status) {
    case 401:
      return 'authentication-required'
    case 403:
      return 'permission-denied'
    case 404:
      return 'not-found'
    case 409:
      return 'conflict'
    case 400:
    case 422:
      return 'validation'
    default:
      return 'request-rejected'
  }
}

/** 讀一個可能會拋錯的屬性。翻譯器對輸入零信任（`S10`）。 */
function safeGet(value: unknown, key: string): unknown {
  try {
    return (value as Record<string, unknown>)[key]
  } catch {
    return undefined
  }
}

function fromHttp(error: HttpError): UiError {
  const kind = kindOfStatus(error.status)
  const out: UiError = { kind, message: VOCABULARY[kind], status: error.status, cause: error }
  // 欄位級錯誤**不論 status** 都原樣保留（`S14`）；字串 `detail` 留著但不是 `message`（`S15`）。
  if (Array.isArray(error.detail)) out.issues = error.detail
  else if (typeof error.detail === 'string') out.detail = error.detail
  return out
}

/**
 * 翻譯。**永遠回傳，永遠不拋。**
 *
 * 判斷順序是刻意的：先 `instanceof` 自己的型別（不讀任何屬性），
 * 再看 `name`（`AbortError` 是 `DOMException`，在 jsdom 與瀏覽器裡都不是同一個 class，
 * 只能認名字），最後才是「網路層的 `TypeError`」—— `fetch` 在拿到回應之前失敗
 * 就是一個 `TypeError`，這是 WHATWG 的規定，不是某個瀏覽器的習慣。
 */
export function toUiError(error: unknown): UiError {
  if (error instanceof HttpError) return fromHttp(error)
  if (error instanceof ContractDriftError) {
    return { kind: 'contract-drift', message: VOCABULARY['contract-drift'], cause: error }
  }
  const name = safeGet(error, 'name')
  if (name === 'AbortError') return { kind: 'aborted', message: VOCABULARY.aborted, cause: error }
  if (error instanceof TypeError) {
    return { kind: 'network-unavailable', message: VOCABULARY['network-unavailable'], cause: error }
  }
  // ⚠️ 純物件 `{ status: 401 }` **不是** 401 —— 形狀像不代表是 `HttpError`。
  // `AdapterNotImplementedError` 也落在這裡：它是開發期缺陷，不替它編一句像使用者錯誤的話。
  return { kind: 'unexpected', message: VOCABULARY.unexpected, cause: error }
}
