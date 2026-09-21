import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resolveIdentity } from '@/identity/session'
import { startContractServer, type ContractServer } from './support/contract-server'

// 規格：openspec/specs/identity-session/spec.md
//   Requirement: 目前身分每次都向後端問，而「沒有身分」是一個明確的狀態
//
// ⚠️ 恢復金鑰機制在 2026-09-21 整段退場（`fe-a06-first-entry` 反轉、`identity-session` REMOVED delta）：
// `resolveIdentity` 不再有「401 之後拿 localStorage 金鑰去恢復」那一步，401 一律是訪客。
// 原本〈沒有 cookie 也回得去〉那一組（`FE-A01-S07`／`S08`／`S10`／`S17`）連同 `signInWithRecoveryKey` 已刪。

let server: ContractServer

const ME = '11111111-1111-1111-1111-111111111111'
const profileNamed = (name: string, id = ME) => ({
  id,
  display_name: name,
  avatar_id: 0,
  skills: [],
  hours_per_week: null,
  bio: null,
  updated_at: '2026-09-10T00:00:00Z',
})

beforeEach(async () => {
  server = await startContractServer()
  process.env.NEXT_PUBLIC_GUILDHUB_REST = server.base
  process.env.NEXT_PUBLIC_DATA_ADAPTER = 'guildhub'
  localStorage.clear()
})

afterEach(async () => {
  await server.close()
  delete process.env.NEXT_PUBLIC_GUILDHUB_REST
  delete process.env.NEXT_PUBLIC_DATA_ADAPTER
  localStorage.clear()
})

describe('問後端「我是誰」', () => {
  it('[FE-A01-S04] 重整之後是同一張名片，而且顯示的是後端當下的名字', async () => {
    server.reply(200, profileNamed('阿福'))
    const first = await resolveIdentity()

    // 後端上的名字改了（例如在另一台裝置改的）
    server.reply(200, profileNamed('阿福二世'))
    const second = await resolveIdentity()

    expect(first.state === 'signed-in' && first.profile.display_name).toBe('阿福')
    // **這一行是這條的重點。** 少了它，一個把名字存在前端、重整時讀回來的
    // 實作也會通過前面那些斷言 —— 而那個實作沒有真的在問後端
    expect(second.state === 'signed-in' && second.profile.display_name).toBe('阿福二世')
    expect(second.state === 'signed-in' && second.profile.id).toBe(ME)
    expect(server.calls.map((c) => `${c.method} ${c.pathname}`)).toEqual([
      'GET /api/me',
      'GET /api/me',
    ])
  })

  it('[FE-A01-S05] 401 就是訪客，而且不重試', async () => {
    server.reply(401, { detail: '未登入' })

    const identity = await resolveIdentity()

    expect(identity).toEqual({ state: 'guest', reason: 'no-session' })
    // 「SHALL NOT 重試該查詢」—— 剛好一次，不是兩次。恢復金鑰退場後，401 之後也不再有第二個請求。
    expect(server.calls, '401 之後又打了一次').toHaveLength(1)
  })

  it('[FE-A01-S06] 後端 500 是「現在問不到」，不是「你是訪客」', async () => {
    server.reply(500, { detail: '壞掉了' })

    const identity = await resolveIdentity()

    expect(identity.state).toBe('unavailable')
    // **兩者要分得開。** 一起吞成訪客的話，後端掛掉時所有人都被靜靜地登出，
    // 而畫面上跟真的沒登入一模一樣
    expect(identity.state).not.toBe('guest')
  })

  it('[FE-A01-S06] 連不上後端也是「現在問不到」', async () => {
    await server.close()

    const identity = await resolveIdentity()

    expect(identity.state).toBe('unavailable')
  })

  it('[FE-A01-S06] 回應不符合契約時，不得當成訪客', async () => {
    // 後端回 200 但形狀不對（欄位少了）—— 這是 ContractDriftError，不是 HttpError
    server.reply(200, { id: ME })

    const identity = await resolveIdentity()

    expect(identity.state).toBe('unavailable')
  })
})
