import type { z } from 'zod'
import { REST_CREDENTIALS, dataAdapter, restBase } from '@/config/env'
import type { paths } from './contract/schema'
import { ErrorEnvelope } from './contract/errors'

// 所有 domain operation 的共同管道。規格 `FE-O02`。
//
// ⚠️ **這是整個 `src/` 底下唯一一個呼叫 `fetch` 的地方。**
// `eslint.config.mjs` 有一條規則擋掉元件裡的 `fetch`；那條規則允許 `src/api/**`，
// 而這個檔案是那個允許範圍裡唯一用到它的。
//
// ⚠️ **位址與憑證都不在這裡決定** —— 兩者從 `src/config/env.ts` 來，
// 那是唯一准許讀 `process.env` 的檔案，而它對「部署出去卻沒設位址」的處置
// 是拋錯而不是退回 localhost。在這裡寫死位址會繞過那道防線。

/** 這個 adapter 還沒有後端可以連。規格 `FE-O02-S02`。 */
export class AdapterNotImplementedError extends Error {
  override name = 'AdapterNotImplementedError'
  constructor(
    readonly operation: string,
    readonly adapter: string,
  ) {
    super(
      `操作「${operation}」在 adapter「${adapter}」還沒有實作。` +
        'internal adapter 的後端是 FE-O03（Route Handlers）與 FE-O04（可拋棄資料庫），' +
        '兩者都是 W2。現在要用真後端的話，把 NEXT_PUBLIC_DATA_ADAPTER 設成 guildhub。',
    )
  }
}

/** 回來的東西不符合契約。規格 `FE-O02-S05`。 */
export class ContractDriftError extends Error {
  override name = 'ContractDriftError'
  constructor(
    readonly operation: string,
    readonly issues: z.core.$ZodIssue[],
  ) {
    super(
      `操作「${operation}」的回應不符合契約：` +
        issues.map((i) => `${i.path.join('.') || '(根)'} ${i.message}`).join('；') +
        '。這是後端形狀改變了，或者契約寫錯了 —— 兩種都要人看，' +
        '不要在呼叫端加防禦性判斷把它蓋掉。',
    )
  }
}

/** 後端回了 4xx／5xx。規格 `FE-O02-S07`。 */
export class HttpError extends Error {
  override name = 'HttpError'
  constructor(
    readonly operation: string,
    readonly status: number,
    /** 後端的 `detail`。**兩種形狀** —— 字串或結構化的驗證錯誤（見 `errors.ts`）。 */
    readonly detail: ErrorEnvelope['detail'] | null,
  ) {
    super(`操作「${operation}」失敗（HTTP ${status}）。`)
  }
}

/**
 * 這個管道認得的 HTTP method → 產出型別檔裡的鍵。
 *
 * ⚠️ **要多支援一個 method 就要在這裡加一列**，而不是在 `RequestSpec` 裡
 * 把字面值聯集加寬 —— 加寬那邊而漏掉這裡的話，新的 method 會退化成
 * 「路徑完全不受約束」，而那正是下面這一整套要防的事。
 */
type METHODS = {
  GET: 'get'
  POST: 'post'
  PATCH: 'patch'
}

/**
 * 產出型別檔中、`M` 這個 method 確實存在的路徑。
 *
 * ⚠️ **這是 `schema.d.ts` 唯一被當成「型別來源」用的地方，而且是刻意的。**
 * `GENERATED.md` 說不要 import 它來當型別用 —— 那條講的是**實體的資料形狀**
 *（型別的來源是 `rest.ts` 的 Zod，複製第二份就會漂）。
 * 路徑不一樣：路徑只有後端說了算，前端沒有第二份定義可以漂，
 * 而產出的型別檔是它在這個 repo 裡唯一的形式化紀錄。
 *
 * openapi-typescript 對「這條路徑上沒有這個 method」產的是 `get?: never`，
 * 所以那一格的型別是 `undefined`；有的話是 `operations["…"]`。
 * **判斷條件因此是 `extends undefined` 而不是 `extends never`** ——
 * 寫成後者的話每一格都不符合，聯集會變成 `never`，
 * 而 `never` 會讓每一個呼叫點都紅（看起來像「防禦很嚴格」，實際上是壞掉）。
 */
type PathsWith<M extends METHODS[keyof METHODS]> = {
  [P in keyof paths]: paths[P][M] extends undefined ? never : P
}[keyof paths]

interface RequestBase {
  /** 路徑參數。**會做 URL 編碼** —— 不編碼的話 id 裡的斜線會改變路由。 */
  params?: Record<string, string>
  /** 已經通過契約驗證的 body。`undefined` 代表不送 body。 */
  body?: unknown
  /**
   * 中止訊號。
   *
   * ⚠️ **這是「取消」，不是「不採用結果」。** 兩者差在請求還在不在飛 ——
   * 一個只被標成「結果不要」的請求仍然佔著「同時最多一個」的名額
   *（`FE-W12` 的輪詢契約踩過這個矛盾）。
   */
  signal?: AbortSignal
}

/**
 * 一個要送出去的請求。規格 `FE-A01-S13`／`S14`／`S15`。
 *
 * ⚠️⚠️ **`path` 不是 `string`，而且那是這整段的重點。**
 * 它是**跟 `method` 綁在一起**的字面值聯集 —— `GET` 只收產出型別檔中
 * 真的有 `get` 的路徑，`POST` 只收真的有 `post` 的。
 *
 * 這條約束在的理由是一個**已經發生過的 bug**：`getMyProfile` 打
 * `GET /api/profiles/me`，而那個端點從來不存在（該路徑只有 `PATCH`）。
 * 它活過了每一次 CI，因為 `tests/api-operations-coverage.test.ts`
 * **把同一個錯誤的字串抄進了斷言** —— 斷言與被測物來自同一個錯誤。
 *
 * ⚠️ **把 `path` 改回 `string` 的話，沒有任何測試會紅。**
 * 兩個獨立的審查者都確認過這一點。它是這件事唯一的守門員，
 * 而唯一的守門員被拿掉時不會有人知道 —— 所以這段話寫在這裡。
 */
export type RequestSpec = {
  [M in keyof METHODS]: RequestBase & { method: M; path: PathsWith<METHODS[M]> }
}[keyof METHODS]

/**
 * 組出要送出去的 `Request`。
 *
 * **拆出來是為了驗得到 `credentials`。** 端到端的 cookie 在單元測試的環境裡
 * 驗不了（實測：jsdom 的 cookie jar 跟 Node 的 fetch 沒有連通，
 * server 收到的 `req.headers.cookie` 是 `null`），
 * 但 `Request` 物件上的 `credentials` 驗得到 —— 而它的**預設值是 `same-origin`**，
 * 所以「有沒有寫那一行」是量得出來的。規格 `FE-O02-S01`。
 */
export function buildRequest(spec: RequestSpec): Request {
  // ⚠️ **型別標註不能省。** `spec.path` 是字面值聯集，推論出來的 `path`
  // 會跟著窄成那個聯集，而下一行的 `.replace()` 回傳 `string` —— 不標的話
  // 「填完路徑參數之後的字串」會被當成違反契約。窄的是**送進來的樣板**，
  // 不是填完之後的結果。
  let path: string = spec.path
  for (const [key, value] of Object.entries(spec.params ?? {})) {
    path = path.replace(`{${key}}`, encodeURIComponent(value))
  }
  const init: RequestInit = {
    method: spec.method,
    credentials: REST_CREDENTIALS,
  }
  if (spec.signal !== undefined) init.signal = spec.signal
  if (spec.body !== undefined) {
    init.body = JSON.stringify(spec.body)
    init.headers = { 'content-type': 'application/json' }
  }
  return new Request(`${restBase()}${path}`, init)
}

/**
 * 送出一個請求並用契約解析回應。
 *
 * ⚠️ **adapter 的判斷在最前面，在建立任何請求之前。**
 * 放在後面的話，`internal` 模式下會先送出去、失敗了才拋錯 ——
 * 那等於偷偷打到真後端（規格 `FE-O02-S02` 明文要求「不得送出任何網路請求」）。
 */
export async function send<T>(
  operation: string,
  spec: RequestSpec,
  output: z.ZodType<T>,
): Promise<T> {
  const adapter = dataAdapter()
  if (adapter !== 'guildhub') {
    throw new AdapterNotImplementedError(operation, adapter)
  }

  const response = await fetch(buildRequest(spec))

  if (!response.ok) {
    // 錯誤 body 解不出來不是致命的 —— 真正要傳出去的是 status。
    // 硬要解析的話，一個回 HTML 的 502 會變成 JSON 解析錯誤，而那會蓋掉 502。
    let detail: ErrorEnvelope['detail'] | null = null
    try {
      const parsed = ErrorEnvelope.safeParse(await response.json())
      if (parsed.success) detail = parsed.data.detail
    } catch {
      detail = null
    }
    throw new HttpError(operation, response.status, detail)
  }

  const parsed = output.safeParse(await response.json())
  if (!parsed.success) {
    throw new ContractDriftError(operation, parsed.error.issues)
  }
  return parsed.data
}
