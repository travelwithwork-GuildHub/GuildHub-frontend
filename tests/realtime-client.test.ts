import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  RealtimeClient,
  RealtimeError,
  connectionUrl,
  type ConnectionClosed,
  type ConnectionState,
} from '@/realtime/client'
import type { SocketEventMap, SocketEventName, SocketLike } from '@/realtime/socket'

// 規格：openspec/changes/fe-r01-realtime/specs/realtime-client/spec.md
//   Requirement: 連線狀態機 —— FE-R01-S01 / S02
//   Requirement: 監聽器要在任何訊息可能到達之前就掛好 —— FE-R01-S03
//   Requirement: 一條連線只屬於一個 scene —— FE-R01-S04 / S05
//   Requirement: 關閉只說觀察得到的事實 —— FE-R01-S06 / S07
//   Requirement: 不做應用層保活 —— FE-R01-S08
//
// ⚠️ Scenario ID 只放在 `it` 標題上，而且那條 `it` 要把該 Scenario 的每一個
// WHEN/THEN 子句都跑過。
//
// 用替身 socket，**不連任何外部服務**。這一層要驗的是時序與狀態，不是網路。
// 「靜止 35 秒連線真的不會斷」需要真的後端，在 tasks.md 的整合驗證裡（不進 CI）。

const HELLO = (you = 'u-self') => JSON.stringify({ t: 'hello', you, hz: 10 })
const SNAPSHOT = (id = 'u-self') =>
  JSON.stringify({ t: 'snapshot', players: [{ id, name: '訪客', av: 0, x: 0, y: 0, f: 0, st: '' }] })

class FakeSocket implements SocketLike {
  readonly sent: string[] = []
  closeCalls = 0
  readonly #listeners = new Map<SocketEventName, Set<(payload: never) => void>>()

  send(data: string) {
    this.sent.push(data)
  }
  close() {
    this.closeCalls += 1
  }
  addEventListener<K extends SocketEventName>(type: K, listener: (e: SocketEventMap[K]) => void) {
    const set = this.#listeners.get(type) ?? new Set()
    set.add(listener as (p: never) => void)
    this.#listeners.set(type, set)
  }
  removeEventListener<K extends SocketEventName>(type: K, listener: (e: SocketEventMap[K]) => void) {
    this.#listeners.get(type)?.delete(listener as (p: never) => void)
  }
  /** 幾個 listener 還掛著 —— 用來驗「關閉之後有沒有清乾淨」。 */
  get listenerCount(): number {
    let n = 0
    for (const set of this.#listeners.values()) n += set.size
    return n
  }
  emit<K extends SocketEventName>(type: K, event: SocketEventMap[K]) {
    for (const l of [...(this.#listeners.get(type) ?? [])]) (l as (e: SocketEventMap[K]) => void)(event)
  }
}

/** 建立時就把 open + hello + snapshot 排進 microtask —— 模擬實測的 <1ms 時序。 */
class ImmediateSocket extends FakeSocket {
  constructor() {
    super()
    queueMicrotask(() => {
      this.emit('open', null)
      this.emit('message', { data: HELLO() })
      this.emit('message', { data: SNAPSHOT() })
    })
  }
}

function setup(
  opts: { scene?: string; token?: string; SocketClass?: new () => FakeSocket } = {},
) {
  const sockets: FakeSocket[] = []
  const states: ConnectionState[] = []
  const messages: string[] = []
  const closed: ConnectionClosed[] = []
  const Klass = opts.SocketClass ?? FakeSocket
  const urls: string[] = []
  const client = new RealtimeClient({
    scene: opts.scene,
    token: opts.token,
    onStateChange: (s) => states.push(s),
    onMessage: (m) => messages.push(m),
    onClosed: (c) => closed.push(c),
    createSocket: (url) => {
      urls.push(url)
      const s = new Klass()
      sockets.push(s)
      return s
    },
  })
  return { client, sockets, states, messages, closed, urls }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('RealtimeClient', () => {
  it('[FE-R01-S01] 狀態依序推進，ready 之後才拿得到自己的 id', () => {
    const { client, sockets, states } = setup()
    client.connect()
    expect(client.state).toBe('connecting')
    expect(client.selfId, 'connecting 時還不該知道自己是誰').toBeNull()

    sockets[0]!.emit('open', null)
    expect(client.state).toBe('open')
    expect(client.selfId, 'open 只代表傳輸層成功，還不知道自己是誰').toBeNull()

    sockets[0]!.emit('message', { data: HELLO('u-abc') })
    expect(client.state).toBe('ready')
    expect(client.selfId).toBe('u-abc')

    expect(states).toEqual(['connecting', 'open', 'ready'])
  })

  it('[FE-R01-S02] 還沒 ready 就送訊息會明確失敗', () => {
    const { client, sockets } = setup()
    client.connect()
    // **不可以靜默丟棄** —— 後端對不合法訊息就是靜默丟棄，
    // 兩邊都安靜的話「我沒送出去」跟「後端不收」變成同一個症狀。
    expect(() => client.send('x'), 'connecting 時送出應該失敗').toThrow(RealtimeError)

    sockets[0]!.emit('open', null)
    expect(() => client.send('x'), 'open 時送出應該失敗').toThrow(RealtimeError)

    sockets[0]!.emit('message', { data: HELLO() })
    client.send('{"t":"move","x":1,"y":2,"f":0}')
    expect(sockets[0]!.sent, 'ready 時訊息要真的交給 socket').toHaveLength(1)
  })

  it('[FE-R01-S03] hello 與 snapshot 同一批到達時，兩則都收得到', async () => {
    // 實測：握手成功後兩則相隔不到 1 毫秒。監聽器晚一步就收不到 hello，
    // 而 snapshot 裡包含自己 —— FE-R07 會替使用者建一個自己的分身。
    const { client, messages } = setup({ SocketClass: ImmediateSocket })
    client.connect()
    await Promise.resolve()
    await Promise.resolve()

    expect(client.state, '同一批到達時應該已經 ready').toBe('ready')
    expect(client.selfId).toBe('u-self')
    expect(messages, 'snapshot 被吞掉了').toContain(SNAPSHOT())
  })

  it('[FE-R01-S04] scene 與 token 進到位址，預設是 lobby', () => {
    const bare = setup()
    bare.client.connect()
    expect(new URL(bare.urls[0]!).searchParams.get('scene')).toBe('lobby')

    const room = setup({ scene: 'room:abc', token: 'tok-1' })
    room.client.connect()
    const url = new URL(room.urls[0]!)
    expect(url.searchParams.get('scene')).toBe('room:abc')
    expect(url.searchParams.get('token')).toBe('tok-1')
    // base 來自設定模組，不是寫死的
    expect(url.origin + url.pathname).toBe(connectionUrl('x').split('?')[0])
  })

  it('[FE-R01-S05] 換 scene 是關掉重開，而且舊的先關乾淨', () => {
    const { client, sockets, urls } = setup()
    client.connect()
    sockets[0]!.emit('open', null)
    sockets[0]!.emit('message', { data: HELLO() })

    client.closeAndEnter('room:xyz', 'tok-2')

    expect(sockets[0]!.closeCalls, '舊的 socket 應該被關閉').toBe(1)
    expect(sockets[0]!.listenerCount, '舊 socket 的監聽器應該全部移除').toBe(0)
    expect(sockets).toHaveLength(2)
    expect(new URL(urls[1]!).searchParams.get('scene')).toBe('room:xyz')

    // 舊連線之後不得再影響狀態
    sockets[0]!.emit('close', { code: 1006, reason: '', wasClean: false })
    expect(client.state, '舊連線的事件竟然改到了新連線的狀態').toBe('connecting')
  })

  it('[FE-R01-S06] 握手失敗與連線中斷交出的事實不同', () => {
    // 握手被拒：open 從來沒觸發
    const rejected = setup()
    rejected.client.connect()
    rejected.sockets[0]!.emit('close', { code: 1006, reason: '', wasClean: false })
    expect(rejected.closed[0]!.opened, '握手被拒時 opened 應該是 false').toBe(false)

    // ready 之後才斷
    const dropped = setup()
    dropped.client.connect()
    dropped.sockets[0]!.emit('open', null)
    dropped.sockets[0]!.emit('message', { data: HELLO() })
    dropped.sockets[0]!.emit('close', { code: 1006, reason: '', wasClean: false })
    expect(dropped.closed[0]!.opened, 'ready 之後才斷，opened 應該是 true').toBe(true)

    // **型別裡不得有原因分類欄位** —— 加了之後下一個人會寫出死碼
    for (const info of [rejected.closed[0]!, dropped.closed[0]!]) {
      expect(Object.keys(info).sort()).toEqual(['code', 'opened', 'reason', 'wasClean'])
    }
  })

  it('[FE-R01-S07] 關閉是幂等的，而且會清乾淨', () => {
    const { client, sockets, closed } = setup()
    client.connect()
    sockets[0]!.emit('open', null)
    sockets[0]!.emit('message', { data: HELLO() })

    client.close()
    client.close()

    expect(closed, '關閉事件只該發一次').toHaveLength(1)
    expect(sockets[0]!.listenerCount).toBe(0)

    // 關閉之後，原本那個 socket 再送任何東西都不得改變狀態
    sockets[0]!.emit('message', { data: HELLO('u-other') })
    sockets[0]!.emit('close', { code: 1006, reason: '', wasClean: false })
    expect(client.state).toBe('closed')
    expect(client.selfId).toBe('u-self')
    expect(closed).toHaveLength(1)
  })

  it('[FE-R01-S08] 進入 ready 之後靜止很久，一則訊息都不送', () => {
    vi.useFakeTimers()
    const { client, sockets } = setup()
    client.connect()
    sockets[0]!.emit('open', null)
    sockets[0]!.emit('message', { data: HELLO() })

    vi.advanceTimersByTime(35_000)

    // 實測：後端 uvicorn 起在 --ws-ping-interval 20，靜止 35 秒連線不會斷，
    // 期間 0 則應用層訊息。保活在 WebSocket 協定層，應用層什麼都不用做。
    expect(sockets[0]!.sent, '有人加了應用層 heartbeat').toHaveLength(0)
    expect(vi.getTimerCount(), '有為了保活而設的計時器').toBe(0)
    expect(client.state).toBe('ready')
  })

  it('非 hello 的訊息原樣交出去，不做未知 t 的政策', () => {
    // 「驗證每一則、未知 t 明顯失敗」是 FE-R02，這一層不做。
    const { client, sockets, messages } = setup()
    client.connect()
    sockets[0]!.emit('open', null)
    sockets[0]!.emit('message', { data: '{"t":"teleport","x":1}' })
    sockets[0]!.emit('message', { data: '這不是 JSON' })

    expect(messages).toEqual(['{"t":"teleport","x":1}', '這不是 JSON'])
    expect(client.state, '沒收到 hello 就不該進 ready').toBe('open')
  })

  it('連兩次會明確失敗 —— 換 scene 要用 closeAndEnter', () => {
    const { client } = setup()
    client.connect()
    expect(() => client.connect()).toThrow(RealtimeError)
  })
})
