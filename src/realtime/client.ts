import { Hello } from '@/api/contract/ws'
import { wsUrl } from '@/config/env'
import type { CloseInfo, SocketLike } from './socket'

// 即時層的連線。規格 FE-R01。
//
// 這一層**不決定任何訊息的意義** —— 那是 `FE-R02` 之後的事。
// 它只決定「什麼時候我們知道自己是誰」，而下游每一項都建在那個答案上。

export type ConnectionState = 'idle' | 'connecting' | 'open' | 'ready' | 'closed'

/**
 * 關閉時**觀察得到的事實**。
 *
 * ⚠️ **這裡面沒有原因分類，而且不要加。**
 *
 * 實測：握手被拒時客戶端看到的是 `code=1006`、`reason=""`、`wasClean=false`，
 * 而且「不合法 scene」「room 沒帶 token」「路徑根本不存在」「後端沒起來」
 * **四種的事件序列完全一樣**。
 *
 * `docs/WBS.md` 與 `CONTEXT.md` 寫的「握手失敗直接 close 1008」是**伺服器端**
 * 的動作 —— 後端在 accept 之前 close，握手以 HTTP 403 收場，客戶端看不到那個碼。
 * 照著寫的 `if (code === 1008)` 是一段永遠不會執行的死碼。
 *
 * 加一個 `reason: 'bad-token' | 'bad-scene'` 之類的欄位，就是在請下一個人
 * 再寫一段死碼。
 */
export interface ConnectionClosed extends CloseInfo {
  /**
   * 這條連線的 open 事件有沒有觸發過。
   *
   * **這是客戶端唯一分辨得出來的事**：握手成功過（之後才斷），
   * 還是從來沒成功。它**不說**失敗的原因。
   */
  opened: boolean
}

export interface RealtimeClientOptions {
  /** 預設 `lobby`。一條連線只屬於一個 scene。 */
  scene?: string
  /** 進受密碼保護的房間才要。怎麼拿到它不是這一層的事。 */
  token?: string
  /** **原樣**交出每一則進來的訊息。驗證與分派是 `FE-R02`。 */
  onMessage?: (raw: string) => void
  onStateChange?: (state: ConnectionState) => void
  onClosed?: (info: ConnectionClosed) => void
  /** 讓測試注入替身。 */
  createSocket?: (url: string) => SocketLike
}

/**
 * 預設的 socket 工廠。
 *
 * **真的 `WebSocket` 直接滿足 `SocketLike`，沒有任何轉接** ——
 * 這個函式的存在只是為了給那個型別一個名字。包一層轉接會多製造一個
 * 「替身跟真的不一樣」的地方，而那種落差是查不出來的。
 */
const browserSocket = (url: string): SocketLike => new WebSocket(url)

export class RealtimeError extends Error {
  override name = 'RealtimeError'
}

/**
 * 換 scene 時等舊 socket 的 `close` 事件的上限。規格 `FE-V01-S18`。
 *
 * ⚠️ **為什麼要等**：後端 `manager.disconnect()` 只查**同一個 scene** 裡有沒有同一個 `user_id`
 * 的其他連線，沒有就 `presence.clear(user_id)`。新連線若已經在另一個 scene `join()` 了，
 * 被清掉的是**新的那個人** —— 連線開著，房間裡沒人看得到他。
 * 舊 socket 的 close 事件代表伺服器的傳輸層已回應 close 幀；那之後再建新連線，
 * `disconnect()` 幾乎必然排在 `join()` 之前。**這是降機率，不是證明**（應用層跑完沒有客戶端看不到）。
 *
 * 上限是為了不永遠等：到了仍建，代價是那一次可能撞上上面那個競態。
 */
export const CLOSE_ACK_TIMEOUT_MS = 1000

/**
 * `scene` 與 `token` 進查詢參數，base 來自設定模組 —— 不寫死。
 *
 * ⚠️ **即時層資料來源是 `none` 時拋錯**（`wsUrl()` 那時回 `null`）。
 * 走到這裡代表有人在 `none` 的部署下建立了連線 —— 而規格 `FE-O14`
 * 明文要求那時 **MUST NOT 建立任何 WebSocket 連線**。
 *
 * 這不是死碼：`RemoteWorld` 是唯一的呼叫端，而「它有沒有真的擋住」
 * 是 `FE-O14-S07` 在驗的事。這一層是那條防線漏掉時的第二道 ——
 * 它會讓錯誤指出**原因**，而不是變成一次連往 `null` 的連線嘗試。
 */
export function connectionUrl(scene: string, token?: string): string {
  const base = wsUrl()
  if (base === null) {
    throw new RealtimeError(
      '即時層的資料來源是 none，不該建立連線。' +
        'NEXT_PUBLIC_REALTIME_ADAPTER=none 代表這個部署刻意沒有即時後端。',
    )
  }
  const url = new URL(base)
  url.searchParams.set('scene', scene)
  if (token) url.searchParams.set('token', token)
  return url.toString()
}

export class RealtimeClient {
  #state: ConnectionState = 'idle'
  #socket: SocketLike | null = null
  #selfId: string | null = null
  #opened = false
  #closeEmitted = false
  #scene: string
  #token: string | undefined
  /** 「等舊 close 再進」的代號：`close()` 或再一次 `closeAndEnter()` 會讓上一次 pending 的進入作廢。 */
  #enterGeneration = 0
  /**
   * 還在等 close 事件的舊 socket 有幾個。**不是 boolean**：等 ack 期間又 `closeAndEnter()`，
   * 那時 `#socket` 已經是 `null`，但最舊的那條還沒關乾淨 —— 新的進入要排在**它**後面，不能立刻連。
   */
  #acksPending = 0
  /** ack 全部到齊時要跑的東西（依序）。 */
  #ackWaiters: (() => void)[] = []
  readonly #options: RealtimeClientOptions

  // **每個 listener 都要留著 reference**，否則關閉時移不掉 ——
  // 移不掉的話，舊連線的事件會繼續改新連線的狀態（換 scene 時直接踩到）。
  readonly #onOpen = () => this.#handleOpen()
  readonly #onMessage = (event: { readonly data: unknown }) => this.#handleMessage(String(event.data))
  readonly #onClose = (info: CloseInfo) => this.#handleClose(info)

  constructor(options: RealtimeClientOptions = {}) {
    this.#options = options
    this.#scene = options.scene ?? 'lobby'
    this.#token = options.token
  }

  get state(): ConnectionState {
    return this.#state
  }

  /** 自己的 id。**`ready` 之前是 `null`** —— 那段期間下游不該動作。 */
  get selfId(): string | null {
    return this.#selfId
  }

  get scene(): string {
    return this.#scene
  }

  /**
   * 建立連線。
   *
   * ⚠️ **監聽器在建立 socket 的同一個同步區塊裡掛好，中間不得有任何
   * `await` / `then` / `setTimeout`。**
   *
   * 實測：握手成功後 `hello` 與 `snapshot` 相隔**不到 1 毫秒**一起到。
   * 監聽器晚一步就收不到 `hello`，於是不知道自己的 id ——
   * 而 `snapshot` **裡面包含自己**，`FE-R07` 會替使用者建一個自己的分身。
   *
   * 這個 bug 是機率性的，本機幾乎不會發生。
   */
  connect(): void {
    if (this.#state !== 'idle') {
      throw new RealtimeError(`已經連過了（現在是 ${this.#state}）。換 scene 用 closeAndEnter()。`)
    }
    this.#setState('connecting')
    const create = this.#options.createSocket ?? browserSocket
    const socket = create(connectionUrl(this.#scene, this.#token))
    this.#socket = socket
    // ↓ 這三行跟上面那一行之間不可以插入任何非同步步驟。
    socket.addEventListener('open', this.#onOpen)
    socket.addEventListener('message', this.#onMessage)
    socket.addEventListener('close', this.#onClose)
  }

  /**
   * 換 scene。
   *
   * **名字刻意寫成「關掉再進去」** —— 協定沒有切換 scene 的訊息，
   * 一條連線只屬於一個 scene。叫 `switchScene()` 會讓人以為不會斷線。
   *
   * 舊連線的監聽器**先移除**、再等它的 close 事件（上限 `CLOSE_ACK_TIMEOUT_MS`）、才建新的
   * （規格 `FE-V01-S18`；為什麼要等見那個常數）。同一個 `user_id` 的兩條連線在後端是**同一個**
   * `Player` 互相覆蓋（`multi-tab` 那條的實測），不是兩個人。
   *
   * 等的期間 `state` 是 `closed`（舊的已經關了、新的還沒建）；這段期間再 `close()` 或再
   * `closeAndEnter()`，這一次的進入就作廢 —— 靠代號比對，不靠旗標。
   */
  closeAndEnter(scene: string, token?: string): void {
    // ⚠️ 走同步的 callback，不走 promise：close 事件到達的**同一個 tick** 就建新連線，
    // 中間不插 microtask —— 測試與時序都要能對 close 事件那一刻斷言。
    // 沒有 socket 時（例如上一次已經失敗關掉）callback 是同步被叫的，所以重設要放在 callback 裡。
    this.#close((generation) => {
      if (generation !== this.#enterGeneration) return
      this.#scene = scene
      this.#token = token
      this.#state = 'idle'
      this.#selfId = null
      this.#opened = false
      this.#closeEmitted = false
      this.connect()
    })
  }

  /** 送出。**只有 `ready` 才准** —— 見下面為什麼不能靜默丟棄。 */
  send(data: string): void {
    if (this.#state !== 'ready' || this.#socket === null) {
      // **不可以靜默丟棄。** 後端對不合法的訊息就是靜默丟棄，
      // 兩邊都安靜的話，「我沒送出去」跟「後端不收」變成同一個症狀 ——
      // 而那是查不出來的。
      throw new RealtimeError(`還不能送訊息（現在是 ${this.#state}，要 ready）。`)
    }
    this.#socket.send(data)
  }

  /**
   * 關閉。**幂等** —— 重複呼叫不拋錯，關閉事件也只發一次（當下就發，不等伺服器）。
   *
   * 回傳的 promise 在**舊 socket 的 close 事件到達**時解決，最多等 `CLOSE_ACK_TIMEOUT_MS`；
   * 沒有 socket 的話立刻解決。那個 close 事件**不會**觸發 `onClosed`——是自己關的，上面已經發過一次。
   * 等它的那個監聽器是一次性的：事件到或逾時都會拆掉，舊 socket 之後不再影響任何狀態。
   */
  close(): Promise<void> {
    return new Promise((resolve) => this.#close(() => resolve()))
  }

  /** `close()` 的同步核心。`onAcked` 在舊 socket 的 close 事件到達（或逾時）時被呼叫，帶著這次的代號。 */
  #close(onAcked: (generation: number) => void): void {
    const generation = ++this.#enterGeneration
    const socket = this.#socket
    if (socket !== null) {
      socket.removeEventListener('open', this.#onOpen)
      socket.removeEventListener('message', this.#onMessage)
      socket.removeEventListener('close', this.#onClose)
      this.#socket = null
      // ack 的監聽器在 `socket.close()` **之前**掛好：同步送 close 事件的實作（或替身）才不會漏掉、白等 1 秒。
      this.#acksPending += 1
      let settled = false
      let timer: ReturnType<typeof setTimeout> | null = null
      const done = () => {
        if (settled) return
        settled = true
        socket.removeEventListener('close', done)
        if (timer !== null) clearTimeout(timer)
        this.#acksPending -= 1
        if (this.#acksPending === 0) this.#flushAckWaiters()
      }
      socket.addEventListener('close', done)
      timer = setTimeout(done, CLOSE_ACK_TIMEOUT_MS)
      socket.close()
    }
    // 先把「關了」這件事發出去，再排進入 —— 沒有東西要等時進入是同步的，
    // 而 `closeAndEnter` 的 callback 會接著 `connect()`；順序反過來的話這段會把新連線的狀態蓋回 closed。
    if (this.#state !== 'closed') {
      this.#setState('closed')
      this.#emitClosed({ code: 1000, reason: '', wasClean: true })
    }
    if (this.#acksPending === 0) onAcked(generation)
    else this.#ackWaiters.push(() => onAcked(generation))
  }

  #flushAckWaiters(): void {
    const waiters = this.#ackWaiters
    this.#ackWaiters = []
    for (const waiter of waiters) waiter()
  }

  #setState(next: ConnectionState): void {
    if (this.#state === next) return
    this.#state = next
    this.#options.onStateChange?.(next)
  }

  #emitClosed(info: CloseInfo): void {
    if (this.#closeEmitted) return
    this.#closeEmitted = true
    // ⚠️ **逐欄取值，不要用 `{ ...info }`。**
    //
    // 真的 `CloseEvent` 的 `code` / `reason` / `wasClean` 是**原型上的 getter**，
    // 不是自有屬性 —— 展開運算子複製不到它們，結果是一個三個欄位都 `undefined`
    // 的物件。**單元測試看不到這件事**：替身 emit 的是普通物件，展開正常。
    // 這是整合驗證（V3）抓到的。
    this.#options.onClosed?.({
      code: info.code,
      reason: info.reason,
      wasClean: info.wasClean,
      opened: this.#opened,
    })
  }

  #handleOpen(): void {
    // open 只代表**傳輸層**成功。握手被後端拒絕時它根本不會觸發，
    // 所以 open 就是「握手過了」—— 但**還不知道自己是誰**。
    this.#opened = true
    this.#setState('open')
  }

  #handleMessage(raw: string): void {
    // 只認 `hello`，其餘**原樣交出去**。
    // 「驗證每一則、未知 `t` 明顯失敗」是 `FE-R02` 的政策，不在這裡做。
    if (this.#selfId === null) {
      const hello = this.#parseHello(raw)
      if (hello !== null) {
        this.#selfId = hello.you
        this.#setState('ready')
      }
    }
    this.#options.onMessage?.(raw)
  }

  #parseHello(raw: string): { you: string } | null {
    let data: unknown
    try {
      data = JSON.parse(raw)
    } catch {
      // 不是 JSON 也不是這一層的事 —— 交給 onMessage，`FE-R02` 會處理。
      return null
    }
    const result = Hello.safeParse(data)
    return result.success ? result.data : null
  }

  #handleClose(info: CloseInfo): void {
    this.#socket = null
    this.#setState('closed')
    this.#emitClosed(info)
  }
}
