import { describe, expect, it } from 'vitest'
import { ProfileOut } from '@/api/contract/rest'
import { ContractClient, baseUrl } from '../client'
import { checkGolden, recording, timestampPattern } from '../golden'

// 規格：openspec/changes/fe-o05-contract-tests/specs/contract-tests/spec.md
//   Requirement: 形狀與型別：兩邊一字不差 —— S10（在 profiles.contract.ts）、S11、S12、S16
//
// 每一條都對 `golden/422.json` 比（真後端實錄）；兩個目標跑同一組 —— golden 是共同的裁判，不是「以 internal 為準」。

describe('驗證失敗的形狀', () => {
  it('[FE-O05-S11][FE-O05-S12] null、缺欄、錯型別、不是 uuid：四種都是 422 陣列，形狀對 golden', async () => {
    const c = new ContractClient(baseUrl())
    checkGolden('login {nickname:null}', await c.raw('POST', '/api/login', { body: { nickname: null } }))
    checkGolden('login {}', await c.raw('POST', '/api/login', { body: {} }))
    checkGolden('login {nickname:123}', await c.raw('POST', '/api/login', { body: { nickname: 123 } }))
    checkGolden("login {resume_token:'not-a-uuid'}", await c.raw('POST', '/api/login', { body: { resume_token: 'not-a-uuid' } }))
  })

  it('[FE-O05-S16] body 的三種壞法：字面 null、非 JSON、缺 Content-Type；還有 page=-1 ≡ page=0', async () => {
    const c = new ContractClient(baseUrl())
    checkGolden('login body literal null', await c.raw('POST', '/api/login', { body: 'null', headers: { 'content-type': 'application/json' } }))
    checkGolden('login not json', await c.raw('POST', '/api/login', { body: 'not json', headers: { 'content-type': 'application/json' } }))
    checkGolden('login json without content-type', await c.raw('POST', '/api/login', { body: '{"nickname":"無標頭"}' }))
    await c.login('翻負頁的人')
    const minus = await c.raw('GET', '/api/profiles?page=-1')
    const zero = await c.raw('GET', '/api/profiles?page=0')
    checkGolden('profiles page=-1', minus)
    // 錄製時不斷言（record 模式只錄形狀）—— 這一行是 compare 模式的義務。
    if (!recording()) expect(minus.json).toEqual(zero.json)
  })

  it('[FE-O05-S12] 資料庫擋的長度是 500 text/plain（golden），兩邊一樣', async () => {
    const c = new ContractClient(baseUrl())
    checkGolden('login nickname empty', await c.raw('POST', '/api/login', { body: { nickname: '' } }))
    checkGolden('login nickname 21 chars', await c.raw('POST', '/api/login', { body: { nickname: '字'.repeat(21) } }))
  })

  it('[FE-O05-S12] 時間欄位的形狀跟 golden 的 regex 一致', async () => {
    const c = new ContractClient(baseUrl())
    const me = ProfileOut.parse(await c.login('看時間的人'))
    expect(me.updated_at).toMatch(timestampPattern())
    const projects = (await c.raw('GET', '/api/projects')).json as Array<{ expires_at: string; updated_at: string }>
    expect(projects.length).toBeGreaterThan(0)
    for (const p of projects) {
      expect(p.expires_at).toMatch(timestampPattern())
      expect(p.updated_at).toMatch(timestampPattern())
    }
  })
})
