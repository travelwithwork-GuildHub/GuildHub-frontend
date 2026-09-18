import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as ops from '@/api/operations'
import { startContractServer, type ContractServer } from './support/contract-server'
import { CASES } from './support/api-operations-cases'

// 規格：openspec/changes/fe-o02-data-access/specs/data-access/spec.md
//   Requirement: 元件不知道自己連的是誰 —— Scenario FE-O02-S01
//
// 清單本身在 `support/api-operations-cases.ts`（`[FE-J14-S26]` 也要用它）。

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

describe('每一個 operation 都走一次真實路徑', () => {
  it('清單涵蓋 operations.ts 匯出的每一個操作', async () => {
    const exported = Object.keys(ops).filter((k) => typeof (ops as Record<string, unknown>)[k] === 'function')
    const covered = CASES.map(([name]) => name)

    // **少了這一條，新增一個操作而忘記加進 CASES 時什麼都不會發生。**
    expect(exported.filter((name) => !covered.includes(name)), '有操作沒被這個檔案涵蓋').toEqual([])
  })

  it.each(CASES)('%s', async (_name, invoke, reply, method, pathname, status) => {
    server.reply(status ?? 200, reply)
    await invoke()

    expect(server.calls).toHaveLength(1)
    expect(server.calls[0]?.method).toBe(method)
    expect(server.calls[0]?.pathname).toBe(pathname)
    // 有 body 的端點：那個布林是 server 拿契約算出來的
    if (server.calls[0]?.contractOk !== null) {
      expect(server.calls[0]?.contractOk, 'server 端的契約驗證沒過').toBe(true)
    }
  })
})
