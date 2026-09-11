import { describe, expect, it } from 'vitest'
import { ContractClient, baseUrl, onlineUrl, roomToken, wsUrl } from '../client'
import { connect, expectRefused } from './socket'

// 規格：openspec/changes/fe-o03-internal-backend/specs/internal-backend/spec.md
//   Requirement: 人才與案件清單 —— S22（rooms 的 online_count 來自替身）
//   Requirement: 即時層替身 —— S23（/online 數的是活著的連線）
//
// 這兩條需要「能算出房間 token」與「/online 查詢口」—— 真後端的 token 由 `enter` 簽發（W4）、也沒有 /online，
// 所以這個目標沒有這兩個能力時 skip（能力是 harness 提供的，這裡仍不知道目標叫什麼）。

// 兩條的能力不同：S22 要 token 也要 /online（rooms 端點靠它），S23 只要 /online（審查抓到粒度）。
describe.skipIf(roomToken() === null || onlineUrl() === null)('房間人數', () => {
  it('[FE-O03-S22] 兩條連線進房 → rooms 顯示 2；一條斷線 → 1', async () => {
    const room = roomToken() as { scene: string; token: string; malformed: { scene: string; token: string } }
    const c = new ContractClient(baseUrl())
    await c.login('看門的人')
    const projectId = room.scene.slice('room:'.length)
    const countOf = async () => {
      const r = await c.raw('GET', '/api/rooms')
      const rooms = r.json as Array<{ project_id: string; online_count: number }>
      return rooms.find((x) => x.project_id === projectId)?.online_count
    }
    expect(await countOf()).toBe(0)
    const a = await connect(`${wsUrl()}?scene=${room.scene}&token=${room.token}`)
    const b = await connect(`${wsUrl()}?scene=${room.scene}&token=${room.token}`)
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

  it('[FE-O03-S21] room 的 uuid 不合法：就算 token 算對也拒絕握手（擋的是格式，不只是 token）', async () => {
    const { malformed } = roomToken() as { malformed: { scene: string; token: string } }
    const r = await expectRefused(`${wsUrl()}?scene=${malformed.scene}&token=${malformed.token}`)
    expect(r.opened, 'uuid 不合法的 room 竟然連上了').toBe(false)
    expect(r.messages).toBe(0)
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
