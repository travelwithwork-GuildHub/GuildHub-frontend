import { describe, expect, it } from 'vitest'
import { ProfileOut, ProjectOut } from '@/api/contract/rest'
import { ValidationError } from '@/api/contract/errors'
import { ContractClient, baseUrl } from '../client'

// 規格：openspec/changes/fe-j01-create-project/specs/internal-backend/spec.md
//   Requirement: 建案：形狀、預設值與到期日照真後端 —— S09、S10
//
// 同一組對 internal 與 guildhub 各跑一次；這個檔案不知道自己在打誰。
// **長度與範圍刻意不在這裡**：真後端對這個端點什麼都不驗（`FE-O08` 演練帳的 anomaly），契約守的是承諾、不是已知缺陷。

const KEYS = ['id', 'owner_id', 'title', 'body', 'needed_skills', 'status', 'room_template', 'seat_count', 'expires_at', 'updated_at'] as const
const DAY = 24 * 60 * 60 * 1_000
const post = (c: ContractClient, body: unknown) => c.raw('POST', '/api/projects', { body })

describe('建案', () => {
  it('[FE-J01-S09] 201、恰好十個鍵、owner 是我、預設值、7 天後到期、列表第 0 頁第一筆是它', async () => {
    const c = new ContractClient(baseUrl())
    const me = ProfileOut.parse(await c.login('發案的人'))

    const before = Date.now()
    const r = await post(c, { title: '契約建案', body: '內容', needed_skills: ['a'], seat_count: 2 })
    const after = Date.now()
    expect(r.status, r.text.slice(0, 200)).toBe(201)
    expect(r.contentType).toMatch(/application\/json/)
    // 鍵集合用**原始 JSON** 比：Zod 的 `.parse` 會把多出來的鍵靜默丟掉，`password_hash` 漏出去它看不見。
    expect(Object.keys(r.json as object).sort()).toEqual([...KEYS].sort())
    const created = ProjectOut.parse(r.json)
    expect(created.owner_id).toBe(me.id)
    expect(created.status).toBe('recruiting')
    expect(created.room_template).toBeNull()
    expect(created.seat_count).toBe(2)
    expect(created.needed_skills).toEqual(['a'])
    expect(created.title).toBe('契約建案')
    expect(created.body).toBe('內容')
    const expires = Date.parse(created.expires_at)
    expect(Number.isNaN(expires)).toBe(false)
    expect(expires, 'expires_at 要是建立時刻 ＋7 天（±5 分）').toBeGreaterThan(before + 7 * DAY - 5 * 60_000)
    expect(expires).toBeLessThan(after + 7 * DAY + 5 * 60_000)
    expect(Number.isNaN(Date.parse(created.updated_at))).toBe(false)

    const d = await post(c, { title: '預設值', body: '內容' })
    expect(d.status, d.text.slice(0, 200)).toBe(201)
    const defaults = ProjectOut.parse(d.json)
    expect(defaults.needed_skills).toEqual([])
    expect(defaults.seat_count).toBe(4)

    const list = await c.raw('GET', '/api/projects?page=0')
    expect(list.status).toBe(200)
    expect((list.json as Array<{ id: string }>)[0]?.id, '剛建的要在第 0 頁第一筆').toBe(defaults.id)
  })

  it('[FE-J01-S10] 型別錯是 422（loc 以 body 開頭）；未登入 401 且沒建任何一筆', async () => {
    const c = new ContractClient(baseUrl())
    await c.login('送錯型別的人')
    for (const body of [{ title: 1, body: 'x' }, { title: 'x', body: 'y', seat_count: 'four' }, { body: '沒有標題' }]) {
      const r = await post(c, body)
      expect(r.status, JSON.stringify(body)).toBe(422)
      const detail = (r.json as { detail: unknown }).detail
      expect(Array.isArray(detail), JSON.stringify(body)).toBe(true)
      expect((detail as unknown[]).length).toBeGreaterThan(0)
      for (const item of detail as unknown[]) expect(ValidationError.parse(item).loc[0]).toBe('body')
    }

    const seen = await c.raw('GET', '/api/projects?page=0')
    const anon = new ContractClient(baseUrl())
    const r = await post(anon, { title: '沒登入', body: '不該建' })
    expect(r.status).toBe(401)
    expect(r.json).toEqual({ detail: '未登入' })
    const again = await c.raw('GET', '/api/projects?page=0')
    expect(again.json, '未登入卻建了一筆').toEqual(seen.json)
  })
})
