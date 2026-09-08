import { describe, expect, it } from 'vitest'
import { ClientMessage, ServerMessage, StatusIn, HZ } from '@/api/contract/ws'
import { LIMITS } from '@/api/contract/limits'

// 規格：openspec/specs/api-contract/spec.md
//   Requirement: WebSocket 兩個方向是兩個獨立的訊息集合
//   —— Scenario FE-O01-S06 / FE-O01-S07 / FE-O01-S08
//   Requirement: 長度與範圍限制…（狀態文字那一格）—— FE-O01-S04
//
// ⚠️ Scenario ID 只放在 `it` 標題上，而且那條 `it` 要把該 Scenario 的每一個
// WHEN/THEN 子句都跑過 —— 理由見 `contract-limits.test.ts` 的檔頭。

const repeat = (s: string, n: number) => s.repeat(n)

describe('WebSocket 兩個方向', () => {
  it('[FE-O01-S06] 同一個 t 在兩個方向有不同形狀', () => {
    // `protocol.py`：client 送 {t,text}，server 送 {t,id,text}。
    expect(
      ClientMessage.safeParse({ t: 'status', text: '趕工中' }).success,
      'client 的 status 沒有 id，應該通過',
    ).toBe(true)

    const withId = ClientMessage.parse({ t: 'status', id: 'u1', text: '趕工中' })
    expect(withId, 'id 是伺服器才有的欄位，不該留在 client 的解析結果裡').not.toHaveProperty('id')

    expect(
      ServerMessage.safeParse({ t: 'status', text: '趕工中' }).success,
      'server 的 status 少了 id，應該失敗',
    ).toBe(false)
    expect(ServerMessage.safeParse({ t: 'status', id: 'u1', text: '趕工中' }).success).toBe(true)
  })

  it('chat 也是 —— server 的多了 id 與 name', () => {
    // 超出 S06 的字面（它只講 status），不掛 ID。但 chat 漏掉的話，
    // 「兩個方向分開」這件事只有一半有人在看。
    expect(ClientMessage.safeParse({ t: 'chat', body: '嗨' }).success).toBe(true)
    expect(ServerMessage.safeParse({ t: 'chat', body: '嗨' }).success).toBe(false)
    expect(ServerMessage.safeParse({ t: 'chat', id: 'u1', name: '訪客', body: '嗨' }).success).toBe(
      true,
    )
  })

  it('[FE-O01-S07] 浮點座標與越界朝向都被擋下', () => {
    // 後端的 x／y 是 StrictInt。送浮點**整則訊息被丟棄**，而且沒有錯誤回來 ——
    // 前端不擋的話，症狀是「角色在別人畫面上不動」，而且查不到原因。
    const move = { t: 'move', x: 120, y: 340, f: 2 }
    expect(ClientMessage.safeParse({ ...move, x: 120.5 }).success, '浮點 x 應該失敗').toBe(false)
    expect(ClientMessage.safeParse({ ...move, f: 4 }).success, 'f=4 應該失敗').toBe(false)
    expect(
      ClientMessage.safeParse({ t: 'move', x: -120, y: -340, f: 0 }).success,
      '協定允許負座標',
    ).toBe(true)
  })

  it('f 的兩個端點與下界都要驗', () => {
    const move = { t: 'move', x: 1, y: 1 }
    expect(ClientMessage.safeParse({ ...move, f: 0 }).success).toBe(true)
    expect(ClientMessage.safeParse({ ...move, f: 3 }).success).toBe(true)
    expect(ClientMessage.safeParse({ ...move, f: -1 }).success).toBe(false)
  })

  it('[FE-O01-S08] 未知的訊息類型明顯失敗', () => {
    const result = ServerMessage.safeParse({ t: 'teleport', x: 1 })
    expect(result.success, '未知的 t 不可以回傳成功').toBe(false)
    // 只驗失敗不夠 —— 要能指出是 `t` 不認得，否則錯誤訊息幫不上任何忙。
    expect(result.error?.issues.map((i) => i.path.join('.'))).toContain('t')
  })

  it('client 不能偽造伺服器訊息，缺 t 或不是物件也失敗', () => {
    // `protocol.py` 的註解：hello / snapshot / pos / presence / err 不在
    // client union 裡，所以客戶端無法偽造伺服器訊息。
    expect(ClientMessage.safeParse({ t: 'hello', you: 'u1', hz: 10 }).success).toBe(false)
    expect(ServerMessage.safeParse({ players: [] }).success).toBe(false)
    expect(ServerMessage.safeParse(null).success).toBe(false)
    expect(ServerMessage.safeParse('pos').success).toBe(false)
  })
})

describe('server 訊息的形狀', () => {
  it('pos 的 p 是陣列不是物件', () => {
    // 40 人 × 10 Hz 下，欄位名會被重複送 400 次／秒 —— 所以是 [id,x,y,f]。
    expect(ServerMessage.parse({ t: 'pos', p: [['u1', 120, 340, 2]] }).t).toBe('pos')
    // 物件形式要被擋下，否則「後端改成物件」會靜靜通過然後在別處爆炸
    expect(ServerMessage.safeParse({ t: 'pos', p: [{ id: 'u1', x: 1, y: 2, f: 0 }] }).success).toBe(
      false,
    )
  })

  it('presence 的 join 與 leave 合併在同一則', () => {
    const parsed = ServerMessage.parse({
      t: 'presence',
      join: [{ id: 'u2', name: '訪客', av: 0, x: 0, y: 0, f: 0, st: '' }],
      leave: ['u3'],
    })
    expect(parsed.t).toBe('presence')
  })

  it('hello 帶著後端的廣播頻率', () => {
    expect(ServerMessage.safeParse({ t: 'hello', you: 'u1', hz: HZ }).success).toBe(true)
    expect(HZ).toBe(10)
  })
})

describe('狀態文字的長度', () => {
  it('[FE-O01-S04] 長度單位是 code point，不是 UTF-16 code unit', () => {
    const twelveEmoji = repeat('😀', 12)
    // 前提先釘住，否則這條測試在講別的事
    expect(twelveEmoji.length, 'UTF-16 code unit 應該是 24').toBe(24)
    expect([...twelveEmoji].length, 'code point 應該是 12').toBe(12)

    expect(
      StatusIn.safeParse({ t: 'status', text: twelveEmoji }).success,
      '契約用了 UTF-16 code unit 計數 —— 它拒絕了後端收得下的字串',
    ).toBe(true)
    expect(
      StatusIn.safeParse({ t: 'status', text: repeat('😀', 13) }).success,
      '13 個應該失敗',
    ).toBe(false)
  })

  it('一般字元的 12／13 邊界，以及上限來自常數表', () => {
    expect(StatusIn.safeParse({ t: 'status', text: repeat('字', 12) }).success).toBe(true)
    expect(StatusIn.safeParse({ t: 'status', text: repeat('字', 13) }).success).toBe(false)
    expect(LIMITS.statusText.max, 'ws.ts 不該再寫一次這個數字').toBe(12)
  })
})
