import { describe, expect, it } from 'vitest'
import { RealtimeClient, connectionUrl, type ConnectionClosed } from '@/realtime/client'
import { wsUrl } from '@/config/env'

// 規格 FE-R01 的〈驗證方式〉V1 與 V3。**不進 CI。**
//
//     npm run test:integration
//
// ⚠️ **要先起後端**，而且只准打自己起的那一份：
//
//     cd ~/Desktop/workshop/fergus/GuildHub-backend
//     bash run.sh          # ./run.sh 沒有執行權限
//
// 即時層不需要資料庫 —— Postgres 沒接上也連得上，
// 啟動時只會印一行「資料庫未連上，僅即時層可用」。
//
// **這裡驗的是單元測試證明不了的事**：
//   V1 伺服器那邊的保活真的有效（單元測試裡沒有真的 WebSocket）
//   V3 握手被拒時客戶端實際看到什麼（回歸）
//
// V2（cookie 有沒有送到）**不在這裡** —— Node 的 WebSocket 不帶 cookie，
// 那一條要瀏覽器。見 tasks.md 4.2。

/** 連上並等到 `ready`，或在逾時前失敗。 */
function connect(scene?: string): Promise<{
  client: RealtimeClient
  ready: boolean
  closed: ConnectionClosed | null
  messages: string[]
}> {
  return new Promise((resolve) => {
    const messages: string[] = []
    let closed: ConnectionClosed | null = null
    let settled = false
    const finish = (ready: boolean) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({ client, ready, closed, messages })
    }
    const client = new RealtimeClient({
      scene,
      onMessage: (m) => messages.push(m),
      onStateChange: (s) => {
        if (s === 'ready') finish(true)
      },
      onClosed: (c) => {
        closed = c
        finish(false)
      },
    })
    const timer = setTimeout(() => finish(client.state === 'ready'), 5_000)
    client.connect()
  })
}

describe('對真的後端（不進 CI）', () => {
  it('先確認後端起來了 —— 沒起來的話下面每一條都會用錯的理由失敗', async () => {
    const { client, ready, closed } = await connect()
    expect(
      ready,
      `連不上 ${wsUrl()}。先在 GuildHub-backend 跑 \`bash run.sh\`。` +
        `（關閉事實：${JSON.stringify(closed)}）`,
    ).toBe(true)
    client.close()
  })

  it('V1：靜止 35 秒之後連線還在，而且期間沒有任何應用層訊息', async () => {
    const { client, ready, messages } = await connect()
    expect(ready).toBe(true)

    // ⚠️ **先讓握手那一批沉澱再取基準線。**
    // `connect()` 在收到 `hello` 就 resolve，而 `snapshot` 緊接在後
    //（實測相隔不到 1 毫秒）—— 立刻取 `messages.length` 會卡在兩則中間，
    // 於是 `snapshot` 被算成「靜止期間收到的訊息」。
    // 第一次跑就是這樣紅的，而紅的原因跟後端一點關係也沒有。
    await new Promise((r) => setTimeout(r, 500))
    const afterHandshake = messages.length
    expect(afterHandshake, '握手應該送兩則：hello 與 snapshot').toBe(2)

    await new Promise((r) => setTimeout(r, 35_000))

    // 後端 uvicorn 起在 --ws-ping-interval 20 --ws-ping-timeout 20，
    // 保活在 WebSocket 協定層。**這是單元測試證明不了的那一半。**
    expect(client.state, '靜止 35 秒之後連線斷了').toBe('ready')
    const idleMessages = messages.slice(afterHandshake)
    expect(
      idleMessages,
      `靜止時應該一則應用層訊息都不來 —— 不能拿 pos 當心跳。實際收到：${JSON.stringify(idleMessages)}`,
    ).toEqual([])

    client.close()
  }, 60_000)

  it('V3：握手被拒時，客戶端看到的仍然是 1006／空 reason，分辨不出原因', async () => {
    const { ready, closed } = await connect('NOT A SCENE!!')
    expect(ready, '不合法的 scene 竟然連上了').toBe(false)
    expect(closed, '應該要有關閉事實').not.toBeNull()

    // `docs/WBS.md` 與 `CONTEXT.md` 寫的是 close 1008。**客戶端看不到它** ——
    // 後端在 accept 之前 close，握手以 HTTP 403 收場。
    expect(closed!.code, 'WBS 寫的 1008 客戶端看得到了？那要回去改規格').toBe(1006)
    expect(closed!.reason).toBe('')
    expect(closed!.wasClean).toBe(false)
    // 唯一分辨得出來的事：握手從來沒成功
    expect(closed!.opened).toBe(false)
  })

  it('V3：連線位址是設定模組算出來的，不是寫死的', () => {
    expect(connectionUrl('lobby')).toBe(`${wsUrl()}?scene=lobby`)
  })
})

describe('design.md 的未決問題：換 scene 要不要等 close 事件（不進 CI）', () => {
  // 問題：`closeAndEnter` 現在**不等**舊連線的 `close` 事件就建新的。
  // 有一小段兩條連線並存的話，後端會把它們當成**兩個人**，位置互相覆寫
  //（那個行為未定義，是 `FE-R06` 的題目）。
  //
  // 量法：換到同一個 scene，看新連線的 `snapshot` 裡有幾個人。
  // 只有自己 → 舊的已經消失；兩個 → 真的重疊了。

  it('量一次：換 scene 之後新連線的 snapshot 裡有幾個人', async () => {
    const first = await connect('lobby')
    expect(first.ready).toBe(true)

    const snapshots: string[] = []
    await new Promise<void>((resolve) => {
      first.client.closeAndEnter('lobby')
      const started = Date.now()
      const poll = setInterval(() => {
        const snap = first.messages.filter((m) => m.includes('"t":"snapshot"'))
        // 第二則 snapshot 就是新連線的
        if (snap.length >= 2 || Date.now() - started > 4_000) {
          clearInterval(poll)
          snapshots.push(...snap)
          resolve()
        }
      }, 50)
    })

    const latest = snapshots.at(-1)
    expect(latest, '新連線沒有收到 snapshot').toBeDefined()
    const players = (JSON.parse(latest!) as { players: unknown[] }).players
    console.log(`\n  4.4 量到的：換 scene 之後新連線的 snapshot 有 ${players.length} 個人`)
    console.log(`      ${latest}\n`)

    first.client.close()
    expect(
      players.length,
      `換 scene 時兩條連線重疊了 —— 後端把同一個人當成 ${players.length} 個。` +
        '那代表 closeAndEnter 必須等舊連線的 close 事件。',
    ).toBe(1)
  }, 20_000)
})
