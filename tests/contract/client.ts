// 契約測試的 HTTP client。規格 `FE-O05`〈唯一一份，兩個目標各跑一次，都走真 HTTP〉。
//
// 兩件事這裡替每個測試做掉：
//   1. **cookie jar** —— Node 的 `fetch` 不會記 `Set-Cookie`，登入之後的第二個請求會像沒登入（審查兩位都點到）。
//   2. **raw request** —— 不經 `src/api/operations.ts`：那一層在送出前就用 Zod 擋掉 `max+1`，經過它永遠看不到後端的 500。
//
// 這是**測試用的** fetch，不在 `src/`；`src/` 裡的 no-fetch lint 規則不管這裡。

import { inject } from 'vitest'

export interface RawResponse {
  status: number
  contentType: string
  text: string
  /** 只有 `Content-Type` 是 JSON 才解析；不是的話是 `undefined`（500 是 text/plain）。 */
  json: unknown
  headers: Headers
}

export interface RawOptions {
  /** 物件會被 `JSON.stringify` 並加 `Content-Type: application/json`；字串原樣送、不加 header（測「非 JSON」與「缺 Content-Type」用）。 */
  body?: unknown
  headers?: Record<string, string>
}

export class ContractClient {
  private readonly jar = new Map<string, string>()

  /** `remember: false` 是真的沒有 jar：`Set-Cookie` 看過就丟。`S03` 用它證明 jar 不是恆真。 */
  constructor(
    readonly base: string,
    private readonly remember = true,
  ) {}

  async raw(method: string, path: string, { body, headers = {} }: RawOptions = {}): Promise<RawResponse> {
    const init: RequestInit = { method, headers: { ...headers }, redirect: 'manual' }
    if (body !== undefined) {
      if (typeof body === 'string') init.body = body
      else {
        init.body = JSON.stringify(body)
        ;(init.headers as Record<string, string>)['content-type'] ??= 'application/json'
      }
    }
    if (this.jar.size > 0) {
      ;(init.headers as Record<string, string>).cookie = [...this.jar].map(([k, v]) => `${k}=${v}`).join('; ')
    }
    const response = await fetch(`${this.base}${path}`, init)
    for (const line of this.remember ? response.headers.getSetCookie() : []) {
      const [pair] = line.split(';')
      const eq = pair?.indexOf('=') ?? -1
      if (pair !== undefined && eq > 0) this.jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim())
    }
    const text = await response.text()
    const contentType = response.headers.get('content-type') ?? ''
    let json: unknown
    if (contentType.includes('application/json')) {
      try {
        json = JSON.parse(text)
      } catch {
        json = undefined
      }
    }
    return { status: response.status, contentType, text, json, headers: response.headers }
  }

  /** 以暱稱登入（建一張新名片），cookie 進 jar。回 `ProfileOut`（未解析，測試自己驗形狀）。 */
  async login(nickname: string): Promise<Record<string, unknown>> {
    const r = await this.raw('POST', '/api/login', { body: { nickname } })
    if (r.status !== 200) throw new Error(`login 失敗：${r.status} ${r.text.slice(0, 200)}`)
    return r.json as Record<string, unknown>
  }

  /** 沒有 jar 的那種：同一個 base，但不記 cookie。 */
  forgetful(): ContractClient {
    return new ContractClient(this.base, false)
  }

  cookies(): ReadonlyMap<string, string> {
    return this.jar
  }
}

/** 這一輪的目標位址：由 harness `provide`。測試檔只認這個，不看環境變數（`S02`）。 */
export function baseUrl(): string {
  return inject('contractBaseUrl')
}
export function wsUrl(): string {
  return inject('contractWsUrl')
}

declare module 'vitest' {
  export interface ProvidedContext {
    contractBaseUrl: string
    contractWsUrl: string
  }
}
