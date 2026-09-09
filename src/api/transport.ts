import type { z } from 'zod'
import { REST_CREDENTIALS, dataAdapter, restBase } from '@/config/env'
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

export interface RequestSpec {
  method: 'GET' | 'POST' | 'PATCH'
  /** 路徑樣板，例如 `/api/projects/{project_id}/seats`。 */
  path: string
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
 * 組出要送出去的 `Request`。
 *
 * **拆出來是為了驗得到 `credentials`。** 端到端的 cookie 在單元測試的環境裡
 * 驗不了（實測：jsdom 的 cookie jar 跟 Node 的 fetch 沒有連通，
 * server 收到的 `req.headers.cookie` 是 `null`），
 * 但 `Request` 物件上的 `credentials` 驗得到 —— 而它的**預設值是 `same-origin`**，
 * 所以「有沒有寫那一行」是量得出來的。規格 `FE-O02-S01`。
 */
export function buildRequest(spec: RequestSpec): Request {
  let path = spec.path
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
