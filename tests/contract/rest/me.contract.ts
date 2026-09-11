import pg from 'pg'
import { describe, expect, it } from 'vitest'
import { ProfileOut } from '@/api/contract/rest'
import { ContractClient, baseUrl, databaseUrl } from '../client'

// 規格：openspec/changes/fe-o03-internal-backend/specs/internal-backend/spec.md
//   Requirement: 每個 handler 走同一條管線，錯誤形狀複製真後端 —— S02（超長 500 text/plain、拒絕後不部分寫入）
//   Requirement: session 是簽章的 HttpOnly cookie —— S08（名片沒了 → 401）
//   Requirement: 我的名片：讀與部分更新 —— S13、S14

const CJK = (n: number) => '字'.repeat(n)

describe('PATCH /api/profiles/me', () => {
  it('[FE-O03-S13] 只改給的欄位；updated_at 變新', async () => {
    const c = new ContractClient(baseUrl())
    const before = ProfileOut.parse(await c.login('改自介的人'))
    const r = await c.raw('PATCH', '/api/profiles/me', { body: { bio: '新自介' } })
    expect(r.status).toBe(200)
    const after = ProfileOut.parse(r.json)
    expect(after.bio).toBe('新自介')
    expect(after.display_name).toBe(before.display_name)
    expect(after.skills).toEqual(before.skills)
    expect(after.hours_per_week).toBe(before.hours_per_week)
    expect(after.updated_at > before.updated_at, `${after.updated_at} 沒有比 ${before.updated_at} 新`).toBe(true)
    // 時間字串的形狀跟真後端一樣：6 位微秒 + Z（golden）。
    expect(after.updated_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{6})?Z$/)
  })

  it('[FE-O03-S14] 未知欄位靜默忽略；空 body 不更新', async () => {
    const c = new ContractClient(baseUrl())
    await c.login('被忽略的人')
    const first = await c.raw('PATCH', '/api/profiles/me', { body: { bio: 'x', nickname: 'y' } })
    expect(first.status).toBe(200)
    const a = ProfileOut.parse(first.json)
    expect(a.bio).toBe('x')
    expect(first.json).not.toHaveProperty('nickname')
    const second = await c.raw('PATCH', '/api/profiles/me', { body: {} })
    expect(second.status).toBe(200)
    expect(ProfileOut.parse(second.json).updated_at).toBe(a.updated_at)
  })

  it('[FE-O03-S02] bio 301 字：500 text/plain；之後 GET /api/me 的 bio 是改之前的', async () => {
    const c = new ContractClient(baseUrl())
    await c.login('太長的人')
    await c.raw('PATCH', '/api/profiles/me', { body: { bio: '原本的' } })
    const r = await c.raw('PATCH', '/api/profiles/me', { body: { bio: CJK(301) } })
    expect(r.status).toBe(500)
    expect(r.contentType).toMatch(/^text\/plain/)
    expect(r.text).toBe('Internal Server Error')
    const me = await c.raw('GET', '/api/me')
    expect(ProfileOut.parse(me.json).bio, '拒絕之後有部分寫入').toBe('原本的')
    // 對照：300 字是接受的（不然這條只證明「什麼都 500」）。
    const ok = await c.raw('PATCH', '/api/profiles/me', { body: { bio: CJK(300) } })
    expect(ok.status).toBe(200)
  })
})

describe('session 指向已不存在的名片', () => {
  it('[FE-O03-S08] 名片被刪了（資料庫重建過）→ 401', async () => {
    const c = new ContractClient(baseUrl())
    const me = ProfileOut.parse(await c.login('要被刪的人'))
    expect((await c.raw('GET', '/api/me')).status).toBe(200)
    const client = new pg.Client({ connectionString: databaseUrl() })
    await client.connect()
    try {
      await client.query('delete from profiles where id = $1', [me.id])
    } finally {
      await client.end()
    }
    const after = await c.raw('GET', '/api/me')
    expect(after.status).toBe(401)
    expect(after.json).toEqual({ detail: '未登入' })
  })
})
