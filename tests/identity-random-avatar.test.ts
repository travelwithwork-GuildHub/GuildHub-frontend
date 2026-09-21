import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AVATAR_COUNT } from '@/design/avatar'
import { registerAccount, signInWithNickname, signInWithPassword } from '@/identity/session'
import { startContractServer, type ContractServer } from './support/contract-server'

// 規格 `avatar-selection`〈首次建立身分時隨機指派一款外觀〉（change `fe-a05-avatar-variety`）：`FE-A05-S19`／`S20`／`S21`。
// 真的 HTTP server（契約會驗 `PATCH` 的 body）、真的 `localStorage`；亂數用 `SignInOptions.random` 注入 —— 「均勻」由來源與映射保證，不抽樣。

let server: ContractServer
const UUID = '11111111-1111-1111-1111-111111111111'
const profile = (avatar_id = 0) => ({ id: UUID, display_name: '阿福', avatar_id, skills: [], hours_per_week: null, bio: null, updated_at: '2026-09-10T00:00:00Z' })
const patches = () => server.calls.filter((c) => c.method === 'PATCH' && c.pathname === '/api/profiles/me')
/** 依序回固定值的亂數來源，記錄被叫了幾次。 */
const sequence = (values: number[]) => {
  let i = 0
  const fn = vi.fn(() => values[i++ % values.length]!)
  return fn
}

beforeEach(async () => {
  server = await startContractServer()
  process.env.NEXT_PUBLIC_GUILDHUB_REST = server.base
  process.env.NEXT_PUBLIC_DATA_ADAPTER = 'guildhub'
  localStorage.clear()
})
afterEach(async () => {
  await server.close()
  vi.restoreAllMocks()
})

describe('首次建立身分隨機發一款外觀', () => {
  it('[FE-A05-S21] 注入的亂數 0／0.999／0.5 → 送出 avatar_id 0／7／4；每次建立恰好取一次值；款數是映射說了算', async () => {
    expect(AVATAR_COUNT, '這條測試的期望值是照 8 款算的').toBe(8)
    const want = [0, 7, 4]
    for (const [i, r] of [0, 0.999, 0.5].entries()) {
      const random = sequence([r])
      server.replyFor('/api/login', 200, profile())
      server.replyFor('/api/profiles/me', 200, profile(want[i]))
      const identity = await signInWithNickname('阿福', { random })
      expect(random, `第 ${i + 1} 次建立：亂數來源被呼叫的次數`).toHaveBeenCalledTimes(1)
      const patch = patches().at(-1)
      expect(patch?.body, '送出的 body 只含 avatar_id').toEqual({ avatar_id: want[i] })
      expect(patch?.contractOk, 'PATCH 的 body 要過契約').toBe(true)
      expect(identity.state === 'signed-in' && identity.profile.avatar_id, '回傳的名片是存好的那張').toBe(want[i])
    }
    expect(patches()).toHaveLength(3)
  })

  it('[FE-A05-S21] 款數不是寫死的 8：把映射換成 3 款，同一組亂數得到 0／2／1', async () => {
    // 把 `@/design/avatar` 的款數換成 3，重新載入 session（它與 saveAvatar 都從那裡讀）。
    vi.resetModules()
    vi.doMock('@/design/avatar', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/design/avatar')>()), AVATAR_COUNT: 3 }))
    const { signInWithNickname: signIn } = await import('@/identity/session')
    const want = [0, 2, 1]
    for (const [i, r] of [0, 0.999, 0.5].entries()) {
      server.replyFor('/api/login', 200, profile())
      server.replyFor('/api/profiles/me', 200, profile(want[i]))
      await signIn('阿福', { random: sequence([r]) })
      expect(patches().at(-1)?.body, `亂數 ${r} 對 3 款`).toEqual({ avatar_id: want[i] })
    }
    vi.doUnmock('@/design/avatar')
    vi.resetModules()
  })

  it('[FE-A05-S21] 沒注入時用 Math.random：spy 成 0.5 → 恰好呼叫一次、送 avatar_id 4', async () => {
    const spy = vi.spyOn(Math, 'random').mockReturnValue(0.5)
    server.replyFor('/api/login', 200, profile())
    server.replyFor('/api/profiles/me', 200, profile(4))
    await signInWithNickname('阿福')
    expect(spy).toHaveBeenCalledTimes(1)
    expect(patches().at(-1)?.body).toEqual({ avatar_id: 4 })
  })

  it('[FE-A05-S18] 註冊帳號也發一款', async () => {
    server.replyFor('/api/register', 200, profile())
    server.replyFor('/api/profiles/me', 200, profile(7))
    const identity = await registerAccount({ loginId: 'fergus', password: 'correct horse battery', nickname: '阿福' }, { random: sequence([0.999]) })
    expect(patches().at(-1)?.body).toEqual({ avatar_id: 7 })
    expect(identity.state === 'signed-in' && identity.profile.avatar_id).toBe(7)
  })

  it('[FE-A05-S19] 用帳號密碼回來的人不被改：一個 PATCH 都沒有', async () => {
    server.replyFor('/api/login', 200, profile(5))
    const byPassword = await signInWithPassword('fergus', 'correct horse battery')
    expect(patches()).toHaveLength(0)
    expect(byPassword.state === 'signed-in' && byPassword.profile.avatar_id).toBe(5)
  })

  it('[FE-A05-S20] 存失敗：不重試、不拋、回後端給的那張名片', async () => {
    server.replyFor('/api/login', 200, profile(0))
    server.replyFor('/api/profiles/me', 500, { detail: '壞掉了' })
    const identity = await signInWithNickname('阿福', { random: sequence([0.5]) })
    expect(identity.state).toBe('signed-in')
    expect(identity.state === 'signed-in' && identity.profile.avatar_id).toBe(0)
    expect(patches(), '失敗不重送').toHaveLength(1)
  })
})
