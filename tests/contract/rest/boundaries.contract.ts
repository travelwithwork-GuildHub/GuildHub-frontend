import { describe, expect, it } from 'vitest'
import { codePointLength } from '@/api/contract/limits'
import { ProfileOut } from '@/api/contract/rest'
import { expandedCases, pendingCases } from '../boundaries'
import { ContractClient, baseUrl } from '../client'

// 規格：openspec/changes/fe-o05-contract-tests/specs/contract-tests/spec.md
//   Requirement: 成對邊界從 limits.ts 產生 —— S07、S08（S09 是把 bio.max 改 200 的突變，在 PR 裡跑）
//
// 每一個值都真的打到後端：`max` 接受、`max+1` 拒（DB check → 500 text/plain）。**只送超長抓不到收緊。**
// 這個檔案裡沒有任何長度數字：值來自 `boundaryValues(LIMITS.<field>)`。
// 到不了的欄位是 `it.todo`：報表上看得到、數得到（不是 console.log）。

describe('成對邊界', () => {
  for (const { field, pending } of pendingCases()) it.todo(`${field}：${pending}`)

  for (const c of expandedCases()) {
    const via = c.via
    const label = `${c.field} ${via.method} ${via.path} ${via.key}=<${codePointLength(c.value)} 個字, .length ${c.value.length}> 應${c.expect === 'accept' ? '接受' : `拒絕（${c.expectReject}）`}`
    it(`[FE-O05-S07][FE-O05-S08] ${label}`, async () => {
      const client = new ContractClient(baseUrl())
      if (via.login) await client.login('邊界')
      // PATCH：先放一個已知的合法值，拒絕之後要能證明沒有部分寫入。POST：拒絕不該產生資源，拒絕前後清單長度不變。
      const readBack = async () => {
        const r = await client.raw('GET', via.read.path)
        expect(r.status).toBe(200)
        const parsed = via.parse(r.json)
        return via.method === 'PATCH' ? (parsed as Record<string, unknown>)[via.read.key as string] : (parsed as unknown[]).length
      }
      if (via.method === 'PATCH') {
        const before = await client.raw('PATCH', via.path, { body: { [via.key]: via.baseValue } })
        expect(before.status).toBe(200)
      }
      const baseline = await readBack()
      const r = await client.raw(via.method, via.path, { body: { [via.key]: c.value } })
      if (c.expect === 'accept') {
        expect([200, 201], r.text.slice(0, 120)).toContain(r.status)
        const parsed = via.parse(r.json)
        if (via.method === 'PATCH') expect((parsed as Record<string, unknown>)[via.key], '回來的值不是送出去的那一個（被截斷？）').toBe(c.value)
      } else {
        expect(r.status).toBe(c.expectReject)
        if (c.expectReject === 500) {
          expect(r.contentType).toMatch(/^text\/plain/)
          expect(r.text).toBe('Internal Server Error')
        }
        expect(await readBack(), via.method === 'PATCH' ? '拒絕之後有部分寫入' : '拒絕之後多了一筆').toEqual(baseline)
      }
    })
  }

  it('[FE-O05-S08] bio 的純空白：後端不 trim，三個空白就是三個字', async () => {
    const client = new ContractClient(baseUrl())
    await client.login('空白')
    const r = await client.raw('PATCH', '/api/profiles/me', { body: { bio: '   ' } })
    expect(r.status).toBe(200)
    expect(ProfileOut.parse(r.json).bio).toBe('   ')
  })
})
