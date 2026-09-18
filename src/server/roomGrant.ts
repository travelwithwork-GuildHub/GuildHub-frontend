import 'server-only'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { appEnv, internalSessionSecret } from '@/config/env'

// 本地後端「伺服器端記住票」的記法。規格 `FE-J14`／`FE-N08`〈伺服器端記住票〉（design D4）。
//
// 真後端把票放進它自己的 session（`room_tokens`），給需要票的 REST 端點驗；可觀察的語意是
// 「這個瀏覽器的 cookie 帶著它」。本地照同一個語意，但**一間房一個 cookie**：
//
//   `room_grant_<project_id> = <profile id>.<HMAC-SHA256(secret, "<project_id>|<profile id>")>`
//
// ⚠️ **不是一個裝著集合的 cookie。** 集合寫法有覆寫競態：兩個分頁同時 `enter` 兩間房，各自讀到舊集合、
// 各自加自己那一間再寫回，後回來的蓋掉先回來的 —— 密碼都輸對了卻只拿到一間房。
// 每間房各自一個名稱，瀏覽器以名稱合併，兩次 `Set-Cookie` 不互相覆寫（`FE-J14-S37` 的並行那段）。
//
// ⚠️ **HMAC 要同時蓋住 `project_id` 與 profile id。** 只簽 profile id 的話，把 A 房那個有效值改個
// cookie 名稱貼成 `room_grant_<B>` 就讀得到 B 房（`FE-J14-S37` 的「換房間名稱」那段）。
//
// 屬性跟 `session` 同級（HttpOnly／`Path=/`／`SameSite=Lax`，非 local 加 `Secure`）—— 同一份理由，
// 所以這裡刻意跟 `session.ts` 長得一樣；`FE-J14-S37` 直接拿登入那一個來比，不是自己抄一份清單。
// 本地的票**不過期**（已知差異，design D7）。

export const ROOM_GRANT_PREFIX = 'room_grant_'

function mac(projectId: string, profileId: string): string {
  return createHmac('sha256', internalSessionSecret()).update(`${projectId}|${profileId}`).digest('base64url')
}

/** `enter` 成功時要送的 `Set-Cookie` 值（那一間房的）。 */
export function roomGrantCookie(projectId: string, profileId: string): string {
  const secure = appEnv() === 'local' ? '' : '; Secure'
  return `${ROOM_GRANT_PREFIX}${projectId}=${profileId}.${mac(projectId, profileId)}; Path=/; HttpOnly; SameSite=Lax${secure}`
}

/** 這個請求的 cookie 裡，有沒有「這個人對這間房」的有效記錄？沒有、壞掉、簽章對不上、記的是別人 → false。 */
export function hasRoomGrant(cookieHeader: string | null, projectId: string, profileId: string): boolean {
  if (cookieHeader === null) return false
  const name = `${ROOM_GRANT_PREFIX}${projectId}`
  const raw = cookieHeader
    .split(';')
    .map((s) => s.trim())
    .find((s) => s.startsWith(`${name}=`))
    ?.slice(name.length + 1)
  if (!raw) return false
  const dot = raw.lastIndexOf('.')
  if (dot <= 0) return false
  // 記的是誰，要等於現在 session 的身分：換人登入之後舊記錄就不算（`FE-J14-S34` 的最後一段）。
  if (raw.slice(0, dot) !== profileId) return false
  const given = Buffer.from(raw.slice(dot + 1))
  const expected = Buffer.from(mac(projectId, profileId))
  return given.length === expected.length && timingSafeEqual(given, expected)
}
