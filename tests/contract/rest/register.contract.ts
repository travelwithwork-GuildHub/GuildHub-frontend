import { describe, expect, it } from 'vitest'
import { ProfileOut } from '@/api/contract/rest'
import { ContractClient, baseUrl } from '../client'
import { checkGolden } from '../golden'

// 規格：openspec/changes/fe-a08-account-login/specs/account-login/spec.md
//   Requirement: 本地後端與契約測試補上 register 與密碼登入 —— S09、S10、S15
//
// 同一組對 internal 與 guildhub 各跑一次；這個檔案不知道自己在打誰。
// 每次跑用新的 login_id（時間戳）：兩個目標的資料庫都會累積，重跑不能撞到上一次的。

const fresh = (tag: string) => `a08-${tag}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
const PASSWORD = 'correct horse'

describe('register', () => {
  it('[FE-A08-S09] 註冊之後就是登入狀態；新的 jar 再送同一個 login_id 是 409', async () => {
    const loginId = fresh('reg')
    const c = new ContractClient(baseUrl())
    const r = await c.raw('POST', '/api/register', { body: { login_id: loginId, password: PASSWORD, nickname: '愛麗絲' } })
    expect(r.status, r.text.slice(0, 200)).toBe(200)
    expect(r.contentType).toMatch(/application\/json/)
    const me = ProfileOut.parse(r.json)
    expect(me.display_name).toBe('愛麗絲')
    expect(r.headers.getSetCookie().some((l) => l.startsWith('session=')), 'register 沒有 Set-Cookie: session').toBe(true)
    // 同一個 jar：/me 是同一張。
    const who = await c.raw('GET', '/api/me')
    expect(who.status).toBe(200)
    expect(ProfileOut.parse(who.json).id).toBe(me.id)

    // 撞名：**新的** jar（不混進「已登入時 register」那個沒定義的行為）。
    const again = await new ContractClient(baseUrl()).raw('POST', '/api/register', { body: { login_id: loginId, password: 'another-pass', nickname: '冒名者' } })
    expect(again.status).toBe(409)
    expect(again.json).toEqual({ detail: '這個帳號已經有人用了' })
  })

  it('[FE-A08-S10] 錯密碼與不存在的帳號回同一句 403；對的密碼 200 且是同一張', async () => {
    const loginId = fresh('pw')
    const registered = ProfileOut.parse((await new ContractClient(baseUrl()).raw('POST', '/api/register', { body: { login_id: loginId, password: PASSWORD, nickname: '有密碼的人' } })).json)
    const wrong = await new ContractClient(baseUrl()).raw('POST', '/api/login', { body: { login_id: loginId, password: 'wrong-pass' } })
    const nobody = await new ContractClient(baseUrl()).raw('POST', '/api/login', { body: { login_id: fresh('nobody'), password: 'whatever-pass' } })
    expect(wrong.status).toBe(403)
    expect(nobody.status).toBe(403)
    // 鎖定實錄的那一句（兩邊一起漂成別的字也要紅），再比兩邊逐字相同。
    expect(wrong.json).toEqual({ detail: '帳號或密碼錯誤' })
    expect(wrong.text, '錯密碼與不存在的帳號回了不同的字 —— 送出了帳號存在性').toBe(nobody.text)
    const right = await new ContractClient(baseUrl()).raw('POST', '/api/login', { body: { login_id: loginId, password: PASSWORD } })
    expect(right.status).toBe(200)
    expect(ProfileOut.parse(right.json).id).toBe(registered.id)
  })

  it('[FE-A08-S15] 兩個人同時註冊同一個帳號：恰好一個 200、一個 409，沒有 500', async () => {
    const loginId = fresh('race')
    // 暱稱也要這一次獨有（資料庫跨重跑累積；第 0 頁本來就有一張「乙」會誤判）：從已經獨有的 loginId 派生，nickname 上限 20。
    const tag = loginId.slice(-19)
    const nickA = `甲${tag}`
    const nickB = `乙${tag}`
    const ca = new ContractClient(baseUrl())
    const cb = new ContractClient(baseUrl())
    const [a, b] = await Promise.all([
      ca.raw('POST', '/api/register', { body: { login_id: loginId, password: PASSWORD, nickname: nickA } }),
      cb.raw('POST', '/api/register', { body: { login_id: loginId, password: PASSWORD, nickname: nickB } }),
    ])
    expect([a.status, b.status].sort(), `${a.text.slice(0, 80)} | ${b.text.slice(0, 80)}`).toEqual([200, 409])
    const winner = ProfileOut.parse((a.status === 200 ? a : b).json)
    const loserNick = a.status === 200 ? nickB : nickA
    // 那個帳號只有一張名片：第 0 頁（updated_at 新到舊；清單要登入，用贏的那個 jar）找得到贏的那張、找不到輸的那個暱稱。
    const list = await (a.status === 200 ? ca : cb).raw('GET', '/api/profiles?page=0')
    expect(list.status, list.text.slice(0, 120)).toBe(200)
    const page0 = list.json as Array<{ id: string; display_name: string }>
    expect(page0.some((p) => p.id === winner.id && p.display_name === winner.display_name)).toBe(true)
    expect(page0.some((p) => p.display_name === loserNick), '輸的那次也建了名片 —— 先查再寫').toBe(false)
    // 用對的密碼登入回的是贏的那張。
    const back = await new ContractClient(baseUrl()).raw('POST', '/api/login', { body: { login_id: loginId, password: PASSWORD } })
    expect(back.status).toBe(200)
    const found = ProfileOut.parse(back.json)
    expect(found.id).toBe(winner.id)
    expect(found.display_name).toBe(winner.display_name)
  })

  it('422 的形狀：密碼太短、少欄位', async () => {
    const c = new ContractClient(baseUrl())
    checkGolden('register short password', await c.raw('POST', '/api/register', { body: { login_id: fresh('short'), password: 'short', nickname: '甲' } }))
    checkGolden('register {}', await c.raw('POST', '/api/register', { body: {} }))
  })
})
