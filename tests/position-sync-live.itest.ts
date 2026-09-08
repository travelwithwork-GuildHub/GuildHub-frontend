import { describe, expect, it } from 'vitest'
import { RealtimeClient } from '@/realtime/client'
import { createMessageValidator } from '@/realtime/protocol'
import { applyMessage, createRemotePlayersState } from '@/realtime/remotePlayers'
import { createSyncState, markSent, planSend, SEND_INTERVAL_MS } from '@/realtime/positionSync'

// 規格 FE-R03 的 tasks 第 4 節。**不進 CI**（要一份跑著的後端）。
//
//     cd ~/Desktop/workshop/fergus/GuildHub-backend && bash run.sh
//     npm run test:integration
//
// 驗的是**單元測試證明不了的那一半**：節流與去重算出來的東西，
// 送到真後端之後，另一個連線真的看得到。

const settle = (ms = 600) => new Promise((r) => setTimeout(r, ms))

/**
 * 某個人**最新收到的那一筆樣本**（不是畫面位置）。
 *
 * `FE-R08` 之後 `motion` 存的是一段樣本歷史，畫面位置要經過
 * 250 毫秒的 render delay 才會走到。這幾條測試驗的是**協定有沒有收到**，
 * 所以直接看最後一筆。
 */
function latest(state: ReturnType<typeof createRemotePlayersState>, id: string) {
  const samples = state.motion.get(id)?.samples
  if (samples === undefined || samples.length === 0) return undefined
  const { x, z, f } = samples[samples.length - 1]!
  return { x, z, f }
}

function observer() {
  const state = createRemotePlayersState()
  const validate = createMessageValidator(() => {})
  const client: RealtimeClient = new RealtimeClient({
    onMessage: (raw) => {
      const result = validate(raw)
      if (result.ok) applyMessage(state, result.message, client.selfId, performance.now())
    },
  })
  return { client, state }
}

async function ready(client: RealtimeClient) {
  client.connect()
  for (let i = 0; i < 50 && client.state !== 'ready'; i++) await settle(100)
  expect(client.state, '連不上後端。先在 GuildHub-backend 跑 `bash run.sh`').toBe('ready')
}

describe('位置同步對真後端（不進 CI）', () => {
  it('B 用同步邏輯送位置，A 看得到；靜止時 0 則、移動時不超過 10 Hz', async () => {
    const a = observer()
    const b = observer()
    await ready(a.client)
    await ready(b.client)
    await settle()

    const bId = b.client.selfId!
    expect(a.state.roster.has(bId), 'A 應該看得到 B').toBe(true)

    // ── 靜止 1 秒：一則都不該送 ──
    const sync = createSyncState()
    let sent = 0
    const still = { x: 2, z: 3 }
    for (let i = 0; i < 60; i++) {
      const point = planSend(sync, still, 1000 / 60)
      if (point !== null) {
        b.client.send(JSON.stringify({ t: 'move', x: point.x, y: point.y, f: 0 }))
        markSent(sync, point)
        sent++
      }
    }
    await settle()
    expect(sent, '第一個位置送一次之後就該停').toBe(1)
    // ⚠️ **這裡問的是「樣本收到了沒有」，不是「畫面上在哪裡」。**
    // 畫面位置有 250 毫秒的 render delay（`FE-R08`），拿它來斷言
    // 「收到了」的話，這條測試會變成在驗插值的時間，而不是驗協定。
    expect(latest(a.state, bId), 'A 應該收到 B 的第一個位置').toEqual({ x: 2, z: 3, f: 0 })

    // ── 移動 1 秒：不超過 10 Hz ──
    sent = 0
    for (let i = 1; i <= 60; i++) {
      const point = planSend(sync, { x: 2 + i / 32, z: 3 }, 1000 / 60)
      if (point !== null) {
        b.client.send(JSON.stringify({ t: 'move', x: point.x, y: point.y, f: 2 }))
        markSent(sync, point)
        sent++
      }
    }
    await settle()

    expect(sent, `1 秒內送了 ${sent} 則，超過後端的 ${1000 / SEND_INTERVAL_MS} Hz`).toBeLessThanOrEqual(10)
    expect(sent, '一直在動卻幾乎不送').toBeGreaterThan(5)

    const seen = latest(a.state, bId)!
    expect(seen.f, 'A 應該看到 B 的新朝向').toBe(2)
    expect(seen.x, 'A 看到的 x 應該跟著往前').toBeGreaterThan(2)

    a.client.close()
    b.client.close()
  }, 40_000)
})
