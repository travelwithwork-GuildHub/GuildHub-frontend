import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildRequest } from '@/api/transport'
import * as ops from '@/api/operations'
import { startContractServer, type ContractServer } from './support/contract-server'

// 規格 `FE-B01-S04`（第一頁送 `page=0`）／`S05`（前進送 `page=1`）。
//
// ⚠️ **這一份驗的是「送出去的 URL 長什麼樣」，不是「有沒有呼叫某個函式」。**
// 攔 `fetch` 或攔 `send` 的話，「參數名打錯」與「`0` 被吃掉」兩種錯都驗不到 ——
// 而那兩種錯**在真後端上都不會報錯**：參數名打錯是被忽略、`page=0` 不帶
// 剛好等於預設值。兩種都是畫面完全正常、只有第二頁開始才不對。

const url = (query: Record<string, string | number | undefined>) =>
  new URL(buildRequest({ method: 'GET', path: '/api/profiles', query }).url)

describe('清單的分頁參數', () => {
  it('[FE-B01-S04] ⚠️ 第一頁送出的是 `page=0`，不是「不帶參數」', () => {
    // ⚠️⚠️ **這一條是這個檔案存在的理由。**
    //
    // `0` 是 falsy。用 `if (value)` 或 `value && ...` 過濾 query 的話，
    // 第一頁會變成完全不帶 `page` —— 而那**剛好等於後端的預設值**，
    // 所以畫面完全正常，測試也可能全綠。它會一直藏著，直到後端改預設值。
    //
    // 這個專案在 `FE-A05` 踩過同一個形狀：`if (av) body.avatar_id = av`
    // 靜默吃掉了第一個角色。
    expect(url({ page: 0 }).searchParams.get('page')).toBe('0')
  })

  it('[FE-B01-S05] 前進一頁送出的是 `page=1`（對照）', () => {
    // **沒有這一條，上一條說明不了什麼** —— 一個「永遠送 `page=0`」的實作也會通過。
    expect(url({ page: 1 }).searchParams.get('page')).toBe('1')
  })

  it('[FE-B01-S04] 參數名就是 `page` —— 不是 `offset`、不是 `skip`', () => {
    // ⚠️ `docs/WBS.md` 的 `FE-B01` 那一列逐字寫著「offset 翻頁」，而那是錯的。
    // 打錯參數名的話後端會**忽略它**並回第一頁 —— 不報錯，不 422。
    // 症狀是「翻頁按鈕會動，但每一頁的內容都一樣」。
    const search = url({ page: 2 }).search
    expect(search, '送出的 query 不是 `page`').toBe('?page=2')
  })

  it('沒有分頁參數時 SHALL NOT 留下一個空的 `?`', () => {
    // 空的 `?` 不會壞掉，但它會讓「這個請求帶了什麼」在 log 與 devtools 裡
    // 變得難讀，也讓 URL 比對型的判準要多處理一種形狀。
    expect(url({}).search).toBe('')
    expect(url({ page: undefined }).search).toBe('')
  })

  it('⚠️ `undefined` 略過，但 `0` 保留 —— 兩者不是同一件事', () => {
    // 這一條把上面兩條的分界寫死：一個「凡是 falsy 就略過」的實作
    // 會讓第一條紅，一個「凡是有 key 就帶上」的實作會讓上一條紅。
    expect(url({ page: 0 }).search).toBe('?page=0')
    expect(url({ page: undefined }).search).toBe('')
  })
})

// ── 走真的 operation，不只走 `buildRequest` ────────────────────────────
//
// ⚠️ **上面那幾條驗的是「query 物件變成 URL」，這幾條驗的是
// 「`listProfiles({ page })` 到底把什麼放進 query」。**
// 少了這一段，一個 `query: { offset: options.page }` 的實作會全綠 ——
// 而它在真後端上不報錯：未知參數被忽略，每一頁都回第一頁。
// 症狀是「翻頁按鈕會動，但內容一直一樣」。

describe('清單 operation 送出去的 query', () => {
  let server: ContractServer

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

  it.each([
    ['人才', (page: number) => ops.listProfiles({ page })],
    ['案件', (page: number) => ops.listProjects({ page })],
  ])('[FE-B01-S04] %s清單的第一頁送出 `?page=0`', async (_label, call) => {
    server.reply(200, [])
    await call(0)
    expect(server.calls[0]?.search, '第一頁沒有送出 `page=0` —— 0 是 falsy，是不是被過濾掉了？').toBe(
      '?page=0',
    )
  })

  it.each([
    ['人才', (page: number) => ops.listProfiles({ page })],
    ['案件', (page: number) => ops.listProjects({ page })],
  ])('[FE-B01-S05] %s清單前進一頁送出 `?page=1`', async (_label, call) => {
    server.reply(200, [])
    await call(1)
    expect(server.calls[0]?.search).toBe('?page=1')
  })

  it('[FE-B01-S05] ⚠️ 兩種清單走的是同一套分頁，不是各寫一份', async () => {
    // 規格〈案件與人才共用同一個容器〉的最底層那一半：
    // **連送出去的形狀都要一樣**。兩邊各自演化的話，容器共用了也沒有用。
    server.reply(200, [])
    await ops.listProfiles({ page: 3 })
    server.reply(200, [])
    await ops.listProjects({ page: 3 })
    expect(server.calls[0]?.search).toBe(server.calls[1]?.search)
  })
})
