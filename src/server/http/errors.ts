// 本地後端的錯誤型別。規格 `FE-O03`〈每個 handler 走同一條管線，錯誤形狀複製真後端〉。
//
// handler 只拋 `HttpError(status, detail)`；`handle()` 把它對映成 `{"detail": "<中文>"}`。
// 這裡**不做**長度檢查、也不把資料庫的 check 違反翻成 422 —— 那是 500 text/plain（真後端亦然）。

export class HttpError extends Error {
  override name = 'HttpError'
  constructor(
    readonly status: 401 | 403 | 404 | 409 | 400,
    readonly detail: string,
  ) {
    super(detail)
  }
}

export const UNAUTHENTICATED = () => new HttpError(401, '未登入')
