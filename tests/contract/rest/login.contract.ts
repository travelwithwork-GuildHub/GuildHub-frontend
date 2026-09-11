import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { ValidationError } from '@/api/contract/errors'
import { ProfileOut } from '@/api/contract/rest'
import { ContractClient, baseUrl } from '../client'

// 規格：openspec/changes/fe-o03-internal-backend/specs/internal-backend/spec.md
//   Requirement: 每個 handler 走同一條管線，錯誤形狀複製真後端 —— S03
//   Requirement: session 是簽章的 HttpOnly cookie —— S06、S07
//   Requirement: 登入有三種模式，剛好給一組 —— S09～S12
//
// 同一組對 internal 與 guildhub 各跑一次；這個檔案不知道自己在打誰。
// 422 的形狀對 `golden/422.json`（對真後端實錄）比：status、loc[0]、type。

type Golden = { cases: Record<string, { status: number; loc0: string; type: string; loc?: Array<string | number> }> }
const golden = JSON.parse(await readFile(path.join(__dirname, '..', 'golden', '422.json'), 'utf8')) as Golden
const ZERO = '00000000-0000-4000-8000-000000000000'
/** `db/schema/100_test_account.sql`：seed 第一張名片的帳號。 */
const TEST_ACCOUNT = { login_id: 'seed-account', password: 'guild1234', display_name: '鐵砧公會長' }

function expectGolden(name: string, r: { status: number; json: unknown }) {
  const g = golden.cases[name]
  if (g === undefined) throw new Error(`golden 沒有 ${name}`)
  expect(r.status, name).toBe(g.status)
  const detail = (r.json as { detail: unknown[] }).detail
  expect(Array.isArray(detail), `${name}：detail 要是陣列`).toBe(true)
  const first = detail[0] as Record<string, unknown>
  expect(ValidationError.safeParse(first).success, `${name}：${JSON.stringify(first)}`).toBe(true)
  expect((first.loc as unknown[])[0], name).toBe(g.loc0)
  expect(first.type, name).toBe(g.type)
  if (g.loc) expect(first.loc, name).toEqual(g.loc)
}

describe('login', () => {
  it('[FE-O03-S03] 驗證失敗的形狀：三種模式一種都沒給', async () => {
    const c = new ContractClient(baseUrl())
    expectGolden('login {}', await c.raw('POST', '/api/login', { body: {} }))
  })

  it('[FE-O03-S09] 三種模式各一次', async () => {
    const c = new ContractClient(baseUrl())
    const first = await c.raw('POST', '/api/login', { body: { nickname: '新來的' } })
    expect(first.status).toBe(200)
    expect(first.contentType).toMatch(/application\/json/)
    const me = ProfileOut.parse(first.json)
    expect(me.display_name).toBe('新來的')
    expect(me.avatar_id).toBe(0)
    expect(first.headers.getSetCookie().some((l) => l.startsWith('session=')), 'login 沒有 Set-Cookie: session').toBe(true)

    const resumed = await new ContractClient(baseUrl()).raw('POST', '/api/login', { body: { resume_token: me.id } })
    expect(resumed.status).toBe(200)
    expect(ProfileOut.parse(resumed.json).id).toBe(me.id)

    const byPassword = await new ContractClient(baseUrl()).raw('POST', '/api/login', { body: TEST_ACCOUNT })
    expect(byPassword.status, byPassword.text.slice(0, 200)).toBe(200)
    expect(ProfileOut.parse(byPassword.json).display_name).toBe(TEST_ACCOUNT.display_name)
  })

  it('[FE-O03-S10] 給兩組是 422，給半組也是 422', async () => {
    const c = new ContractClient(baseUrl())
    expectGolden('login two modes', await c.raw('POST', '/api/login', { body: { nickname: '甲', resume_token: ZERO } }))
    expectGolden('login {login_id only}', await c.raw('POST', '/api/login', { body: { login_id: 'x' } }))
  })

  it('[FE-O03-S11] 帳號不存在與密碼錯誤是同一句話、同一個 body', async () => {
    const c = new ContractClient(baseUrl())
    const nobody = await c.raw('POST', '/api/login', { body: { login_id: 'nobody', password: 'whatever1' } })
    const wrong = await c.raw('POST', '/api/login', { body: { login_id: TEST_ACCOUNT.login_id, password: 'wrong123' } })
    expect(nobody.status).toBe(403)
    expect(wrong.status).toBe(403)
    expect(nobody.json).toEqual({ detail: '帳號或密碼錯誤' })
    expect(wrong.text).toBe(nobody.text)
  })

  it('[FE-O03-S12] resume 一張不存在的名片：404，而且沒有建新名片（再 resume 一次還是 404）', async () => {
    const c = new ContractClient(baseUrl())
    const first = await c.raw('POST', '/api/login', { body: { resume_token: ZERO } })
    expect(first.status).toBe(404)
    expect(first.json).toEqual({ detail: '名片不存在' })
    // 靜默改成「建一張新的」的話，第二次就會 200 —— 「我回來了」與「我是新來的」在前端會長得一模一樣。
    const second = await c.raw('POST', '/api/login', { body: { resume_token: ZERO } })
    expect(second.status, '第一次 404 之後第二次卻成功：resume 偷偷建了名片').toBe(404)
  })
})

describe('session', () => {
  it('[FE-O03-S06] 登入之後帶 cookie 就是那個人', async () => {
    const c = new ContractClient(baseUrl())
    const me = await c.login('契約測試員')
    const again = await c.raw('GET', '/api/me')
    expect(again.status).toBe(200)
    const parsed = ProfileOut.parse(again.json)
    expect(parsed.id).toBe(me.id)
    expect(parsed.display_name).toBe('契約測試員')
  })

  it('[FE-O03-S07] 篡改的 cookie 是未登入，不是另一個人', async () => {
    const c = new ContractClient(baseUrl())
    await c.login('本人')
    const cookie = c.cookies().get('session')
    expect(cookie).toBeDefined()
    // 兩種篡改：換 id（簽章不動）、亂改一個字元。兩邊的 cookie 格式不同，所以只做「改壞」不做「拼別人的 id」。
    const tampered = `${cookie?.slice(0, -4)}XXXX`
    const r = await new ContractClient(baseUrl()).raw('GET', '/api/me', { headers: { cookie: `session=${tampered}` } })
    expect(r.status).toBe(401)
    expect(r.json).toEqual({ detail: '未登入' })
    const garbage = await new ContractClient(baseUrl()).raw('GET', '/api/me', { headers: { cookie: `session=${'11111111-0000-4000-8000-000000000001'}.not-a-signature` } })
    expect(garbage.status).toBe(401)
  })
})
