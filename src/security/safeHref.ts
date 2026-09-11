// 使用者給的網址只管一件事：scheme。規格 `FE-T06`〈`safeHref` 只放行白名單的 scheme，只管 scheme〉；design `D2`。
//
// `javascript:` 的變體太多（`JaVaScRiPt:`、`java\\tscript:`、前面帶空白）—— 用 URL 解析器把 scheme 正規化後看 `protocol`，
// 不用正則。`new URL()` 對相對路徑、空字串會**拋 `TypeError`**：包 `try/catch`，拋了就是 `null`。
//
// ⚠️ **只管 scheme**：`http://user:pw@host`、超長、Unicode host 都會過 —— 那是「網址在產品上合不合理」，`FE-T02` 的規格管。這裡是 XSS 的那一道。
// ⚠️ `mailto:` 不在白名單：沒有任何已合併的需求要它；要的時候跟需求一起加。

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:'])

/** 過了回正規化後的網址；scheme 不在白名單、或解析不了 → `null`。永不拋錯。 */
export function safeHref(raw: string): string | null {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return null
  }
  return ALLOWED_PROTOCOLS.has(url.protocol) ? url.href : null
}
