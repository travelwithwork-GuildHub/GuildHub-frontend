import pg from 'pg'
import { describe, expect, it } from 'vitest'
import { ProfileOut, ProjectOut, RoomDoorOut } from '@/api/contract/rest'
import { ValidationError } from '@/api/contract/errors'
import { ContractClient, baseUrl, databaseUrl } from '../client'

// 規格：openspec/changes/fe-j04-form-team/specs/internal-backend/spec.md
//   Requirement: 成軍與結案：替身照真後端 —— S12（form-team）、S13（close）
//
// 同一組對 internal 與 guildhub 各跑一次；這個檔案不知道自己在打誰。專案是自己建的（`POST /api/projects`），不動 seed。
// 座位被清掉用 SQL 對同一個可拋棄庫驗（兩個目標都有 `databaseUrl()`）。
// `closed` 再 form-team **刻意不測**：那是 `FE-O08` 的 anomaly（真後端會復活），契約不釘它。

const KEYS = ['id', 'owner_id', 'title', 'body', 'needed_skills', 'status', 'room_template', 'seat_count', 'expires_at', 'updated_at'] as const
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
const formTeam = (c: ContractClient, id: string, body: unknown) => c.raw('POST', `/api/projects/${id}/form-team`, { body })
const close = (c: ContractClient, id: string) => c.raw('POST', `/api/projects/${id}/close`)
const enter = (c: ContractClient, id: string, password: string) => c.raw('POST', `/api/projects/${id}/enter`, { body: { password } })
async function create(c: ContractClient, title: string): Promise<ProjectOut> {
  const r = await c.raw('POST', '/api/projects', { body: { title, body: '契約測試用', needed_skills: [], seat_count: 4 } })
  expect(r.status, r.text.slice(0, 200)).toBe(201)
  return ProjectOut.parse(r.json)
}
async function doorIds(c: ContractClient): Promise<string[]> {
  const r = await c.raw('GET', '/api/rooms')
  expect(r.status).toBe(200)
  return (r.json as unknown[]).map((d) => RoomDoorOut.parse(d).project_id)
}

describe('POST /api/projects/{project_id}/form-team', () => {
  it('[FE-J04-S12] owner 200 變 active（十鍵、room_template 整數）、rooms 含、enter 對／錯；再成軍換密碼；非 owner 403；401；404；422', async () => {
    const owner = new ContractClient(baseUrl())
    await owner.login('成軍的發起人')
    const other = new ContractClient(baseUrl())
    await other.login('別人')
    const p = await create(owner, '成軍契約測試')

    const r = await formTeam(owner, p.id, { password: 'guild1234' })
    expect(r.status, r.text.slice(0, 200)).toBe(200)
    expect(Object.keys(r.json as object).sort()).toEqual([...KEYS].sort())
    const formed = ProjectOut.parse(r.json)
    expect(formed.status).toBe('active')
    expect(Number.isInteger(formed.room_template)).toBe(true)
    expect(await doorIds(other)).toContain(p.id)
    expect((await enter(other, p.id, 'guild1234')).status, '對的密碼要能進').toBe(200)
    expect((await enter(other, p.id, 'wrong')).status).toBe(403)

    // 再成軍：換密碼（真後端 parity —— 舊密碼立即失效）
    const again = await formTeam(owner, p.id, { password: 'second-pw' })
    expect(again.status).toBe(200)
    expect(ProjectOut.parse(again.json).status).toBe('active')
    expect((await enter(other, p.id, 'second-pw')).status).toBe(200)
    expect((await enter(other, p.id, 'guild1234')).status, '舊密碼還能進').toBe(403)

    const forbidden = await formTeam(other, p.id, { password: 'hijack' })
    expect(forbidden.status).toBe(403)
    expect((forbidden.json as { detail: string }).detail).toBe('只有發起人可以做這件事')
    expect((await enter(other, p.id, 'second-pw')).status, '非 owner 的 form-team 改了密碼').toBe(200)

    const anon = new ContractClient(baseUrl())
    const unauth = await formTeam(anon, p.id, { password: 'x' })
    expect(unauth.status).toBe(401)
    expect(unauth.json).toEqual({ detail: '未登入' })
    const missing = await formTeam(owner, ZERO, { password: 'x' })
    expect(missing.status).toBe(404)
    expect(missing.json).toEqual({ detail: '專案不存在' })
    const bad = await formTeam(owner, p.id, { password: 123 })
    expect(bad.status).toBe(422)
    const detail = (bad.json as { detail: unknown }).detail
    expect(Array.isArray(detail)).toBe(true)
    for (const item of detail as unknown[]) expect(ValidationError.parse(item).loc[0]).toBe('body')
  })
})

describe('POST /api/projects/{project_id}/close', () => {
  it('[FE-J04-S13] owner 200 變 closed、座位清掉、rooms 不含、重複 200；非 owner 403；401；404', async () => {
    const owner = new ContractClient(baseUrl())
    const me = ProfileOut.parse(await owner.login('結案的發起人'))
    const other = new ContractClient(baseUrl())
    const someone = ProfileOut.parse(await other.login('坐位的人'))
    const p = await create(owner, '結案契約測試')
    expect((await formTeam(owner, p.id, { password: 'guild1234' })).status).toBe(200)
    // 兩個座位（SQL 塞的；座位端點是 FE-J13 的事）
    await sql('insert into seats (project_id, seat_index, user_id, desk_template) values ($1, 0, $2, 0), ($1, 1, $3, 0)', [p.id, me.id, someone.id])
    expect(await sql('select 1 from seats where project_id = $1', [p.id])).toHaveLength(2)

    const r = await close(owner, p.id)
    expect(r.status, r.text.slice(0, 200)).toBe(200)
    expect(Object.keys(r.json as object).sort()).toEqual([...KEYS].sort())
    expect(ProjectOut.parse(r.json).status).toBe('closed')
    expect(await sql('select 1 from seats where project_id = $1', [p.id]), '座位沒有整批清掉').toEqual([])
    expect(await doorIds(other)).not.toContain(p.id)

    const again = await close(owner, p.id)
    expect(again.status, '重複 close 要冪等').toBe(200)
    expect(ProjectOut.parse(again.json).status).toBe('closed')

    const q = await create(owner, '別人不能結案的')
    expect((await formTeam(owner, q.id, { password: 'guild1234' })).status).toBe(200)
    const forbidden = await close(other, q.id)
    expect(forbidden.status).toBe(403)
    expect((forbidden.json as { detail: string }).detail).toBe('只有發起人可以做這件事')
    expect(await doorIds(other), '非 owner 的 close 生效了').toContain(q.id)

    const anon = new ContractClient(baseUrl())
    const unauth = await close(anon, q.id)
    expect(unauth.status).toBe(401)
    expect(unauth.json).toEqual({ detail: '未登入' })
    const missing = await close(owner, ZERO)
    expect(missing.status).toBe(404)
    expect(missing.json).toEqual({ detail: '專案不存在' })
  })
})
