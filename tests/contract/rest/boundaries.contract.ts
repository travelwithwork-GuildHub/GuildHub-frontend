import { describe, expect, it } from 'vitest'
import { codePointLength } from '@/api/contract/limits'
import { ProfileOut, ProjectResourceOut } from '@/api/contract/rest'
import { RESOURCE_BASE, excludedCases, expandedCases, pendingCases, resourcesPath } from '../boundaries'
import { ContractClient, baseUrl } from '../client'

// 規格：openspec/changes/fe-o05-contract-tests/specs/contract-tests/spec.md
//   Requirement: 成對邊界從 limits.ts 產生 —— S07、S08（S09 是把 bio.max 改 200 的突變，在 PR 裡跑）
//   openspec/changes/fe-j14-project-resources/specs/contract-tests/spec.md —— S33（資源的 label 與 url）
//
// 每一個值都真的打到後端：`max` 接受、`max+1` 拒（DB check → 500 text/plain）。**只送超長抓不到收緊。**
// 這個檔案裡沒有任何長度數字：值來自 `boundaryValues(LIMITS.<field>)`，網址的保長度塑形也在表裡。
// 到不了的欄位、被塑形排除的案例，都是 `it.todo`：報表上看得到、數得到（不是 console.log）。

describe('成對邊界', () => {
  for (const { field, pending } of pendingCases()) it.todo(`${field}：${pending}`)
  for (const { field, why } of excludedCases()) it.todo(`${field} 的 min 側 accept：${why}`)

  for (const c of expandedCases()) {
    const via = c.via
    const where = via.prepare === undefined ? via.path : '（前置建的路徑）'
    const label = `${c.field} ${via.method} ${where} ${via.key}=<${codePointLength(c.value)} 個字, .length ${c.value.length}> 應${c.expect === 'accept' ? '接受' : `拒絕（${c.expectReject}）`}`
    it(`[${c.scenario}] ${label}`, async () => {
      const client = new ContractClient(baseUrl())
      if (via.login) await client.login('邊界')
      const { path, read } = via.prepare === undefined ? { path: via.path, read: via.read } : await via.prepare(client)
      // PATCH：先放一個已知的合法值，拒絕之後要能證明沒有部分寫入。POST：拒絕不該產生資源，拒絕前後清單長度不變。
      const readBack = async () => {
        const r = await client.raw('GET', read.path)
        expect(r.status).toBe(200)
        return read.pick(r.json)
      }
      if (via.method === 'PATCH') {
        const before = await client.raw('PATCH', path, { body: { [via.key]: via.baseValue } })
        expect(before.status, before.text.slice(0, 120)).toBe(200)
      }
      const baseline = await readBack()
      const r = await client.raw(via.method, path, { body: { ...via.extra, [via.key]: c.value } })
      if (c.expect === 'accept') {
        expect([200, 201], r.text.slice(0, 120)).toContain(r.status)
        expect(via.echo(r.json), '回來的值不是送出去的那一個（被截斷？被正規化？）').toBe(c.value)
      } else {
        expect(r.status, r.text.slice(0, 120)).toBe(c.expectReject)
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

  it('[FE-J14-S33] 資源名稱只含空白被拒（DB 的 btrim check），前後有空白的保留逐字', async () => {
    const client = new ContractClient(baseUrl())
    await client.login('資源的空白')
    const { path, read } = await resourcesPath(client)
    const before = read.pick((await client.raw('GET', read.path)).json)

    const blank = await client.raw('POST', path, { body: { ...RESOURCE_BASE, label: '   ' } })
    expect(blank.status, blank.text.slice(0, 120)).toBe(500)
    expect(blank.contentType).toMatch(/^text\/plain/)
    expect(blank.text).toBe('Internal Server Error')
    expect(read.pick((await client.raw('GET', read.path)).json), '只含空白的名稱進去了').toEqual(before)

    const padded = await client.raw('POST', path, { body: { ...RESOURCE_BASE, label: ' a ' } })
    expect(padded.status, padded.text.slice(0, 120)).toBe(201)
    expect(ProjectResourceOut.parse(padded.json).label, '前後的空白被 trim 掉了').toBe(' a ')
  })
})
