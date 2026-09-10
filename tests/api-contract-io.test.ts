import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ContractDriftError, HttpError } from '@/api/transport'
import { getMyProfile, updateMyProfile } from '@/api/operations'
import { startContractServer, type ContractServer } from './support/contract-server'

// 規格：openspec/changes/fe-o02-data-access/specs/data-access/spec.md
//   Requirement: 送出去之前先對照契約 —— Scenario FE-O02-S04
//   Requirement: 回來的東西在 API 邊界驗 —— S05 / S06 / S07
//
// ⚠️ **請求由測試自己起的 server 收，而那個 server 用同一份契約驗 body。**
// 沒有任何一條斷言在測試檔裡重刻請求的形狀 —— 見 `support/contract-server.ts`。

let server: ContractServer

/** 契約允許的一份 profile。 */
const PROFILE = {
  id: '11111111-1111-1111-1111-111111111111',
  display_name: '阿福',
  avatar_id: 3,
  skills: ['react'],
  hours_per_week: 10,
  bio: null,
  updated_at: '2026-09-09T00:00:00Z',
}

beforeEach(async () => {
  server = await startContractServer()
  process.env.NEXT_PUBLIC_GUILDHUB_REST = server.base
  process.env.NEXT_PUBLIC_DATA_ADAPTER = 'guildhub'
})

afterEach(async () => {
  await server.close()
  delete process.env.NEXT_PUBLIC_GUILDHUB_REST
  delete process.env.NEXT_PUBLIC_DATA_ADAPTER
})

describe('domain operation 的一次完整往返', () => {
  it('[FE-O02-S01] method 與路徑都對，回應解得出來', async () => {
    server.reply(200, PROFILE)
    const profile = await getMyProfile()

    expect(profile.display_name).toBe('阿福')
    expect(server.calls[0]?.method).toBe('GET')
    // ⚠️ 這裡曾經是 `/api/profiles/me` —— 同一個不存在的端點在這個 repo 裡
    // 一共被抄了四次（生產碼一次、測試三次），而它們互相印證所以永遠是綠的。
    expect(server.calls[0]?.pathname).toBe('/api/me')
  })

  it('[FE-O02-S04] 輸入不合契約時，在送出之前就失敗', async () => {
    await expect(updateMyProfile({ bio: 'x'.repeat(100_000) })).rejects.toThrow()
    expect(server.calls, '不合契約的東西被送出去了').toHaveLength(0)
  })

  it('[FE-O02-S04] 契約驗證失敗是 rejection，不是同步拋出', async () => {
    // ⚠️ **這一條是寫測試時踩到的。** 操作原本不是 `async`，所以契約驗證的錯誤
    // 是**同步拋出**的 —— 而這些函式的型別是 `Promise<T>`，呼叫端會寫
    // `op().catch(…)`，那條 catch 接不到同步的錯。症狀是「明明包了 catch 卻整個炸掉」。
    const returned = updateMyProfile({ bio: 'x'.repeat(100_000) })

    expect(returned, '操作沒有回傳 promise —— 驗證錯誤是同步拋出的').toBeInstanceOf(Promise)
    await expect(returned).rejects.toThrow()
  })

  it('[FE-O02-S04] 合契約的輸入送得出去，而且 server 端的契約驗證通過', async () => {
    server.reply(200, PROFILE)
    await updateMyProfile({ bio: '你好' })

    expect(server.calls[0]?.method).toBe('PATCH')
    // **這個布林是 server 用契約算出來的**，不是測試自己判斷的
    expect(server.calls[0]?.contractOk, 'server 端的契約驗證沒過').toBe(true)
  })

  it('[FE-O02-S05] 回應少一個必填欄位時，在邊界拋契約漂移錯誤', async () => {
    const { display_name: _omitted, ...missing } = PROFILE
    server.reply(200, missing)

    await expect(getMyProfile()).rejects.toBeInstanceOf(ContractDriftError)

    server.reply(200, missing)
    // 訊息要指得出是哪個欄位，否則看到錯誤的人只知道「有東西不對」
    await expect(getMyProfile()).rejects.toThrow(/display_name/)
  })

  it('[FE-O02-S06] 回應多一個未知欄位時照常通過，而且那個欄位不會流下去', async () => {
    server.reply(200, { ...PROFILE, brand_new_field: '後端加的' })
    const profile = await getMyProfile()

    expect(profile.display_name).toBe('阿福')
    // **這一條釘住 Zod 的 strip 行為。** 有人「順手」加上 `.strict()` 的話，
    // 後端每加一個欄位就會讓整個前端掛掉 —— 那時這條會紅。
    expect(profile).not.toHaveProperty('brand_new_field')
  })

  it('[FE-O02-S07] 4xx 不得被當成成功，status 與 detail 都要留著', async () => {
    server.reply(409, { detail: '這個座位已經有人了' })

    const error = await getMyProfile().catch((e: unknown) => e)
    expect(error).toBeInstanceOf(HttpError)
    expect((error as HttpError).status).toBe(409)
    expect((error as HttpError).detail).toBe('這個座位已經有人了')
  })

  it('[FE-O02-S07] 錯誤 body 解不出來時，status 仍然要傳出去', async () => {
    // 回 HTML 的 502 是真的會發生的（反向代理）。硬要解析 JSON 的話，
    // 那個解析錯誤會蓋掉 502 —— 而 502 才是要看到的東西。
    server.reply(502, '<html>Bad Gateway</html>')

    const error = await getMyProfile().catch((e: unknown) => e)
    expect(error).toBeInstanceOf(HttpError)
    expect((error as HttpError).status).toBe(502)
  })

  it('測試 server 忘了準備回應時回 500 —— 不得看起來像成功', async () => {
    // 這條驗的是**載具本身**。回 200 空物件的話，一條忘了 `reply()` 的測試
    // 會靠「契約允許」意外通過，而那種綠燈什麼都沒證明。
    const error = await getMyProfile().catch((e: unknown) => e)
    expect((error as HttpError).status).toBe(500)
  })
})
