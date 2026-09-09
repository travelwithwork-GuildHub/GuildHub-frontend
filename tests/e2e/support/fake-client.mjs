// FE-R09 的假 client：一條 WebSocket 連線，扮演「另一個在場上走動的人」。
//
// ⚠️⚠️ **它刻意不送得漂亮。** 節奏完美的假流量會讓插值與位置修正的
// CPU 峰值完全被掩蓋 —— 量到的是一個真實世界不存在的乾淨情況。
// 三個特性都要有，而且都要能關掉（規格 `FE-R09-S03`／`S04`）：
//
//   抖動      送出間隔不是固定的
//   同幀突發  一部分更新刻意擠在同一個時間點
//   移動變化  走走停停、轉向，不是一直線
//
// ⚠️ **座標是整數像素，不是世界座標。** `x`／`y` 送浮點的話**整則訊息被丟棄**，
// 而且沒有任何錯誤回來（`ws.ts` 的 `Move`）。

/** 後端的廣播頻率。送得比它快沒有意義 —— 多出來的會被下一個 tick 蓋掉。 */
export const HZ = 10

/** 遊玩區域的半徑（協定的整數像素）。世界是 ±10 個單位 × 32 像素。 */
const HALF_EXTENT_PX = 10 * 32

/**
 * @typedef {object} FakeClientOptions
 * @property {string} url
 * @property {number} [jitter]  送出間隔的抖動比例。`0` 是完美節奏 —— **那是給 `S04` 對照用的**。
 * @property {number} [burst]   每一則有多少機率被延到跟下一則一起送（製造同幀擁塞）。`0` 關掉。
 * @property {number} [wander]  每一步有多少機率改變方向或停下來。`0` 是一直線走。
 */

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v)

/**
 * 開一條假 client。
 *
 * 回傳的物件帶 `state`（`ready`／`sent`／`receivedPos`）、`freeze()` 與 `close()`。
 *
 * @param {FakeClientOptions} options
 */
export function startFakeClient(options) {
  const { url, jitter = 0.4, burst = 0.15, wander = 0.1 } = options
  // Node 24 內建 WebSocket —— 不多一個相依（design 的 Q4）
  const socket = new WebSocket(url)

  const state = {
    id: null,
    ready: false,
    sent: 0,
    receivedPos: 0,
    closed: false,
    error: null,
  }

  let x = Math.floor((Math.random() * 2 - 1) * HALF_EXTENT_PX * 0.8)
  let y = Math.floor((Math.random() * 2 - 1) * HALF_EXTENT_PX * 0.8)
  let dx = Math.random() < 0.5 ? -1 : 1
  let dy = Math.random() < 0.5 ? -1 : 1
  let facing = 0
  /** 被 burst 延後的訊息，下一次一起送 —— 這就是「同幀擁塞」。 */
  let held = []
  let timer = null

  const step = () => {
    if (Math.random() < wander) {
      dx = Math.round(Math.random() * 2 - 1)
      dy = Math.round(Math.random() * 2 - 1)
    }
    // 每個 tick 走 MOVE_SPEED(4 單位/秒) ÷ HZ × 32 像素 ≈ 13 像素
    x = clamp(x + dx * 13, -HALF_EXTENT_PX, HALF_EXTENT_PX)
    y = clamp(y + dy * 13, -HALF_EXTENT_PX, HALF_EXTENT_PX)
    if (dx !== 0) facing = dx > 0 ? 2 : 1
    else if (dy !== 0) facing = dy > 0 ? 0 : 3

    const message = JSON.stringify({ t: 'move', x, y, f: facing })

    if (Math.random() < burst) {
      // 這一則不送，留到下一次跟新的一起送出去
      held.push(message)
    } else {
      for (const m of held) {
        socket.send(m)
        state.sent++
      }
      held = []
      socket.send(message)
      state.sent++
    }

    // **抖動在這裡**：下一次的間隔不是固定的
    const base = 1000 / HZ
    const delay = base * (1 + (Math.random() * 2 - 1) * jitter)
    timer = setTimeout(step, delay)
  }

  socket.addEventListener('message', (event) => {
    let parsed
    try {
      parsed = JSON.parse(String(event.data))
    } catch {
      return
    }
    if (parsed.t === 'hello') {
      state.id = parsed.you
      state.ready = true
      timer = setTimeout(step, Math.random() * (1000 / HZ))
    } else if (parsed.t === 'pos') {
      state.receivedPos++
    }
  })
  socket.addEventListener('error', () => {
    state.error = '連線錯誤'
  })
  socket.addEventListener('close', () => {
    state.closed = true
    if (timer !== null) clearTimeout(timer)
  })

  return {
    state,
    /** 停止移動但不斷線 —— `S06`（靜止時封包數為 0）要用。 */
    freeze() {
      if (timer !== null) clearTimeout(timer)
      timer = null
    },
    close() {
      if (timer !== null) clearTimeout(timer)
      socket.close()
    },
  }
}

/** 等一批 client 全部收到 `hello`。**連不滿就失敗**（規格 `FE-R09-S09`）。 */
export async function waitReady(clients, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const ready = clients.filter((c) => c.state.ready).length
    if (ready === clients.length) return ready
    await new Promise((r) => setTimeout(r, 200))
  }
  return clients.filter((c) => c.state.ready).length
}
