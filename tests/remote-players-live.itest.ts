import { describe, expect, it } from 'vitest'
import { RealtimeClient } from '@/realtime/client'
import { createMessageValidator } from '@/realtime/protocol'
import { applyMessage, createRemotePlayersState } from '@/realtime/remotePlayers'
import { toProtocol } from '@/world/coords'

// 規格 FE-R07 的人工驗證那幾條，改成對**真的後端**跑。**不進 CI。**
//
//     cd ~/Desktop/workshop/fergus/GuildHub-backend && bash run.sh
//     npm run test:integration
//
// **這一組驗的是資料路徑端到端真的通了** —— 兩個獨立的連線，
// 一邊看得到另一邊，而且對方移動時位置真的更新。
//
// ⚠️ **它驗不到「畫面上真的畫出來」。** 那需要瀏覽器（這台機器的
// 瀏覽器自動化起不來，Chrome 兩次都 SIGTRAP）。渲染那一半由
// `tests/remote-players-render.test.tsx` 用 R3F 的 test renderer 驗。
// 兩者合起來涵蓋整條路徑，但**中間那一段接縫沒有機器在看**。

/** 一個連上、收訊息、維護遠端玩家狀態的完整客戶端。 */
function observer() {
  const state = createRemotePlayersState()
  const violations: string[] = []
  const validate = createMessageValidator((v) => violations.push(v))
  const client: RealtimeClient = new RealtimeClient({
    onMessage: (raw) => {
      const result = validate(raw)
      if (result.ok) applyMessage(state, result.message, client.selfId, performance.now())
    },
  })
  return { client, state, violations }
}

const settle = (ms = 600) => new Promise((r) => setTimeout(r, ms))

async function ready(o: ReturnType<typeof observer>) {
  o.client.connect()
  for (let i = 0; i < 50 && o.client.state !== 'ready'; i++) await settle(100)
  expect(o.client.state, `連不上後端。先在 GuildHub-backend 跑 \`bash run.sh\``).toBe('ready')
}

describe('兩個連線互相看得到（不進 CI）', () => {
  it('A 看得到 B，而且 B 移動時 A 的位置跟著更新', async () => {
    const a = observer()
    const b = observer()
    await ready(a)
    await ready(b)
    await settle()

    // A 的名單裡應該有 B，而且**沒有自己**
    expect(a.state.roster.has(b.client.selfId!), 'A 應該看得到 B').toBe(true)
    expect(a.state.roster.has(a.client.selfId!), 'A 的遠端名單不該有自己').toBe(false)
    expect(b.state.roster.has(a.client.selfId!), 'B 也應該看得到 A').toBe(true)

    // B 移動。座標用 world-coordinates 換算 —— **不在測試裡重寫那個對映**。
    const target = toProtocol({ x: 4, z: 3 })
    b.client.send(JSON.stringify({ t: 'move', x: target.x, y: target.y, f: 2 }))
    await settle()

    const seen = a.state.motion.get(b.client.selfId!)
    expect(seen, 'A 應該有 B 的動態資料').toBeDefined()
    expect(seen, 'B 移動之後，A 這邊的世界座標應該跟著更新').toEqual({ x: 4, z: 3, f: 2 })

    // 沒有任何協定違規 —— 有的話代表我們的 schema 跟後端對不上
    expect(a.violations, `A 收到不合協定的訊息：${a.violations.join(', ')}`).toEqual([])
    expect(b.violations).toEqual([])

    a.client.close()
    b.client.close()
  }, 40_000)

  it('B 離開之後，A 的名單與動態兩邊都清掉了', async () => {
    const a = observer()
    const b = observer()
    await ready(a)
    await ready(b)
    await settle()

    const bId = b.client.selfId!
    expect(a.state.roster.has(bId)).toBe(true)

    b.client.close()
    await settle(1_500)

    expect(a.state.roster.has(bId), 'B 離開之後 A 的名單應該少一個人').toBe(false)
    expect(a.state.motion.has(bId), '動態那一份也要清掉').toBe(false)

    a.client.close()
  }, 40_000)
})
