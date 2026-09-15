import { describe, expect, it } from 'vitest'
import { EnterOut } from '@/api/contract/rest'
import { ContractClient, baseUrl, onlineUrl, wsUrl } from '../client'
import { connect, expectRefused } from './socket'

// 規格：openspec/changes/fe-o03-internal-backend/specs/internal-backend/spec.md
//   Requirement: 人才與案件清單 —— S22（rooms 的 online_count 來自替身）
//   Requirement: 即時層替身 —— S23（/online 數的是活著的連線）
//   （S21 的三種拒絕在 `lobby.contract.ts`；以前這裡多一條「uuid 不合法但票算對」—— 票的格式現在是簽發者的事（ADR 0008），測試不再自己算票，那條拿掉。）
//
// 房間的票由 `POST /api/projects/{id}/enter` 簽（`FE-N08`，兩個目標都有）、綁人：連線要帶同一個 session cookie。
// 票的格式是簽發者 process 內的事（ADR 0008）—— 這裡**不自己算票**，只拿 `enter` 給的。
// S22 另外要「/online 查詢口」—— 真後端沒有，所以那個目標 skip（能力是 harness 提供的，這裡仍不知道目標叫什麼）。

/** seed 第一間 active 專案（`db/schema/002_seed.sql`；密碼 guild1234）。 */
const SEED_ROOM = '22222222-0000-4000-8000-0000000000f1'

async function ticketFor(c: ContractClient, projectId: string): Promise<string> {
  const r = await c.raw('POST', `/api/projects/${projectId}/enter`, { body: { password: 'guild1234' } })
  if (r.status !== 200) throw new Error(`enter 失敗：${r.status} ${r.text.slice(0, 200)}`)
  return EnterOut.parse(r.json).room_token
}
const cookieHeader = (c: ContractClient) => [...c.cookies()].map(([k, v]) => `${k}=${v}`).join('; ')

describe.skipIf(onlineUrl() === null)('房間人數', () => {
  it('[FE-O03-S22] 兩條連線進房 → rooms 顯示 2；一條斷線 → 1', async () => {
    const c = new ContractClient(baseUrl())
    await c.login('看門的人')
    const projectId = SEED_ROOM
    const countOf = async () => {
      const r = await c.raw('GET', '/api/rooms')
      const rooms = r.json as Array<{ project_id: string; online_count: number }>
      return rooms.find((x) => x.project_id === projectId)?.online_count
    }
    expect(await countOf()).toBe(0)
    const token = await ticketFor(c, projectId)
    const url = `${wsUrl()}?scene=room:${projectId}&token=${encodeURIComponent(token)}`
    const a = await connect(url, { cookie: cookieHeader(c) })
    const b = await connect(url, { cookie: cookieHeader(c) })
    try {
      await a.waitFor((m) => m.t === 'snapshot', 3_000)
      await b.waitFor((m) => m.t === 'snapshot', 3_000)
      expect(await countOf()).toBe(2)
      await a.close()
      await new Promise((r) => setTimeout(r, 100))
      expect(await countOf()).toBe(1)
    } finally {
      await a.close()
      await b.close()
    }
  })
})

describe.skipIf(onlineUrl() === null)('/online', () => {
  it('[FE-O03-S23] /online 數的是活著的連線（相對變化：別的連線在也沒關係）', async () => {
    const url = onlineUrl() as string
    const count = async (scene: string) => ((await (await fetch(`${url}?scene=${encodeURIComponent(scene)}`)).json()) as { count: number }).count
    const base = await count('lobby')
    const a = await connect(`${wsUrl()}?scene=lobby`)
    const b = await connect(`${wsUrl()}?scene=lobby`)
    try {
      await a.waitFor((m) => m.t === 'snapshot', 3_000)
      await b.waitFor((m) => m.t === 'snapshot', 3_000)
      expect(await count('lobby')).toBe(base + 2)
      await a.close()
      await new Promise((r) => setTimeout(r, 100))
      expect(await count('lobby')).toBe(base + 1)
      expect(await count('room:00000000-0000-4000-8000-000000000000')).toBe(0)
    } finally {
      await a.close()
      await b.close()
    }
  })
})
