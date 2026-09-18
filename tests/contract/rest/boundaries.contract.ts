import { afterAll, describe, expect, it } from 'vitest'
import { codePointLength } from '@/api/contract/limits'
import { ProfileOut, ProjectResourceOut } from '@/api/contract/rest'
import { BOUNDARY_CASES, RESOURCE_BASE, excludedCases, expandedCases, oneResource, pendingCases, resourcesPath } from '../boundaries'
import { closeTrackedProjects } from '../cleanup'
import { ContractClient, baseUrl } from '../client'

// 規格：openspec/changes/fe-o05-contract-tests/specs/contract-tests/spec.md
//   Requirement: 成對邊界從 limits.ts 產生 —— S07、S08（S09 是把 bio.max 改 200 的突變，在 PR 裡跑）
//   openspec/changes/fe-j14-project-resources/specs/contract-tests/spec.md —— S33（資源的 label 與 url）
//
// 每一個值都真的打到後端：`max` 接受、`max+1` 拒（DB check → 500 text/plain）。**只送超長抓不到收緊。**
// 這個檔案裡沒有任何長度數字：值來自 `boundaryValues(LIMITS.<field>)`，網址的保長度塑形也在表裡。
// 到不了的欄位、被塑形排除的案例，都是 `it.todo`：報表上看得到、數得到（不是 console.log）。

describe('成對邊界', () => {
  // 這個檔案建的 active 專案跑完要收掉（`cleanup.ts` 檔頭：12 個門位）。
  afterAll(closeTrackedProjects)

  // **防恆真。** 下面那個 `for` 是資料驅動的：`expandedCases()` 回空陣列的話，一條 `it` 都不會產出來，
  // 整個成對邊界（含 `S33` 的全部涵蓋）就靜悄悄地綠。這一條把「宣告了幾個端點」與「真的跑了幾條」綁起來：
  // 每個宣告過的 (欄位, 端點) 都必須成對 —— 少了接受側或拒絕側都紅。
  // 對照組是 `tests/api-contract-endpoints.test.ts` 的 `expect(all.length).toBeGreaterThan(10)`。
  it('[FE-O05-S07] 每個宣告過的邊界端點都真的產出了成對的案例（接受＋拒絕）', () => {
    const declared = Object.entries(BOUNDARY_CASES).flatMap(([field, c]) => ('vias' in c ? c.vias.map((v) => `${field}|${v.method}|${v.key}`) : []))
    expect(declared.length, '一個有 vias 的欄位都沒有 —— 這張表被掏空了').toBeGreaterThan(0)
    const bySide = new Map<string, Set<string>>()
    for (const c of expandedCases()) {
      const key = `${c.field}|${c.via.method}|${c.via.key}`
      bySide.set(key, (bySide.get(key) ?? new Set<string>()).add(c.expect))
    }
    for (const key of declared) expect([...(bySide.get(key) ?? [])].sort(), `${key} 沒有成對的案例（boundaryValues 產不出值？）`).toEqual(['accept', 'reject'])
  })

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

  // 同一組值也要對 PATCH 跑一次：`S33` 說的是「`label`、`url` 同一組值得到對應的 200／500」，
  // 只驗 POST 的話，PATCH 那半條路上多一個 trim 或多一個長度檢查都抓不到。
  it('[FE-J14-S33] PATCH 的資源名稱：只含空白同樣被拒且不部分寫入，前後有空白的保留逐字', async () => {
    const client = new ContractClient(baseUrl())
    await client.login('資源的空白 PATCH')
    const { path, read } = await oneResource(client, 'label')
    const readBack = async () => read.pick((await client.raw('GET', read.path)).json)
    const before = await readBack()

    const blank = await client.raw('PATCH', path, { body: { label: '   ' } })
    expect(blank.status, blank.text.slice(0, 120)).toBe(500)
    expect(blank.contentType).toMatch(/^text\/plain/)
    expect(blank.text).toBe('Internal Server Error')
    expect(await readBack(), '只含空白的名稱被 PATCH 寫進去了').toEqual(before)

    const padded = await client.raw('PATCH', path, { body: { label: ' a ' } })
    expect(padded.status, padded.text.slice(0, 120)).toBe(200)
    expect(ProjectResourceOut.parse(padded.json).label, '前後的空白被 trim 掉了').toBe(' a ')
    expect(await readBack(), '回應說改了，讀回來卻不是').toBe(' a ')
  })
})
