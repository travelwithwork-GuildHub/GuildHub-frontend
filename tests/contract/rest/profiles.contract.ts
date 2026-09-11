import { readFile } from 'node:fs/promises'
import path from 'node:path'
import pg from 'pg'
import { describe, expect, it } from 'vitest'
import { ValidationError } from '@/api/contract/errors'
import { ProfileOut, ProjectOut, RoomDoorOut } from '@/api/contract/rest'
import { ContractClient, baseUrl, databaseUrl, unimplemented } from '../client'

// 規格：openspec/changes/fe-o03-internal-backend/specs/internal-backend/spec.md
//   Requirement: 每個 handler 走同一條管線，錯誤形狀複製真後端 —— S01、S04、S05
//   Requirement: 人才與案件清單：分頁形狀複製真後端 —— S15、S16、S17
//
// ⚠️ 名片筆數會被別的案例的 login 加多，所以 S15 不寫死 32／28：用資料庫算出總數再推每一頁該有幾筆。

type Golden = { cases: Record<string, { status: number; loc0: string; type: string; loc?: Array<string | number> }> }
const golden = JSON.parse(await readFile(path.join(__dirname, '..', 'golden', '422.json'), 'utf8')) as Golden
const ZERO = '00000000-0000-4000-8000-000000000000'

async function sql<T extends Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  const client = new pg.Client({ connectionString: databaseUrl() })
  await client.connect()
  try {
    return (await client.query<T>(text, params)).rows
  } finally {
    await client.end()
  }
}

describe('未登入', () => {
  it('[FE-O03-S01] 五個需要登入的端點沒有 cookie 都是 401 {"detail":"未登入"}，沒有其他鍵', async () => {
    const c = new ContractClient(baseUrl())
    for (const [method, p] of [
      ['GET', '/api/me'],
      ['GET', '/api/profiles'],
      ['GET', '/api/projects'],
      ['GET', '/api/rooms'],
      ['PATCH', '/api/profiles/me'],
    ] as const) {
      const r = await c.raw(method, p, method === 'PATCH' ? { body: { bio: 'x' } } : {})
      expect(r.status, `${method} ${p}`).toBe(401)
      expect(r.contentType, `${method} ${p}`).toMatch(/application\/json/)
      expect(r.json, `${method} ${p}`).toEqual({ detail: '未登入' })
    }
  })
})

describe('不存在與不假裝存在', () => {
  it('[FE-O03-S04] 不存在的名片與專案', async () => {
    const c = new ContractClient(baseUrl())
    await c.login('找不到的人')
    const p = await c.raw('GET', `/api/profiles/${ZERO}`)
    expect(p.status).toBe(404)
    expect(p.json).toEqual({ detail: '名片不存在' })
    const j = await c.raw('GET', `/api/projects/${ZERO}`)
    expect(j.status).toBe(404)
    expect(j.json).toEqual({ detail: '專案不存在' })
  })

  it('[FE-O03-S05] 目標宣稱沒做的端點：Next 自己的 404／405（非 JSON），不是假造的 detail、不是 501；沒宣稱的要真的在', async () => {
    const c = new ContractClient(baseUrl())
    await c.login('探路的人')
    const probes: Record<string, () => Promise<{ status: number; contentType: string }>> = {
      'POST /api/projects': () => c.raw('POST', '/api/projects', { body: { title: 'x', body: 'y' } }),
      'GET /api/messages': () => c.raw('GET', '/api/messages'),
    }
    const missing = unimplemented()
    for (const [key, probe] of Object.entries(probes)) {
      const r = await probe()
      if (missing.includes(key)) {
        // 路由檔在但沒那個 method → 405；路由檔不在 → 404。兩者都是 Next 的，不是 JSON。
        expect([404, 405], `${key} 宣稱沒做，卻回 ${r.status}`).toContain(r.status)
        expect(r.contentType, `${key} 假造了 JSON detail`).not.toMatch(/application\/json/)
      } else {
        // 宣稱有的就要真的有：不是 404／405／501（真後端這兩個是 201／200）。
        expect([404, 405, 501], `${key} 宣稱有，卻回 ${r.status}`).not.toContain(r.status)
      }
    }
  })

  it('[FE-O03-S04] 路徑 uuid 的接受範圍跟 Pydantic 一樣：32 位無連字號是 404（找不到），亂字是 422 path.profile_id', async () => {
    const c = new ContractClient(baseUrl())
    await c.login('打奇怪 id 的人')
    const compact = await c.raw('GET', '/api/profiles/00000000000040008000000000000000')
    expect(compact.status, '32 位無連字號應該被當成合法 uuid → 404').toBe(404)
    const bad = await c.raw('GET', '/api/profiles/not-a-uuid')
    expect(bad.status).toBe(422)
    const first = (bad.json as { detail: Array<Record<string, unknown>> }).detail[0] as Record<string, unknown>
    expect(first.type).toBe('uuid_parsing')
    expect(first.loc).toEqual(['path', 'profile_id'])
  })
})

describe('清單', () => {
  it('[FE-O03-S15] 分頁：20 筆、0-based、尾頁後是空陣列、負數當 0、沒有 total', async () => {
    const c = new ContractClient(baseUrl())
    await c.login('翻頁的人')
    const n = (await sql<{ n: number }>('select count(*)::int as n from profiles'))[0]?.n ?? 0
    const pages = Math.ceil(n / 20)
    const p0 = await c.raw('GET', '/api/profiles?page=0')
    expect(p0.status).toBe(200)
    expect(Array.isArray(p0.json)).toBe(true)
    expect((p0.json as unknown[]).length).toBe(Math.min(20, n))
    for (const item of p0.json as unknown[]) ProfileOut.parse(item)
    expect(p0.headers.get('x-total-count')).toBeNull()
    const last = await c.raw('GET', `/api/profiles?page=${pages - 1}`)
    expect((last.json as unknown[]).length).toBe(n - (pages - 1) * 20)
    const beyond = await c.raw('GET', `/api/profiles?page=${pages}`)
    expect(beyond.status).toBe(200)
    expect(beyond.json).toEqual([])
    const negative = await c.raw('GET', '/api/profiles?page=-1')
    expect(negative.json).toEqual(p0.json)
    // 排序：updated_at 新到舊。
    const ts = (p0.json as Array<{ updated_at: string }>).map((x) => x.updated_at)
    expect([...ts].sort().reverse()).toEqual(ts)
    // 時間字串：6 位微秒 + Z（Pydantic 微秒為 0 時省略小數，所以 `(\.\d{6})?`；1～5 位就是格式退化）。
    for (const t of ts) expect(t).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{6})?Z$/)
  })

  it('[FE-O05-S10][FE-O03-S15] page=abc、page=1.5 是 422（不是當成 0），loc 是 query.page', async () => {
    const c = new ContractClient(baseUrl())
    await c.login('打錯頁碼的人')
    for (const [name, q] of [
      ['profiles page=abc', 'abc'],
      ['profiles page=1.5', '1.5'],
    ] as const) {
      const r = await c.raw('GET', `/api/profiles?page=${q}`)
      const g = golden.cases[name] as { status: number; type: string; loc?: unknown[] }
      expect(r.status, name).toBe(g.status)
      const first = (r.json as { detail: Array<Record<string, unknown>> }).detail[0] as Record<string, unknown>
      expect(ValidationError.safeParse(first).success, JSON.stringify(first)).toBe(true)
      expect(first.type, name).toBe(g.type)
      expect(first.loc, name).toEqual(g.loc)
    }
  })

  it('[FE-O03-S16] 案件：預設 recruiting、過期不出現、status 不合法 422', async () => {
    const c = new ContractClient(baseUrl())
    const me = ProfileOut.parse(await c.login('發過期案的人'))
    const expiredId = '33333333-0000-4000-8000-00000000e001'
    await sql(
      "insert into projects (id, owner_id, title, body, status, expires_at) values ($1, $2, '已經過期的案', '不該出現', 'recruiting', now() - interval '1 day') on conflict (id) do nothing",
      [expiredId, me.id],
    )
    const recruiting = await c.raw('GET', '/api/projects')
    expect(recruiting.status).toBe(200)
    const items = recruiting.json as Array<{ id: string; status: string }>
    for (const item of items) {
      const parsed = ProjectOut.parse(item)
      for (const t of [parsed.expires_at, parsed.updated_at]) expect(t).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{6})?Z$/)
    }
    expect(items.every((x) => x.status === 'recruiting')).toBe(true)
    expect(items.some((x) => x.id === expiredId), '過期的案出現在清單裡').toBe(false)
    const active = await c.raw('GET', '/api/projects?status=active')
    expect((active.json as Array<{ status: string }>).every((x) => x.status === 'active')).toBe(true)
    expect((active.json as unknown[]).length).toBeGreaterThan(0)
    const bogus = await c.raw('GET', '/api/projects?status=bogus')
    const g = golden.cases['projects status=bogus'] as { status: number; type: string; loc?: unknown[] }
    expect(bogus.status).toBe(g.status)
    const first = (bogus.json as { detail: Array<Record<string, unknown>> }).detail[0] as Record<string, unknown>
    expect(first.type).toBe(g.type)
    expect(first.loc).toEqual(g.loc)
  })

  it('[FE-O03-S17] 走廊的門：seed 的兩間 active 專案；沒有人在房間裡 → online_count 全是 0（替身不在也 200、1 秒內）', async () => {
    const c = new ContractClient(baseUrl())
    await c.login('看走廊的人')
    const started = Date.now()
    const r = await c.raw('GET', '/api/rooms')
    expect(Date.now() - started).toBeLessThan(1_000)
    expect(r.status).toBe(200)
    const rooms = r.json as unknown[]
    for (const room of rooms) RoomDoorOut.parse(room)
    const ids = (rooms as Array<{ project_id: string }>).map((x) => x.project_id)
    expect(ids).toContain('22222222-0000-4000-8000-0000000000f1')
    expect(ids).toContain('22222222-0000-4000-8000-0000000000f2')
    // 這一片替身還沒起（harness 沒起它）、真後端那邊也沒有人進房：每一間都要是 0 —— 寫死 7 或沒問替身都紅。
    for (const room of rooms as Array<{ online_count: number }>) expect(room.online_count).toBe(0)
  })
})
