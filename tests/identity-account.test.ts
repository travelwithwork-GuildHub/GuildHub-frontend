import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { RECOVERY_KEY_STORAGE_KEY } from '@/identity/recoveryKey'
import { registerAccount, signInWithPassword } from '@/identity/session'
import { CredentialsRejectedError, LoginIdTakenError } from '@/identity/types'
import { VOCABULARY, toUiError } from '@/errors/uiError'
import { startContractServer, type ContractServer } from './support/contract-server'

// 規格：openspec/changes/fe-a08-account-login/specs/account-login/spec.md
//   Requirement: 註冊建立一張帶帳號密碼的名片，成功即登入 —— S02 的 body 與金鑰處置、S03 的錯誤型別
//   Requirement: 帳號密碼登入驗證身分，錯了不透露哪一個錯 —— S05 的 body 與錯誤型別、S07 的金鑰處置、S08 別的 status 原樣拋
//
// 身分層（`src/identity/session.ts`）對真的 HTTP server（本機自己起的 `contract-server`）與真的 `localStorage`。**不連任何外部服務。**
// 對映只在那一次請求：403 → CredentialsRejectedError（只在 signInWithPassword）、409 → LoginIdTakenError（只在 registerAccount）；別的原樣拋。

let server: ContractServer
const UUID = '11111111-1111-1111-1111-111111111111'
const PROFILE = { id: UUID, display_name: '愛麗絲', avatar_id: 0, skills: [], hours_per_week: null, bio: null, updated_at: '2026-09-10T00:00:00Z' }

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

describe('registerAccount', () => {
  it('[FE-A08-S02] body 正好三鍵、原值原樣（大小寫、空白都不動）；沒勾記住我就把舊金鑰也清掉', async () => {
    localStorage.setItem(RECOVERY_KEY_STORAGE_KEY, '22222222-2222-2222-2222-222222222222')
    server.reply(200, PROFILE)
    const identity = await registerAccount({ loginId: 'Alice_01 ', password: 'correct horse', nickname: '愛麗絲' })
    expect(identity.state).toBe('signed-in')
    expect(server.calls[0]?.method).toBe('POST')
    expect(server.calls[0]?.pathname).toBe('/api/register')
    expect(server.calls[0]?.body).toEqual({ login_id: 'Alice_01 ', password: 'correct horse', nickname: '愛麗絲' })
    expect(server.calls[0]?.contractOk).toBe(true)
    expect(localStorage.getItem(RECOVERY_KEY_STORAGE_KEY), '沒勾記住我，舊金鑰要清掉').toBeNull()
  })

  it('[FE-A08-S07] 勾了記住我：金鑰是回應的 id', async () => {
    server.reply(200, PROFILE)
    await registerAccount({ loginId: 'alice', password: 'correct horse', nickname: '愛麗絲' }, { remember: true })
    expect(localStorage.getItem(RECOVERY_KEY_STORAGE_KEY)).toBe(UUID)
  })

  it('[FE-A08-S03] 409 → LoginIdTakenError（前端的字，不是後端的 detail）', async () => {
    server.reply(409, { detail: '後端寫的字' })
    const error = await registerAccount({ loginId: 'alice', password: 'correct horse', nickname: '愛麗絲' }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(LoginIdTakenError)
    expect((error as Error).message).toBe('這個帳號已經有人用了。')
    expect((error as Error).message).not.toContain('後端寫的字')
  })

  it('[FE-A08-S11] 別的 status 原樣拋（500 → toUiError 是 server-error；403 不是 LoginIdTakenError）', async () => {
    server.reply(500, { detail: '壞了' })
    const e500 = await registerAccount({ loginId: 'alice', password: 'correct horse', nickname: '愛麗絲' }).catch((e: unknown) => e)
    expect(e500).not.toBeInstanceOf(LoginIdTakenError)
    expect(toUiError(e500).message).toBe(VOCABULARY['server-error'])
    server.reply(403, { detail: '不該轉' })
    const e403 = await registerAccount({ loginId: 'alice', password: 'correct horse', nickname: '愛麗絲' }).catch((e: unknown) => e)
    expect(e403, 'register 的 403 不是「帳號或密碼錯」—— 對映只在 signInWithPassword').not.toBeInstanceOf(CredentialsRejectedError)
    expect(e403, 'register 的 403 也不是「帳號有人用了」').not.toBeInstanceOf(LoginIdTakenError)
    expect(toUiError(e403).kind).toBe('permission-denied')
  })
})

describe('signInWithPassword', () => {
  it('[FE-A08-S05] body 正好兩鍵；403 → CredentialsRejectedError，兩種 detail 同一個型別同一句', async () => {
    server.reply(403, { detail: '後端寫的字 A' })
    // login_id 帶前後空白與大小寫：原值原樣送（不 trim、不折疊）。
    const a = await signInWithPassword(' Alice ', 'wrong-pass').catch((e: unknown) => e)
    expect(server.calls[0]?.pathname).toBe('/api/login')
    expect(server.calls[0]?.body).toEqual({ login_id: ' Alice ', password: 'wrong-pass' })
    expect(server.calls[0]?.contractOk).toBe(true)
    expect(a).toBeInstanceOf(CredentialsRejectedError)
    server.reply(403, { detail: '後端寫的字 B' })
    const b = await signInWithPassword('nobody', 'wrong-pass').catch((e: unknown) => e)
    expect(b).toBeInstanceOf(CredentialsRejectedError)
    expect((a as Error).message).toBe('帳號或密碼錯誤。')
    expect((b as Error).message).toBe((a as Error).message)
  })

  it('[FE-A08-S07] 成功：勾了落地、沒勾清掉舊的', async () => {
    server.reply(200, PROFILE)
    const first = await signInWithPassword('alice', 'right-pass', { remember: true })
    expect(first.state).toBe('signed-in')
    expect(localStorage.getItem(RECOVERY_KEY_STORAGE_KEY)).toBe(UUID)
    server.reply(200, PROFILE)
    await signInWithPassword('alice', 'right-pass')
    expect(localStorage.getItem(RECOVERY_KEY_STORAGE_KEY)).toBeNull()
  })

  it('[FE-A08-S08] 500 與 409 原樣拋：不是 CredentialsRejectedError', async () => {
    server.reply(500, { detail: '壞了' })
    const e500 = await signInWithPassword('alice', 'right-pass').catch((e: unknown) => e)
    expect(e500).not.toBeInstanceOf(CredentialsRejectedError)
    expect(toUiError(e500).message).toBe(VOCABULARY['server-error'])
    server.reply(409, { detail: '不該轉' })
    const e409 = await signInWithPassword('alice', 'right-pass').catch((e: unknown) => e)
    expect(e409, 'login 的 409 不是「帳號有人用了」—— 對映只在 registerAccount').not.toBeInstanceOf(LoginIdTakenError)
    expect(e409, 'login 的 409 也不是「帳號或密碼錯」—— 對映只看 403').not.toBeInstanceOf(CredentialsRejectedError)
    expect(toUiError(e409).kind).toBe('conflict')
  })

  it('連不上（伺服器已關）→ toUiError 是 network-unavailable', async () => {
    await server.close()
    const e = await signInWithPassword('alice', 'right-pass').catch((x: unknown) => x)
    expect(e).not.toBeInstanceOf(CredentialsRejectedError)
    expect(toUiError(e).kind).toBe('network-unavailable')
    server = await startContractServer() // 給 afterEach 關
  })
})
