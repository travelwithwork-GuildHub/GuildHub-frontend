import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { LIMITS } from '@/api/contract/limits'
import { RECOVERY_KEY_STORAGE_KEY, browserRecoveryKeyStore } from '@/identity/recoveryKey'
import { nicknameProblem, signInWithNickname } from '@/identity/session'
import { NicknameLengthError } from '@/identity/types'
import { startContractServer, type ContractServer } from './support/contract-server'

// 規格：openspec/changes/fe-a01-login/specs/identity-session/spec.md
//
// ⚠️ **這裡用的是真的 `localStorage`（jsdom 的）與真的 HTTP server**，
// 不是手刻的 mock。這個 repo 有一條明確的教訓：在測試檔裡重刻一份再斷言它，
// 等於沒測 —— 拔掉正式碼的功能照樣綠。

let server: ContractServer

const UUID = '11111111-1111-1111-1111-111111111111'
const profileNamed = (name: string) => ({
  id: UUID,
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

describe('用暱稱建立身分', () => {
  it('[FE-A01-S01] 送出暱稱之後拿到的名片，名字就是送出的那個', async () => {
    server.reply(200, profileNamed('阿福'))

    const identity = await signInWithNickname('阿福')

    expect(identity.state).toBe('signed-in')
    expect(identity.state === 'signed-in' && identity.profile.display_name).toBe('阿福')
    // **送出去的是那個暱稱** —— 只斷言回來的東西的話，
    // 一個把暱稱丟掉、送空字串的實作也會通過（server 回什麼是測試決定的）
    expect(server.calls[0]?.method).toBe('POST')
    expect(server.calls[0]?.pathname).toBe('/api/login')
    expect(server.calls[0]?.body).toEqual({ nickname: '阿福' })
  })

  it('[FE-A01-S02] 空字串與超長的暱稱，一個網路請求都不送', async () => {
    const tooLong = 'あ'.repeat(LIMITS.displayName.max + 1)

    await expect(signInWithNickname('')).rejects.toBeInstanceOf(NicknameLengthError)
    await expect(signInWithNickname(tooLong)).rejects.toBeInstanceOf(NicknameLengthError)

    // 這一行是重點。少了它，一個「先送出、依後端 500 顯示錯誤」的實作也會通過
    expect(server.calls, '不合法的暱稱送出了請求').toHaveLength(0)
  })

  it('[FE-A01-S02] 使用者得知的是「長度」，不是一個 schema 錯誤', () => {
    // ⚠️ **這一條才是拿掉長度檢查之後會紅的那一條。**
    // `operations.login()` 裡的 Zod 契約也擋得住超長，所以「有沒有送出請求」
    // 在拿掉這裡的檢查之後**仍然是綠的** —— 分得開兩者的是使用者看到什麼。
    const problem = nicknameProblem('')

    expect(problem).toBeInstanceOf(NicknameLengthError)
    expect(problem?.message).toContain(String(LIMITS.displayName.min))
    expect(problem?.message).toContain(String(LIMITS.displayName.max))
    expect(nicknameProblem('阿福')).toBeNull()
  })

  it('[FE-A01-S02] 長度數的是 code point，不是 UTF-16 的長度', () => {
    // '𠮷' 的 .length 是 2、[...s].length 是 1。後端的 char_length() 數後者 ——
    // 用 .length 的實作會拒絕後端收得下的字串
    const twenty = '𠮷'.repeat(LIMITS.displayName.max)

    expect(twenty.length, '這個字串的 UTF-16 長度要超過上限，否則這條測不到東西').toBe(
      LIMITS.displayName.max * 2,
    )
    expect(nicknameProblem(twenty), '20 個 code point 被當成超長').toBeNull()
  })

  it('[FE-A01-S03] 後端 500 時不會變成已登入，而且可以直接再試一次', async () => {
    server.reply(500, { detail: '壞掉了' })
    await expect(signInWithNickname('阿福')).rejects.toThrow()

    // 「再試一次而不需要重新輸入暱稱」＝ 同一個呼叫再跑一次就會成功。
    // 失敗的那一次 MUST NOT 在任何地方留下狀態
    server.reply(200, profileNamed('阿福'))
    const identity = await signInWithNickname('阿福')

    expect(identity.state).toBe('signed-in')
  })
})

describe('恢復金鑰預設不落地', () => {
  it('[FE-A01-S07] 沒有選擇記住：持久儲存裡沒有金鑰', async () => {
    server.reply(200, profileNamed('阿福'))

    await signInWithNickname('阿福')

    expect(localStorage.getItem(RECOVERY_KEY_STORAGE_KEY)).toBeNull()
  })

  it('[FE-A01-S07] 選擇記住：金鑰在持久儲存裡，而且就是名片的 id', async () => {
    server.reply(200, profileNamed('阿福'))

    await signInWithNickname('阿福', { remember: true })

    // **反方向。** 少了它，一個完全沒有實作持久化的版本也會讓上一條全綠 ——
    // 那條斷言在空集合上恆真
    expect(localStorage.getItem(RECOVERY_KEY_STORAGE_KEY)).toBe(UUID)
  })

  it('[FE-A01-S07] 沒有選擇記住時，上一個人的金鑰要被清掉', async () => {
    // 只「不新增」是不夠的：留在原地的話，下一次重新載入會用它
    // 把畫面變成**另一個人**
    localStorage.setItem(RECOVERY_KEY_STORAGE_KEY, '22222222-2222-2222-2222-222222222222')
    server.reply(200, profileNamed('阿福'))

    await signInWithNickname('阿福')

    expect(localStorage.getItem(RECOVERY_KEY_STORAGE_KEY)).toBeNull()
  })

  it('[FE-A01-S07] 讀不到 localStorage 時當成沒有金鑰，而不是整個炸掉', () => {
    // 無痕模式、關掉網站資料、某些嵌入情境下，光是碰它就會拋
    const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('SecurityError')
      },
    })
    try {
      const store = browserRecoveryKeyStore()
      expect(store.read()).toBeNull()
      expect(() => store.remember('x')).not.toThrow()
      expect(() => store.forget()).not.toThrow()
    } finally {
      if (original) Object.defineProperty(globalThis, 'localStorage', original)
    }
  })
})
