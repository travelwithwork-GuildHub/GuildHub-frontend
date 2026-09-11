import 'server-only'
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

// 密碼雜湊，**格式與參數跟真後端 `app/passwords.py` 一樣**：`scrypt$<salt b64>$<digest b64>`，
// `hashlib.scrypt(n=2**14, r=8, p=1)`，dklen 預設 64。所以 `db/schema/1xx` 裡的測試帳號在真後端也登得進（design `D4`）。
// 規格 `FE-O03`〈登入有三種模式，剛好給一組〉。

const scryptAsync = promisify(scrypt) as (password: string, salt: Buffer, keylen: number, options: { N: number; r: number; p: number }) => Promise<Buffer>
const N = 2 ** 14
const R = 8
const P = 1
const KEYLEN = 64

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const digest = await scryptAsync(password, salt, KEYLEN, { N, r: R, p: P })
  return `scrypt$${salt.toString('base64')}$${digest.toString('base64')}`
}

/**
 * 帳號不存在時拿來比的假雜湊（`hashPassword('not-a-real-password')` 的一次輸出）。
 * `verifyPassword(pw, null)` 會對它跑一次 scrypt，讓「帳號不存在」跟「密碼錯」一樣貴 ——
 * 不然回應時間就把「有沒有這個帳號」送出去了（審查抓到的 timing side channel）。
 */
export const DUMMY_HASH = 'scrypt$XmyFipg0dPtu08F8BuFD8w==$TowsA6gO2E1ARAUFW0FO6rcI6huWXKAHUSMGrpbnwXMaX9pB0f+h4Wxx9TDVqDlidXgecn4yNLhslusZ/oTLXA=='

const SALT_BYTES = 16
const B64 = /^[A-Za-z0-9+/]+={0,2}$/

/** 嚴格解析 `scrypt$<salt>$<digest>`：salt 16 bytes、digest 64 bytes、canonical base64。不合格回 null。 */
function parseStored(stored: string): { salt: Buffer; expected: Buffer } | null {
  const parts = stored.split('$')
  if (parts.length !== 3 || parts[0] !== 'scrypt') return null
  const [, saltB64 = '', digestB64 = ''] = parts
  if (!B64.test(saltB64) || !B64.test(digestB64)) return null
  const salt = Buffer.from(saltB64, 'base64')
  const expected = Buffer.from(digestB64, 'base64')
  // `Buffer.from(x, 'base64')` 對很多非法輸入不拋、給空 Buffer：`scrypt$$` 會變成 keylen 0、兩個空 Buffer 相等 → 認證繞過（審查抓到的）。
  if (salt.length !== SALT_BYTES || expected.length !== KEYLEN) return null
  if (salt.toString('base64') !== saltB64 || expected.toString('base64') !== digestB64) return null
  return { salt, expected }
}

/**
 * 帳號不存在（`stored` 是 null）、雜湊格式壞掉、密碼錯：**全部**回 false、**全部**花一次 scrypt 的時間、**永不拋**。
 * 任何一條路短路，回應時間就把「有沒有這個帳號」送出去（審查抓到的：`!stored` 之外的格式檢查也會短路）。
 */
export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  const parsed = stored ? parseStored(stored) : null
  if (parsed === null) {
    const dummy = parseStored(DUMMY_HASH) as { salt: Buffer; expected: Buffer }
    await scryptAsync(password, dummy.salt, KEYLEN, { N, r: R, p: P })
    return false
  }
  const actual = await scryptAsync(password, parsed.salt, KEYLEN, { N, r: R, p: P })
  return timingSafeEqual(actual, parsed.expected)
}
