import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { RECOVERY_KEY_STORAGE_KEY } from '@/identity/recoveryKey'
import { resolveIdentity, signInWithRecoveryKey } from '@/identity/session'
import { RecoveryKeyRejectedError } from '@/identity/types'
import { startContractServer, type ContractServer } from './support/contract-server'

// 規格：openspec/changes/fe-a01-login/specs/identity-session/spec.md
//   Requirement: 目前身分每次都向後端問，而「沒有身分」是一個明確的狀態
//   Requirement: 恢復金鑰預設不落地，而且使用者知道它等同於身分

let server: ContractServer

const ME = '11111111-1111-1111-1111-111111111111'
const OTHER = '22222222-2222-2222-2222-222222222222'
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

  it('[FE-A01-S05] 401 而且手上沒有金鑰：訪客，而且不重試', async () => {
    server.reply(401, { detail: '未登入' })

    const identity = await resolveIdentity()

    expect(identity).toEqual({ state: 'guest', reason: 'no-session' })
    // 「SHALL NOT 重試該查詢」—— 剛好一次，不是兩次
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

describe('沒有 cookie 也回得去', () => {
  it('[FE-A01-S08] 記住過的人：401 之後用金鑰換回同一張名片，不建新的', async () => {
    localStorage.setItem(RECOVERY_KEY_STORAGE_KEY, ME)
    server.reply(401, { detail: '未登入' })
    server.reply(200, profileNamed('阿福'))

    const identity = await resolveIdentity()

    expect(identity.state === 'signed-in' && identity.profile.id).toBe(ME)
    // **送出去的是 resume_token，不是 nickname。** 只斷言回來的東西的話，
    // 一個改成建新名片的實作也會通過 —— server 回什麼是測試決定的
    expect(server.calls[1]?.pathname).toBe('/api/login')
    expect(server.calls[1]?.body).toEqual({ resume_token: ME })
  })

  it('[FE-A01-S10] 金鑰指向已不存在的名片：說實話，不靜默建新的', async () => {
    localStorage.setItem(RECOVERY_KEY_STORAGE_KEY, OTHER)
    server.reply(401, { detail: '未登入' })
    server.reply(404, { detail: '名片不存在' })

    const identity = await resolveIdentity()

    expect(identity).toEqual({ state: 'guest', reason: 'recovery-key-rejected' })
    // 剛好兩個請求：/api/me 與那次失敗的 login。**沒有第三個** ——
    // 有第三個就是它改成建新名片了
    expect(server.calls, '404 之後又送了一次登入').toHaveLength(2)
  })

  it('[FE-A01-S10] 手動送出一把無效的金鑰，得到的是「金鑰無效」', async () => {
    server.reply(404, { detail: '名片不存在' })

    await expect(signInWithRecoveryKey(OTHER)).rejects.toBeInstanceOf(RecoveryKeyRejectedError)
    expect(server.calls).toHaveLength(1)
  })

  it('[FE-A01-S17] 全新的裝置上，只憑一把金鑰就回得去', async () => {
    // 沒有 cookie、沒有任何持久儲存內容
    expect(localStorage.length, '這條要從空的環境開始，否則測不到東西').toBe(0)
    server.reply(200, profileNamed('阿福'))

    const identity = await signInWithRecoveryKey(ME)

    expect(identity.state === 'signed-in' && identity.profile.id).toBe(ME)
    expect(server.calls[0]?.body).toEqual({ resume_token: ME })

    // 「隨後查詢我是誰 SHALL 回同一張名片」
    server.reply(200, profileNamed('阿福'))
    const after = await resolveIdentity()
    expect(after.state === 'signed-in' && after.profile.id).toBe(ME)
  })

  it('[FE-A01-S07] 手動輸入金鑰時，一樣是預設不落地', async () => {
    server.reply(200, profileNamed('阿福'))
    await signInWithRecoveryKey(ME)
    expect(localStorage.getItem(RECOVERY_KEY_STORAGE_KEY)).toBeNull()

    server.reply(200, profileNamed('阿福'))
    await signInWithRecoveryKey(ME, { remember: true })
    expect(localStorage.getItem(RECOVERY_KEY_STORAGE_KEY)).toBe(ME)
  })
})
