import 'server-only'
import type { z } from 'zod'
import { HttpError, UNAUTHENTICATED } from './errors'
import { ValidationFailure, parseOr422, readJsonObject } from './validation'
import { profileExists } from '../profiles'
import { sessionIdFrom } from '../session'

// 本地後端每一個 method handler 都走的管線。規格 `FE-O03`〈每個 handler 走同一條管線，錯誤形狀複製真後端〉。
//
//   讀 session → （要登入的話）名片還在？ → 解析 body → 呼叫 fn → 回應
//
// 錯誤對映（**刻意複製真後端**，整合指南 §4／§8）：
//   HttpError(status, detail)      → status + {"detail": "<中文>"}
//   ValidationFailure              → 422 + {"detail": [Pydantic 形狀…]}
//   資料庫 check／唯一鍵違反、其他例外 → 500、text/plain、`Internal Server Error`
//
// ⚠️ **這裡不擋長度。** 真後端把長度只寫在資料庫（應用層刻意不重複），超長是 500 不是 422。
// 本地版回 422 會比真後端「好用」—— 那是在製造假象（WBS 的 Alarm）。

export interface HandlerContext<B> {
  /** 登入的名片 id；`auth: 'none'` 時可能是 null。 */
  me: string | null
  body: B
  request: Request
  params: Record<string, string>
  url: URL
}

export interface HandleOptions<B> {
  auth: 'required' | 'none'
  /** 有給就讀 body 並解析；沒給就不碰 body（GET）。 */
  body?: z.ZodType<B>
}

type RouteContext = { params: Promise<Record<string, string>> }
export type Handler = (request: Request, context: RouteContext) => Promise<Response>

/** handler 回一個值就當 200 JSON；要別的 status 就回 `Response`。 */
export type HandlerResult = Response | unknown

export function json(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
  })
}

function detail(status: number, text: string): Response {
  return json({ detail: text }, { status })
}

/** 真後端的 500：**不是 JSON**（實錄：`text/plain; charset=utf-8`，body 正好是 `Internal Server Error`）。 */
function internalServerError(cause: unknown): Response {
  console.error('[internal-backend] 500：', cause)
  return new Response('Internal Server Error', { status: 500, headers: { 'content-type': 'text/plain; charset=utf-8' } })
}

export function handle<B = undefined>(options: HandleOptions<B>, fn: (ctx: HandlerContext<B>) => Promise<HandlerResult>): Handler {
  return async (request, context) => {
    try {
      const me = sessionIdFrom(request.headers.get('cookie'))
      if (options.auth === 'required') {
        // 篡改、沒帶、或資料庫重建過（名片沒了）→ 一律未登入（`S07`、`S08`）。
        if (me === null || !(await profileExists(me))) throw UNAUTHENTICATED()
      }
      const body = options.body === undefined ? (undefined as B) : parseOr422(options.body, await readJsonObject(request), 'body')
      const result = await fn({ me, body, request, params: await context.params, url: new URL(request.url) })
      return result instanceof Response ? result : json(result)
    } catch (e) {
      if (e instanceof HttpError) return detail(e.status, e.detail)
      if (e instanceof ValidationFailure) return json({ detail: e.errors }, { status: 422 })
      // 資料庫的 check（23514）、唯一鍵（23505）、太長（22001）、跟任何沒想到的事：都是 500。
      return internalServerError(e)
    }
  }
}
