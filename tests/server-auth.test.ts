// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'

// 規格：openspec/changes/fe-o03-internal-backend/specs/internal-backend/spec.md
//   Requirement: session 是簽章的 HttpOnly cookie —— cookie 屬性（非 local 加 Secure）、簽章驗證
//   Requirement: 登入有三種模式，剛好給一組 —— S11 的另一半：帳號不存在與密碼錯**一樣貴**（timing）
//
// `server-only` 在 node 環境 import 會拋，這裡 mock 掉。**不連任何外部服務。**

vi.mock('server-only', () => ({}))

afterEach(() => vi.unstubAllEnvs())

async function median(times: number, fn: () => Promise<unknown>): Promise<number> {
  const samples: number[] = []
  for (let i = 0; i < times; i += 1) {
    const t = performance.now()
    await fn()
    samples.push(performance.now() - t)
  }
  return samples.sort((a, b) => a - b)[Math.floor(times / 2)] ?? 0
}

describe('密碼比對', () => {
  it('[FE-O03-S11] 帳號不存在也跑一次 scrypt：兩條路徑花的時間同一個量級', async () => {
    const { hashPassword, verifyPassword } = await import('@/server/passwords')
    const real = await hashPassword('guild1234')
    expect(await verifyPassword('guild1234', real)).toBe(true)
    expect(await verifyPassword('wrong-pass', real)).toBe(false)
    expect(await verifyPassword('guild1234', null)).toBe(false)
    const missing = await median(5, () => verifyPassword('guild1234', null))
    const wrong = await median(5, () => verifyPassword('wrong-pass', real))
    // scrypt(N=2^14) 一次是幾十毫秒；短路回 false 是微秒級。要求「不存在」至少是「密碰錯」的一半。
    expect(wrong).toBeGreaterThan(5)
    expect(missing, `帳號不存在 ${missing.toFixed(1)}ms vs 密碼錯 ${wrong.toFixed(1)}ms —— 短路了，回應時間會送出帳號存在性`).toBeGreaterThan(wrong * 0.5)
  })

  it('雜湊格式跟真後端一樣：scrypt$<salt b64>$<digest b64>，digest 64 bytes', async () => {
    const { hashPassword } = await import('@/server/passwords')
    const h = await hashPassword('x')
    const [algo, salt, digest] = h.split('$')
    expect(algo).toBe('scrypt')
    expect(Buffer.from(salt ?? '', 'base64').length).toBe(16)
    expect(Buffer.from(digest ?? '', 'base64').length).toBe(64)
  })
})

describe('session cookie', () => {
  it('local 沒有 Secure；部署出去有', async () => {
    const { sessionCookie, sessionIdFrom } = await import('@/server/session')
    const id = '11111111-0000-4000-8000-000000000001'
    const local = sessionCookie(id)
    expect(local).toMatch(/^session=.+; Path=\/; HttpOnly; SameSite=Lax$/)
    expect(sessionIdFrom(local.split(';')[0] ?? null)).toBe(id)
    vi.stubEnv('NEXT_PUBLIC_APP_ENV', 'production')
    vi.stubEnv('INTERNAL_SESSION_SECRET', 'deployed-secret')
    expect(sessionCookie(id)).toMatch(/; Secure$/)
  })

  it('篡改、換 id、不是 uuid、沒有 cookie 都是 null', async () => {
    const { sessionCookie, sessionIdFrom } = await import('@/server/session')
    const id = '11111111-0000-4000-8000-000000000001'
    const value = sessionCookie(id).split(';')[0] ?? ''
    const [, signed] = value.split('=')
    const [, mac] = (signed ?? '').split('.')
    expect(sessionIdFrom(`other=1; ${value}`)).toBe(id)
    expect(sessionIdFrom(`session=22222222-0000-4000-8000-000000000002.${mac}`), '換了 id 簽章不動').toBeNull()
    expect(sessionIdFrom(`session=${id}.${mac?.slice(0, -1)}A`)).toBeNull()
    expect(sessionIdFrom(`session=not-a-uuid.${mac}`)).toBeNull()
    expect(sessionIdFrom(null)).toBeNull()
    expect(sessionIdFrom('session=')).toBeNull()
  })
})
