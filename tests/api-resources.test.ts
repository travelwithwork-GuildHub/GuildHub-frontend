import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ContractDriftError, HttpError, NetworkError } from '@/api/transport'
import { createResource, deleteResource, listResources, updateResource } from '@/api/operations'
import { LIMITS } from '@/api/contract/limits'
import { startContractServer, type ContractServer } from './support/contract-server'

// 規格：openspec/specs/data-access/spec.md
//   Requirement: 元件不知道自己連的是誰 —— S01（method／路徑）
//   Requirement: 送出去之前先對照契約 —— S04
//   Requirement: 回來的東西在 API 邊界驗，漂掉就在邊界炸 —— S05／S07
//   openspec/changes/fe-j14-project-resources/：這四個存取函式是 `--panel`／`--form` 那兩片的地基，
//   它們對**請求形狀**的義務在這裡釘住（`FE-J14-S11` 只送原字串、`FE-J14-S17`／`S18` PATCH 只帶改過的鍵、
//   〈上限〉滿了是 409 不是例外）。那三條 Scenario 自己由面板那兩片的 jsdom 判準驗，這裡驗的是它們踩的地板。
//
// ⚠️ **請求由測試自己起的 server 收，而那個 server 用同一份契約驗 body**（`support/contract-server.ts`）——
// 沒有任何一條斷言在這裡重刻請求的形狀。
//
// ⚠️ 這一片的**實作在 `--contract`（tasks 2.2）就寫進 `src/api/operations.ts` 了**，
// 所以沒有「判準先紅」的那一步可走：這些斷言載不載重，由 tasks 5.3 的突變證明（紀錄在 PR 內文）。

let server: ContractServer

const PROJECT = '11111111-1111-1111-1111-111111111111'
const RESOURCE = '22222222-2222-4222-8222-222222222222'
const ROW = {
  id: RESOURCE,
  project_id: PROJECT,
  label: '設計稿',
  type: 'figma',
  url: 'https://figma.com/file/abc',
  created_at: '2026-09-09T00:00:00Z',
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

/** 這一次請求送出去的樣子。沒送出任何請求就直接失敗 —— `calls[0]?.` 會讓斷言變成「undefined 不等於 X」那種看不懂的紅。 */
function onlyCall() {
  expect(server.calls.length, '沒有送出請求').toBe(1)
  return server.calls[0] as NonNullable<(typeof server.calls)[0]>
}

describe('專案資源的四個存取函式', () => {
  it('[FE-O02-S01] 清單：GET 到樣板路徑、沒有 body、**不帶任何 query**（不分頁），回應整個陣列在邊界解析', async () => {
    server.reply(200, [ROW, { ...ROW, id: '33333333-3333-4333-8333-333333333333' }])
    const rows = await listResources(PROJECT)

    const call = onlyCall()
    expect(call.method).toBe('GET')
    expect(call.template).toBe('/api/projects/{project_id}/resources')
    expect(call.pathname).toBe(`/api/projects/${PROJECT}/resources`)
    // 上限是 `LIMITS.resourcesPerProject`，一次就回得完 —— 送出 `page=0` 跟完全不送在 `pathname` 上看不出差別，
    // 所以量的是 `search`（`contract-server.ts` 特地留了這個欄位）。
    expect(call.search, '清單不分頁，不該帶 query').toBe('')
    expect(call.body, 'GET 不該有 body').toBeUndefined()
    expect(rows.map((r) => r.id)).toEqual([RESOURCE, '33333333-3333-4333-8333-333333333333'])
  })

  it('[FE-O02-S04] 新增：body 是**原字串** —— 前後空白不 trim、大寫 scheme 不正規化（`FE-J14-S11` 的地板）', async () => {
    const raw = { label: ' 設計稿 ', type: 'figma' as const, url: 'HTTPS://EXAMPLE.COM/x' }
    server.reply(201, { ...ROW, ...raw })
    await createResource(PROJECT, raw)

    const call = onlyCall()
    expect(call.method).toBe('POST')
    expect(call.template).toBe('/api/projects/{project_id}/resources')
    expect(call.contractOk, 'server 端用同一份契約驗，沒過').toBe(true)
    // 逐字：`safeHref` 的正規化值（小寫 scheme、加尾斜線、`%20`）送出去的話，使用者存進去的字跟他打的不一樣。
    expect(call.body).toEqual(raw)
  })

  it('[FE-O02-S04] 新增：超過上限的 label 在**送出之前**就失敗，一個請求都沒發', async () => {
    const tooLong = 'ａ'.repeat(LIMITS.resourceLabel.max + 1)
    await expect(createResource(PROJECT, { label: tooLong, type: 'github', url: 'https://example.com/x' })).rejects.toThrow()
    expect(server.calls.length, '契約擋下來的東西還是送出去了').toBe(0)
  })

  it('[FE-O02-S04] 修改：body **只帶有改的那些鍵**（`FE-J14-S17`／`S18` 的地板）', async () => {
    server.reply(200, { ...ROW, url: 'https://example.com/新的' })
    await updateResource(PROJECT, RESOURCE, { url: 'https://example.com/新的' })

    const call = onlyCall()
    expect(call.method).toBe('PATCH')
    expect(call.template).toBe('/api/projects/{project_id}/resources/{resource_id}')
    expect(call.pathname).toBe(`/api/projects/${PROJECT}/resources/${RESOURCE}`)
    expect(call.contractOk).toBe(true)
    // **鍵的集合**要相等，不只是值對：多送沒改的欄位會蓋掉別人在這期間改的那一欄。
    expect(Object.keys(call.body as object).sort()).toEqual(['url'])
  })

  it('[FE-O02-S04] 修改：呼叫端給了一個「沒改的欄位是 undefined」的物件，送出去的仍然只有有值的那些鍵', async () => {
    server.reply(200, ROW)
    await updateResource(PROJECT, RESOURCE, { label: '改過的', type: undefined, url: undefined })
    expect(Object.keys(onlyCall().body as object).sort()).toEqual(['label'])
  })

  it('[FE-O02-S05] 刪除：DELETE，沒有 body；後端回 204 也**不會**被當成契約漂移', async () => {
    server.reply(204, null)
    await expect(deleteResource(PROJECT, RESOURCE)).resolves.toBeUndefined()

    const call = onlyCall()
    expect(call.method).toBe('DELETE')
    expect(call.template).toBe('/api/projects/{project_id}/resources/{resource_id}')
    expect(call.body).toBeUndefined()
  })

  it('[FE-O02-S05] 清單裡有一筆漂掉（少 `created_at`）：整個在邊界炸，不是靜默丟掉那一筆', async () => {
    const { created_at: _dropped, ...broken } = ROW
    server.reply(200, [ROW, broken])
    await expect(listResources(PROJECT)).rejects.toBeInstanceOf(ContractDriftError)
  })

  it('[FE-O02-S07] 滿 50 筆的 409 是 `HttpError`，**不是例外路徑** —— status 與 detail 都留著', async () => {
    server.reply(409, { detail: `一個專案最多 ${LIMITS.resourcesPerProject.max} 筆資源` })
    const error = await createResource(PROJECT, { label: '再一筆', type: 'github', url: 'https://example.com/x' }).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(HttpError)
    expect((error as HttpError).status).toBe(409)
    expect((error as HttpError).detail).toBe(`一個專案最多 ${LIMITS.resourcesPerProject.max} 筆資源`)
  })

  it('[FE-X03-S08] 連線在拿到回應之前就斷了：`NetworkError`，不是 `TypeError`', async () => {
    server.reply(200, [], { drop: true })
    await expect(listResources(PROJECT)).rejects.toBeInstanceOf(NetworkError)
  })
})
