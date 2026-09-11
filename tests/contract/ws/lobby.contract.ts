import { describe, expect, it } from 'vitest'
import { wsUrl } from '../client'
import { connect, expectRefused } from './socket'

// 規格：openspec/changes/fe-o03-internal-backend/specs/internal-backend/spec.md
//   Requirement: 即時層替身照 protocol.py，怪癖一併複製 —— S18、S19、S20、S21
// 規格：openspec/changes/fe-o05-contract-tests/specs/contract-tests/spec.md
//   Requirement: WS 契約對兩邊各跑一次 —— S13、S14
//
// 同一組對替身（internal）與真後端（guildhub）各跑一次。所有收到的訊息都先過 `ServerMessage` 的 schema。

const lobby = () => `${wsUrl()}?scene=lobby`

describe('lobby', () => {
  it('[FE-O03-S18][FE-O05-S13] 握手：hello（hz 10）、snapshot；靜止 500 ms 內沒有第三則', async () => {
    const s = await connect(lobby())
    try {
      await s.waitFor((m) => m.t === 'snapshot', 3_000)
      await s.settle(500)
      expect(s.received.map((m) => m.t)).toEqual(['hello', 'snapshot'])
      const hello = s.received[0] as Extract<(typeof s.received)[number], { t: 'hello' }>
      const snapshot = s.received[1] as Extract<(typeof s.received)[number], { t: 'snapshot' }>
      expect(hello.hz).toBe(10)
      // snapshot 含自己（進場時已登記）。
      expect(snapshot.players.map((p) => p.id)).toContain(hello.you)
    } finally {
      await s.close()
    }
  })

  it('[FE-O03-S19] 自己的 move 會廣播回自己', async () => {
    const s = await connect(lobby())
    try {
      const hello = await s.waitFor((m) => m.t === 'hello', 3_000)
      await s.waitFor((m) => m.t === 'snapshot', 3_000)
      const me = hello.t === 'hello' ? hello.you : ''
      s.send({ t: 'move', x: 120, y: 340, f: 2 })
      // 等的是**含自己**的那一則 pos —— 只等「任何 pos」會拿到別人的（審查抓到的 waitFor 陷阱）。
      const pos = await s.waitFor((m) => m.t === 'pos' && m.p.some(([id]) => id === me), 1_000)
      expect(pos.t === 'pos' && pos.p.some(([id, x, y, f]) => id === me && x === 120 && y === 340 && f === 2), JSON.stringify(pos)).toBe(true)
    } finally {
      await s.close()
    }
  })

  it('[FE-O03-S20][FE-O05-S14] 不合協定的訊息靜默丟棄：沒有 err、連線還在，之後合法的 status 正常廣播', async () => {
    const s = await connect(lobby())
    try {
      const hello = await s.waitFor((m) => m.t === 'hello', 3_000)
      await s.waitFor((m) => m.t === 'snapshot', 3_000)
      const before = s.received.length
      s.send({ t: 'teleport' })
      s.send({ t: 'move', x: 1.5, y: 2, f: 0 })
      s.send({ t: 'status', text: '字'.repeat(13) })
      s.send({ t: 'status', text: '😀'.repeat(13) })
      s.sendRaw('not json')
      await s.settle(500)
      // **一則都不能有**：不只是沒有 err —— 錯把 1.5 的 move 收下會多一則 pos（審查抓到的）。
      expect(s.received.slice(before), '不合法的訊息之後收到了東西').toEqual([])
      expect(s.ws.readyState, '連線被關了').toBe(s.ws.OPEN)
      const me = hello.t === 'hello' ? hello.you : ''
      // 12 個 astral（emoji）要接受：單位是 code point，不是 UTF-16 code unit（`'😀'.repeat(12).length` 是 24）。
      s.send({ t: 'status', text: '😀'.repeat(12) })
      const emoji = await s.waitFor((m) => m.t === 'status' && m.id === me, 1_000)
      expect(emoji.t === 'status' && emoji.text).toBe('😀'.repeat(12))
      s.send({ t: 'status', text: '正常的狀態' })
      const status = await s.waitFor((m) => m.t === 'status' && m.id === me && m.text === '正常的狀態', 1_000)
      expect(status.t === 'status' && status.text).toBe('正常的狀態')
    } finally {
      await s.close()
    }
  })

  it('別人進出送 presence：B 進來 A 收到 join；B 離開 A 收到 leave（順序：先廣播 join 再登記，snapshot 含自己）', async () => {
    const a = await connect(lobby())
    try {
      await a.waitFor((m) => m.t === 'snapshot', 3_000)
      const b = await connect(lobby())
      const helloB = await b.waitFor((m) => m.t === 'hello', 3_000)
      const idB = helloB.t === 'hello' ? helloB.you : ''
      const snapshotB = await b.waitFor((m) => m.t === 'snapshot', 3_000)
      expect(snapshotB.t === 'snapshot' && snapshotB.players.map((p) => p.id)).toContain(idB)
      const join = await a.waitFor((m) => m.t === 'presence' && m.join.some((p) => p.id === idB), 1_000)
      expect(join.t === 'presence' && join.leave).toEqual([])
      await b.close()
      const leave = await a.waitFor((m) => m.t === 'presence' && m.leave.includes(idB), 1_000)
      expect(leave.t === 'presence' && leave.join).toEqual([])
    } finally {
      await a.close()
    }
  })

  it('[FE-O03-S21] 握手失敗不給 err：scene 不合法、room 沒帶 token、room 的 uuid 不合法都在握手就被拒', async () => {
    for (const q of ['scene=bogus', 'scene=room:22222222-0000-4000-8000-0000000000f1', 'scene=room:------------------------------------']) {
      const r = await expectRefused(`${wsUrl()}?${q}`)
      expect(r.opened, `${q} 竟然連上了`).toBe(false)
      expect(r.messages, `${q} 被拒之前收到了訊息`).toBe(0)
      expect(r.error, q).toMatch(/403|Unexpected server response/)
    }
  })
})
