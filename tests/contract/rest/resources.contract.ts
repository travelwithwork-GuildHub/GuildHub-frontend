import pg from 'pg'
import { afterAll, describe, expect, it } from 'vitest'
import { ProjectOut, ProjectResourceOut } from '@/api/contract/rest'
import { ValidationError } from '@/api/contract/errors'
import { closeTrackedProjects, trackProject } from '../cleanup'
import { ContractClient, baseUrl, databaseUrl } from '../client'

// 規格：openspec/changes/fe-j14-project-resources/specs/internal-backend/spec.md
//   Requirement: 本地專案資源四端點 —— S29（權限×狀態矩陣）、S30（驗證）、S31（部分更新）、S32（50 筆上限）
//   Requirement: 每個 handler 走同一條管線 —— S28（DELETE 走同一條管線、204 沒有 body）
//
// 同一組對 internal 與 guildhub 各跑一次；這個檔案不知道自己在打誰。
// 專案是自己建的（`POST /api/projects` → recruiting、`form-team` → active、`close` → closed），不動 seed。
// 「已經有 50 筆」這種前置用 SQL 直接寫進同一個可拋棄庫（兩個目標都有 `databaseUrl()`）—— 打 50 次 POST
// 只是在重複測 POST 自己，而且慢。規格允許（〈由 harness 以可拋棄資料庫的 seed 或直接寫入準備〉）。
//
// 「持票」＝這個 session 對那個專案 `enter` 成功過（`room-entry-gate`〈伺服器端記住票〉）。票怎麼被記住是後端的事，
// 這裡照常用同一個 cookie jar 打 `enter`，請求上**不帶票**（兩個目標的請求相同）。
// 票本身的語意（別間房不算、換人不算、本地的 cookie 怎麼記）在 `enter.contract.ts` 的 `S34`／`S37`。

const ZERO = '00000000-0000-4000-8000-000000000000'
const GOOD = { label: '設計稿', type: 'figma', url: 'https://figma.com/file/abc' }

async function sql<T extends Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  const client = new pg.Client({ connectionString: databaseUrl() })
  await client.connect()
  try {
    return (await client.query<T>(text, params)).rows
  } finally {
    await client.end()
  }
}

const list = (c: ContractClient, p: string) => c.raw('GET', `/api/projects/${p}/resources`)
const add = (c: ContractClient, p: string, body: unknown = GOOD) => c.raw('POST', `/api/projects/${p}/resources`, { body })
const patch = (c: ContractClient, p: string, r: string, body: unknown) => c.raw('PATCH', `/api/projects/${p}/resources/${r}`, { body })
const remove = (c: ContractClient, p: string, r: string) => c.raw('DELETE', `/api/projects/${p}/resources/${r}`)
const detailOf = (r: { json: unknown }) => (r.json as { detail: unknown }).detail

async function project(c: ContractClient, title: string, to: 'recruiting' | 'active' | 'closed'): Promise<string> {
  const created = await c.raw('POST', '/api/projects', { body: { title, body: '資源契約測試', needed_skills: [], seat_count: 4 } })
  expect(created.status, created.text.slice(0, 200)).toBe(201)
  const id = ProjectOut.parse(created.json).id
  if (to !== 'recruiting') expect((await c.raw('POST', `/api/projects/${id}/form-team`, { body: { password: 'guild1234' } })).status).toBe(200)
  if (to === 'closed') expect((await c.raw('POST', `/api/projects/${id}/close`)).status).toBe(200)
  // 跑完要收掉：active 專案會跟 seed 的兩間房搶走廊的 12 個門位（`cleanup.ts` 檔頭）。
  return trackProject(c, id)
}

/** 新增一筆當前置（本身不是判準）。 */
async function seedOne(c: ContractClient, p: string, label = '既有的'): Promise<ProjectResourceOut> {
  const r = await add(c, p, { ...GOOD, label })
  expect(r.status, r.text.slice(0, 200)).toBe(201)
  return ProjectResourceOut.parse(r.json)
}

/** 直接把 n 筆塞進庫（跳過端點）—— 只給「已經有 N 筆」這種前置用。 */
async function fillTo(projectId: string, n: number): Promise<void> {
  await sql('delete from project_resources where project_id = $1', [projectId])
  // `created_at` **兩兩相同**（`(i / 2)` 是整數除法）：這樣 `order by created_at asc, id asc` 兩半都有事做 ——
  // 只有 `created_at` 的話平手那兩列的順序沒被釘住，只有 `id` 的話跨秒的順序沒被釘住。
  await sql(
    "insert into project_resources (project_id, label, type, url, created_at) " +
      "select $1::uuid, 'seed ' || i, 'github', 'https://example.com/' || i, now() - interval '1 hour' + ((i / 2) * interval '1 second') from generate_series(1, $2) as i",
    [projectId, n],
  )
}

// 每個檔案跑完把自己建的 active 專案收掉（`cleanup.ts` 檔頭：走廊只有 12 個門位，seed 那兩間會被擠掉）。
afterAll(closeTrackedProjects)

describe('專案資源：權限與狀態', () => {
  it('[FE-J14-S29] 未登入／專案不存在／active／closed／recruiting 每一列的碼與 detail', async () => {
    const owner = new ContractClient(baseUrl())
    await owner.login('資源矩陣的發起人')
    const other = new ContractClient(baseUrl())
    await other.login('資源矩陣的別人')
    const anon = new ContractClient(baseUrl())

    const active = await project(owner, '矩陣 active', 'active')
    const one = await seedOne(owner, active)

    // 未登入：四個端點都是 401，而且 401 排在最前面（path 也不合法時仍是 401）
    for (const r of [await list(anon, active), await add(anon, active), await patch(anon, active, one.id, { label: 'x' }), await remove(anon, active, one.id)]) {
      expect(r.status).toBe(401)
      expect(r.json).toEqual({ detail: '未登入' })
    }
    expect((await remove(anon, active, 'not-a-uuid')).status, '401 要排在 path 的 422 前面').toBe(401)

    // 專案不存在：讀寫都 404
    for (const r of [await list(owner, ZERO), await add(owner, ZERO), await patch(owner, ZERO, one.id, { label: 'x' }), await remove(owner, ZERO, one.id)]) {
      expect(r.status).toBe(404)
      expect(r.json).toEqual({ detail: '專案不存在' })
    }

    // active、owner：200／201／200／204
    expect((await list(owner, active)).status).toBe(200)
    const created = await add(owner, active, { ...GOOD, label: '新的' })
    expect(created.status, created.text.slice(0, 200)).toBe(201)
    const mine = ProjectResourceOut.parse(created.json)
    expect((await patch(owner, active, mine.id, { label: '改過' })).status).toBe(200)
    expect((await remove(owner, active, mine.id)).status).toBe(204)

    // active、非 owner、沒有票：讀 403（尚未通過房間密碼驗證）、寫 403（只有發起人可以做這件事）
    const peek = await list(other, active)
    expect(peek.status).toBe(403)
    expect(detailOf(peek)).toBe('尚未通過房間密碼驗證')
    for (const r of [await add(other, active), await patch(other, active, one.id, { label: 'x' }), await remove(other, active, one.id)]) {
      expect(r.status).toBe(403)
      expect(detailOf(r)).toBe('只有發起人可以做這件事')
    }

    // active、非 owner、**持票**：讀 200，但寫三種仍然是 403 —— 票只換到讀，不換到寫
    expect((await other.raw('POST', `/api/projects/${active}/enter`, { body: { password: 'guild1234' } })).status, '拿不到票，下面的 200 就不算數').toBe(200)
    const ticketed = await list(other, active)
    expect(ticketed.status, ticketed.text.slice(0, 200)).toBe(200)
    expect((ticketed.json as unknown[]).length, '持票讀到的不是這個專案的清單').toBe(1)
    for (const r of [await add(other, active), await patch(other, active, one.id, { label: 'x' }), await remove(other, active, one.id)]) {
      expect(r.status, r.text.slice(0, 200)).toBe(403)
      expect(detailOf(r)).toBe('只有發起人可以做這件事')
    }

    // closed：owner 讀得到、寫是 409；非 owner 一律 403
    const closed = await project(owner, '矩陣 closed', 'active')
    const inClosed = await seedOne(owner, closed)
    expect((await owner.raw('POST', `/api/projects/${closed}/close`)).status).toBe(200)
    const closedRead = await list(owner, closed)
    expect(closedRead.status).toBe(200)
    expect((closedRead.json as unknown[]).length).toBe(1)
    for (const r of [await add(owner, closed), await patch(owner, closed, inClosed.id, { label: 'x' }), await remove(owner, closed, inClosed.id)]) {
      expect(r.status).toBe(409)
      expect(detailOf(r)).toBe('專案已結案，資源不能再修改')
    }
    const closedPeek = await list(other, closed)
    expect(closedPeek.status).toBe(403)
    expect(detailOf(closedPeek)).toBe('尚未通過房間密碼驗證')
    // 三種寫入都要打：「非 owner」排在「已結案」前面 —— 漏掉 PATCH／DELETE 的話，那兩個回 409 也看不出來。
    for (const r of [await add(other, closed), await patch(other, closed, inClosed.id, { label: 'x' }), await remove(other, closed, inClosed.id)]) {
      expect(r.status, r.text.slice(0, 200)).toBe(403)
      expect(detailOf(r)).toBe('只有發起人可以做這件事')
    }

    // closed、非 owner、**持票**：closed 仍然簽得到票（`FE-N08-S12`），但讀還是 403 —— 票不開已結案那扇門
    expect((await other.raw('POST', `/api/projects/${closed}/enter`, { body: { password: 'guild1234' } })).status, 'closed 專案簽不出票，下面那條就不算數').toBe(200)
    const closedTicketed = await list(other, closed)
    expect(closedTicketed.status, closedTicketed.text.slice(0, 200)).toBe(403)
    expect(detailOf(closedTicketed)).toBe('尚未通過房間密碼驗證')

    // recruiting：owner 讀到空陣列、寫是 409；非 owner 一律 403
    const recruiting = await project(owner, '矩陣 recruiting', 'recruiting')
    const recruitingRead = await list(owner, recruiting)
    expect(recruitingRead.status).toBe(200)
    expect(recruitingRead.json).toEqual([])
    for (const r of [await add(owner, recruiting), await patch(owner, recruiting, ZERO, { label: 'x' }), await remove(owner, recruiting, ZERO)]) {
      expect(r.status).toBe(409)
      expect(detailOf(r)).toBe('專案還沒成軍，還沒有房間可以放資源')
    }
    const recruitingPeek = await list(other, recruiting)
    expect(recruitingPeek.status).toBe(403)
    expect(detailOf(recruitingPeek)).toBe('尚未通過房間密碼驗證')
    for (const r of [await add(other, recruiting), await patch(other, recruiting, ZERO, { label: 'x' }), await remove(other, recruiting, ZERO)]) {
      expect(r.status, r.text.slice(0, 200)).toBe(403)
      expect(detailOf(r)).toBe('只有發起人可以做這件事')
    }
  })
})

describe('專案資源：驗證', () => {
  it('[FE-J14-S30] 422 的五種、DB check 的 500、大寫 scheme、未知欄位、PATCH {}、六個非法 path', async () => {
    const owner = new ContractClient(baseUrl())
    await owner.login('資源驗證的發起人')
    const p = await project(owner, '驗證用', 'active')

    // 422：少 url、非法 type、label 是 null、label 是數字、body 不是 JSON
    for (const body of [{ label: '少了網址', type: 'github' }, { ...GOOD, type: 'other' }, { ...GOOD, label: null }, { ...GOOD, label: 123 }, 'not json'] as unknown[]) {
      const r = await add(owner, p, body)
      expect(r.status, `這個 body 沒有回 422：${JSON.stringify(body)}`).toBe(422)
      const detail = detailOf(r)
      expect(Array.isArray(detail)).toBe(true)
      for (const item of detail as unknown[]) ValidationError.parse(item)
    }

    // DB check → 500 text/plain，而且一筆都沒進去
    const before = ((await list(owner, p)).json as unknown[]).length
    for (const body of [{ ...GOOD, label: '   ' }, { ...GOOD, url: 'ftp://example.com' }, { ...GOOD, url: 'https://example.com/a b' }]) {
      const r = await add(owner, p, body)
      expect(r.status, `這個 body 沒有回 500：${JSON.stringify(body)}`).toBe(500)
      expect(r.contentType).toMatch(/^text\/plain/)
      expect(r.text).toBe('Internal Server Error')
      expect(((await list(owner, p)).json as unknown[]).length, '拒絕之後多了一筆').toBe(before)
    }

    // 大寫 scheme 與 host：check 是 `~*`（不分大小寫），存得進去而且逐字回來
    const upper = 'HTTPS://EXAMPLE.COM/x'
    const uppered = await add(owner, p, { ...GOOD, url: upper })
    expect(uppered.status, uppered.text.slice(0, 200)).toBe(201)
    expect(ProjectResourceOut.parse(uppered.json).url).toBe(upper)

    // 未知欄位靜默忽略（含 id、project_id、created_at）
    const elsewhere = await project(owner, '別的專案', 'active')
    const sneaky = await add(owner, p, { ...GOOD, id: ZERO, project_id: elsewhere, created_at: '2000-01-01T00:00:00Z' })
    expect(sneaky.status, sneaky.text.slice(0, 200)).toBe(201)
    const made = ProjectResourceOut.parse(sneaky.json)
    expect(made.id).not.toBe(ZERO)
    expect(made.project_id).toBe(p)
    expect(made.created_at.startsWith('2000')).toBe(false)

    // PATCH {} 原樣、PATCH {"label":null} 是 422、未知欄位不蓋掉 id 與 created_at
    const untouched = await patch(owner, p, made.id, {})
    expect(untouched.status, untouched.text.slice(0, 200)).toBe(200)
    expect(ProjectResourceOut.parse(untouched.json)).toEqual(made)
    expect((await patch(owner, p, made.id, { label: null })).status).toBe(422)
    const renamed = await patch(owner, p, made.id, { label: '新名字', id: ZERO, created_at: '2000-01-01T00:00:00Z' })
    expect(renamed.status, renamed.text.slice(0, 200)).toBe(200)
    const after = ProjectResourceOut.parse(renamed.json)
    expect(after.label).toBe('新名字')
    expect(after.id).toBe(made.id)
    expect(after.created_at).toBe(made.created_at)

    // 六個非法 path：四個端點都走同一條管線
    for (const r of [
      await list(owner, 'not-a-uuid'),
      await add(owner, 'not-a-uuid'),
      await patch(owner, 'not-a-uuid', made.id, { label: 'x' }),
      await remove(owner, 'not-a-uuid', made.id),
      await patch(owner, p, 'not-a-uuid', { label: 'x' }),
      await remove(owner, p, 'not-a-uuid'),
    ]) {
      expect(r.status, r.text.slice(0, 200)).toBe(422)
      const detail = detailOf(r) as unknown[]
      expect(Array.isArray(detail)).toBe(true)
      expect(ValidationError.parse(detail[0]).loc[0]).toBe('path')
    }
  })
})

describe('專案資源：部分更新、順序、刪除', () => {
  it('[FE-J14-S31] PATCH 只改給的欄位、順序不變、重複網址、DELETE 兩次、跨專案是 404', async () => {
    const owner = new ContractClient(baseUrl())
    await owner.login('資源更新的發起人')
    const p = await project(owner, '更新用', 'active')

    const a = await seedOne(owner, p, 'A')
    const bCreated = await add(owner, p, { label: 'B', type: 'notion', url: 'https://same.example.com/x' })
    expect(bCreated.status, bCreated.text.slice(0, 200)).toBe(201)
    const b = ProjectResourceOut.parse(bCreated.json)
    const cCreated = await add(owner, p, { label: 'C', type: 'drive', url: 'https://same.example.com/x' })
    expect(cCreated.status, '同一個專案要允許重複的網址').toBe(201)
    const c = ProjectResourceOut.parse(cCreated.json)

    const renamed = await patch(owner, p, b.id, { label: 'B 改名' })
    expect(renamed.status, renamed.text.slice(0, 200)).toBe(200)
    const newB = ProjectResourceOut.parse(renamed.json)
    expect(newB.label).toBe('B 改名')
    expect([newB.type, newB.url, newB.created_at]).toEqual([b.type, b.url, b.created_at])

    const three = ((await list(owner, p)).json as unknown[]).map((x) => ProjectResourceOut.parse(x))
    expect(three.map((x) => x.id)).toEqual([a.id, b.id, c.id])
    expect(three[1]?.label).toBe('B 改名')

    expect((await remove(owner, p, b.id)).status).toBe(204)
    expect(((await list(owner, p)).json as unknown[]).map((x) => ProjectResourceOut.parse(x).id)).toEqual([a.id, c.id])
    const twice = await remove(owner, p, b.id)
    expect(twice.status).toBe(404)
    expect(detailOf(twice)).toBe('資源不存在')

    // ⚠️ **3 筆證明不了順序。** 那麼少的列 planner 走 `(project_id, created_at, id)` 的 Index Only Scan，
    // 順序是索引順手給的 —— 把 `order by created_at asc, id asc` 整句拿掉，上面那條仍然全綠（審查抓到）。
    // 50 筆時 planner 改走 Seq Scan，順序變成堆裡的實體順序，而 `UPDATE` 過的列會被搬到堆的最後面。
    // 所以這一段：塞滿 50 筆（`created_at` 兩兩相同）、改中間那一列、再讀一次，順序必須還是 (created_at, id)。
    const many = await project(owner, '順序用', 'active')
    await fillTo(many, 50)
    const rowsOf = async () => ((await list(owner, many)).json as unknown[]).map((x) => ProjectResourceOut.parse(x))
    const sortKey = (x: { created_at: string; id: string }) => `${x.created_at}|${x.id}`
    const before = await rowsOf()
    expect(before.length).toBe(50)
    expect(before.map(sortKey), '50 筆的順序不是 (created_at, id)').toEqual([...before.map(sortKey)].sort())
    const middle = before[25]
    expect(middle).toBeDefined()
    const moved = await patch(owner, many, (middle as ProjectResourceOut).id, { label: '被改過的' })
    expect(moved.status, moved.text.slice(0, 200)).toBe(200)
    expect((await rowsOf()).map((x) => x.id), 'PATCH 過的那一列在清單裡換位置了').toEqual(before.map((x) => x.id))

    // 用 P 的 path 去動 Q 的資源：404，而且 Q 沒變
    const q = await project(owner, '另一個專案', 'active')
    const inQ = await seedOne(owner, q, 'Q 的')
    expect((await patch(owner, p, inQ.id, { label: '偷改' })).status).toBe(404)
    expect((await remove(owner, p, inQ.id)).status).toBe(404)
    expect(((await list(owner, q)).json as unknown[]).map((x) => ProjectResourceOut.parse(x))).toEqual([inQ])
  })
})

describe('專案資源：50 筆上限', () => {
  it('[FE-J14-S32] 第 51 筆 409；兩個並行新增恰好一個成功', async () => {
    const owner = new ContractClient(baseUrl())
    await owner.login('資源上限的發起人')
    const full = await project(owner, '滿的', 'active')
    await fillTo(full, 50)

    const over = await add(owner, full)
    expect(over.status, over.text.slice(0, 200)).toBe(409)
    expect(detailOf(over)).toBe('一個專案最多 50 筆資源')
    expect(((await list(owner, full)).json as unknown[]).length).toBe(50)

    const racy = await project(owner, '並行的', 'active')
    for (let round = 0; round < 10; round += 1) {
      await fillTo(racy, 49)
      const [x, y] = await Promise.all([add(owner, racy, { ...GOOD, label: `並行 ${round} 甲` }), add(owner, racy, { ...GOOD, label: `並行 ${round} 乙` })])
      expect([x.status, y.status].sort(), `第 ${round} 輪不是恰好一個 201 一個 409：${x.text.slice(0, 120)} ／ ${y.text.slice(0, 120)}`).toEqual([201, 409])
      expect(((await list(owner, racy)).json as unknown[]).length, `第 ${round} 輪超過 50`).toBe(50)
    }
  })
})

describe('DELETE 走同一條管線', () => {
  it('[FE-J14-S28] 未登入 401、owner 204 且 body 是空的、非法 uuid 422 且 loc[0] 是 path', async () => {
    const owner = new ContractClient(baseUrl())
    await owner.login('刪除的發起人')
    const p = await project(owner, '刪除用', 'active')
    const one = await seedOne(owner, p)

    const anon = new ContractClient(baseUrl())
    const unauth = await remove(anon, p, one.id)
    expect(unauth.status).toBe(401)
    expect(unauth.contentType).toMatch(/application\/json/)
    expect(unauth.json).toEqual({ detail: '未登入' })

    const gone = await remove(owner, p, one.id)
    expect(gone.status, gone.text.slice(0, 200)).toBe(204)
    expect(gone.text.length, '204 不該有 body').toBe(0)

    const bad = await remove(owner, p, 'not-a-uuid')
    expect(bad.status).toBe(422)
    const detail = detailOf(bad) as unknown[]
    expect(Array.isArray(detail)).toBe(true)
    expect(ValidationError.parse(detail[0]).loc[0]).toBe('path')
  })
})
