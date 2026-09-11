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

  it('壞掉的雜湊一律 false、不拋、而且一樣貴（`scrypt$$` 那種會變成 keylen 0 的尤其）', async () => {
    const { hashPassword, verifyPassword } = await import('@/server/passwords')
    const real = await hashPassword('guild1234')
    // 注意 JS 的 `replace` 把替換字串裡的 `$$` 當成一個 `$` —— 要多一個 `$` 得用函式（第一版就踩到，樣本跟原字串一樣）。
    const broken = ['scrypt$$', 'scrypt$abc$', '', 'bcrypt$x$y', 'scrypt$not base64!$also not', 'scrypt$QUJD$QUJD', real.replace('scrypt$', () => 'scrypt$$'), `${real}$`]
    expect(broken[6]?.split('$').length).toBe(4)
    for (const h of broken) {
      await expect(verifyPassword('guild1234', h), h).resolves.toBe(false)
    }
    const brokenTime = await median(5, () => verifyPassword('guild1234', 'scrypt$$'))
    const wrong = await median(5, () => verifyPassword('wrong-pass', real))
    expect(brokenTime, `格式壞掉 ${brokenTime.toFixed(1)}ms vs 密碼錯 ${wrong.toFixed(1)}ms —— 短路了`).toBeGreaterThan(wrong * 0.5)
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
    // 尾字換成一個**一定不同**的字元（原字是 A 的話換 B —— 固定換 A 有機會沒真的篡改，審查抓到的）。
    const last = mac?.slice(-1) ?? ''
    expect(sessionIdFrom(`session=${id}.${mac?.slice(0, -1)}${last === 'A' ? 'B' : 'A'}`)).toBeNull()
    expect(sessionIdFrom(`session=not-a-uuid.${mac}`)).toBeNull()
    expect(sessionIdFrom(null)).toBeNull()
    expect(sessionIdFrom('session=')).toBeNull()
  })
})

// 規格：openspec/changes/fe-a08-account-login/specs/account-login/spec.md
//   Requirement: 本地後端與契約測試補上 register 與密碼登入 —— S16（別的 unique 違反不是 409）
describe('register 的資料層：只認 profiles_login_id_key', () => {
  const pgError = (constraint: string) => Object.assign(new Error('duplicate key value violates unique constraint'), { code: '23505', constraint })

  it('[FE-A08-S16] login_id 的 unique → null（409 的來源）；別的 constraint 的 23505 → 原樣拋（500）', async () => {
    const { isLoginIdTaken } = await import('@/server/profiles')
    expect(isLoginIdTaken(pgError('profiles_login_id_key'))).toBe(true)
    expect(isLoginIdTaken(pgError('profiles_pkey')), '主鍵撞到也說成「帳號有人用了」').toBe(false)
    expect(isLoginIdTaken(Object.assign(new Error('check'), { code: '23514', constraint: 'profiles_login_id_key' })), '不是 23505 也算').toBe(false)
    expect(isLoginIdTaken(null)).toBe(false)
  })

  it('[FE-A08-S16] insertAccount：注入 pg 錯誤 —— login_id 撞名回 null，別的 23505 拋出去', async () => {
    vi.resetModules()
    let thrown: unknown = pgError('profiles_login_id_key')
    vi.doMock('@/server/db', () => ({
      db: () => ({
        query: async () => {
          throw thrown
        },
      }),
    }))
    const { insertAccount } = await import('@/server/profiles')
    await expect(insertAccount('11111111-0000-4000-8000-000000000001', '甲', 'alice', 'scrypt$x$y')).resolves.toBeNull()
    thrown = pgError('profiles_pkey')
    await expect(insertAccount('11111111-0000-4000-8000-000000000001', '甲', 'alice', 'scrypt$x$y')).rejects.toMatchObject({ code: '23505', constraint: 'profiles_pkey' })
    vi.doUnmock('@/server/db')
  })
})

describe('register 的資料層：不先查再寫', () => {
  it('insertAccount 只發一道 SQL，而且是 insert（先 select 再 insert 在單機永遠對、兩個人同時註冊才會露出來 —— S15 在併發下不保證抓到，這裡守形狀）', async () => {
    vi.resetModules()
    const queries: string[] = []
    vi.doMock('@/server/db', () => ({
      db: () => ({
        query: async (sql: string) => {
          queries.push(sql)
          return { rows: [{ id: 'x' }], rowCount: 1 }
        },
      }),
    }))
    const { insertAccount } = await import('@/server/profiles')
    await insertAccount('11111111-0000-4000-8000-000000000001', '甲', 'alice', 'scrypt$x$y')
    expect(queries).toHaveLength(1)
    expect(queries[0]?.trim().toLowerCase().startsWith('insert into profiles')).toBe(true)
    vi.doUnmock('@/server/db')
  })
})
