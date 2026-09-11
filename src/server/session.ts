import 'server-only'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { internalSessionSecret } from '@/config/env'

// 本地後端的 session cookie。規格 `FE-O03`〈session 是簽章的 HttpOnly cookie〉。
//
// `session=<profile id>.<HMAC-SHA256(secret, id) 的 base64url>`。名字跟真後端（Starlette 的預設）一樣，
// 內容不用一樣 —— 同一個瀏覽器不會同時登入兩邊；要一樣的是**可觀察的語意**：HttpOnly、篡改無效、
// 指向不存在的名片無效（那一條在 `handle()` 查資料庫時擋）。
//
// ⚠️ **不放裸的 id。** 一位審查者主張 base64 就好 —— 那樣任何人改 cookie 就能冒充別人，session 語意跟真後端根本不同。

export const SESSION_COOKIE = 'session'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function mac(id: string): string {
  return createHmac('sha256', internalSessionSecret()).update(id).digest('base64url')
}

/** 登入成功要送的 `Set-Cookie` 值。 */
export function sessionCookie(id: string): string {
  return `${SESSION_COOKIE}=${id}.${mac(id)}; Path=/; HttpOnly; SameSite=Lax`
}

/** 從 `Cookie` header 取出、驗簽。沒有、壞掉、簽章對不上、不是 uuid → `null`（呼叫端當未登入）。 */
export function sessionIdFrom(cookieHeader: string | null): string | null {
  if (cookieHeader === null) return null
  const raw = cookieHeader
    .split(';')
    .map((s) => s.trim())
    .find((s) => s.startsWith(`${SESSION_COOKIE}=`))
    ?.slice(SESSION_COOKIE.length + 1)
  if (!raw) return null
  const dot = raw.lastIndexOf('.')
  if (dot <= 0) return null
  const id = raw.slice(0, dot)
  const given = raw.slice(dot + 1)
  if (!UUID.test(id)) return null
  const expected = mac(id)
  const a = Buffer.from(given)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  return id
}
