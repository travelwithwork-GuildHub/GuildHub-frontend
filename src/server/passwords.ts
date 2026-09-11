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

/** 帳號不存在（`stored` 是 null）與密碼錯回同一個 false，**而且花一樣的時間** —— 呼叫端回同一句話。 */
export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  if (!stored) {
    await verifyPassword(password, DUMMY_HASH)
    return false
  }
  const parts = stored.split('$')
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false
  let salt: Buffer
  let expected: Buffer
  try {
    salt = Buffer.from(parts[1] ?? '', 'base64')
    expected = Buffer.from(parts[2] ?? '', 'base64')
  } catch {
    return false
  }
  const actual = await scryptAsync(password, salt, expected.length, { N, r: R, p: P })
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}
