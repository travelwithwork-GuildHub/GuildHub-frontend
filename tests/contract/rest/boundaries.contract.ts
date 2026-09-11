import { describe, expect, it } from 'vitest'
import { codePointLength } from '@/api/contract/limits'
import { ProfileOut } from '@/api/contract/rest'
import { BOUNDARY_CASES, expandedCases } from '../boundaries'
import { ContractClient, baseUrl } from '../client'

// 規格：openspec/changes/fe-o05-contract-tests/specs/contract-tests/spec.md
//   Requirement: 成對邊界從 limits.ts 產生 —— S07、S08（S09 是把 bio.max 改 200 的突變，在 PR 裡跑）
//
// 每一個值都真的打到後端：`max` 接受、`max+1` 拒（DB check → 500 text/plain）。**只送超長抓不到收緊。**
// 這個檔案裡沒有任何長度數字：值來自 `boundaryValues(LIMITS.<field>)`。

const pending = BOUNDARY_CASES.filter((c) => c.pending)
if (pending.length > 0) console.log(`[boundaries] pending（W2 端點到不了）：${pending.map((c) => `${c.field} → ${c.pending}`).join('；')}`)

describe('成對邊界', () => {
  for (const c of expandedCases()) {
    const via = c.via as NonNullable<typeof c.via>
    const label = `${c.field} ${via.method} ${via.path} ${via.key}=<${codePointLength(c.value)} 個字, .length ${c.value.length}> 應${c.expect === 'accept' ? '接受' : `拒絕（${c.expectReject}）`}`
    it(`[FE-O05-S07][FE-O05-S08] ${label}`, async () => {
      const client = new ContractClient(baseUrl())
      if (via.login) await client.login('邊界')
      // 先放一個已知的合法值，拒絕之後要能證明沒有部分寫入。
      const before = await client.raw('PATCH', via.path, { body: { [via.key]: c.field === 'bio' ? '原本' : '原本的名字' } })
      expect(before.status).toBe(200)
      const r = await client.raw(via.method, via.path, { body: { [via.key]: c.value } })
      if (c.expect === 'accept') {
        expect(r.status, r.text.slice(0, 120)).toBe(200)
        expect((ProfileOut.parse(r.json) as Record<string, unknown>)[via.key], '回來的值不是送出去的那一個（被截斷？）').toBe(c.value)
      } else {
        expect(r.status).toBe(c.expectReject)
        if (c.expectReject === 500) {
          expect(r.contentType).toMatch(/^text\/plain/)
          expect(r.text).toBe('Internal Server Error')
        }
        const after = await client.raw('GET', '/api/me')
        expect((ProfileOut.parse(after.json) as Record<string, unknown>)[via.key], '拒絕之後有部分寫入').toBe(c.field === 'bio' ? '原本' : '原本的名字')
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
