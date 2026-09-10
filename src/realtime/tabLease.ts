// 同一個瀏覽器裡「誰有資格連 world」的協調。規格 `FE-R06-S02`／`S03`。
//
// ⚠️⚠️ **這是止血，不是根治，而且規格明文要求這件事寫下來。**
// 它擋不住的至少有三種：分頁崩潰（沒有機會釋放資格）、兩個分頁在同一瞬間
// 搶資格的競態、以及**不同瀏覽器或不同裝置用同一個帳號登入** ——
// 最後那一種前端完全沒有辦法，因為 `BroadcastChannel` 只在同源的同一個
// 瀏覽器裡有效（`FE-R06-S04` 就是在講這件事）。
//
// 根治要後端做兩件事：`presence.join()` 對既有的 `user_id` 不得重建 `Player`，
// 以及把連線數與玩家狀態分開（`disconnect` 已經有 `still_here` 檢查，
// `join` 沒有對應的那一半）。票在 `BE-G31`。
//
// ⚠️ **匿名不走這裡。** 後端 `_identify()` 在沒有 session 時每條連線都回一個新的
// `uuid4()`，所以兩個匿名分頁在世界裡**就是兩個人** —— 擋掉它不只沒必要，
// 還會擋掉我們本機驗證多人行為的手段（`FE-R06-S01`）。
// 判斷「要不要用這個模組」的是呼叫端，不是這裡。

/** 計時器的把手。瀏覽器給 `number`，Node 給物件 —— 兩邊都收。 */
export type TimerHandle = ReturnType<typeof setTimeout> | number

/** 一個分頁的自我識別。**不是身分** —— 同一個人的兩個分頁有不同的 tabId。 */
const newTabId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`

type LeaseMessage =
  /** 「有人在嗎？」新分頁一連上就問。 */
  | { readonly kind: 'who-holds'; readonly from: string }
  /**
   * 「我在。」持有者對 `who-holds` 的回應，也是等待到期後的宣告。
   *
   * ⚠️ **這一則要破平手，不能無條件讓位。** 兩個等待中的分頁會在
   * 同一個時刻到期、同時宣告、然後互相讓位 —— **結果是兩個都沒有資格**。
   * 這不是推論，是判準跑出來的（`S03` 的「兩個等待中的分頁只有一個接手」）。
   * 破平手的規則是**比 tabId，小的贏** —— 任意但決定性，兩邊算出來一樣。
   */
  | { readonly kind: 'holding'; readonly from: string }
  /**
   * 「我要接手。」使用者按下「改用這個分頁」。
   *
   * ⚠️ **跟 `holding` 分成兩則，而且必須分。** 它是**無條件**的：
   * 使用者的明確意圖不該輸給一個 tabId 的字典序。
   * 一開始我把兩者合成同一則（理由是「分成兩種只會多一條會漂的路徑」），
   * 而那個合併正是上面那個平手 bug 的來源。
   */
  | { readonly kind: 'taking-over'; readonly from: string }
  /** 「我讓出來了。」關頁或被接手時送。 */
  | { readonly kind: 'released'; readonly from: string }

export interface TabLease {
  /** 這個分頁現在有沒有資格連線。 */
  held(): boolean
  /** 「改用這個分頁」。**會讓現有的持有者退出。** */
  takeOver(): void
  /** 主動放棄（關頁、或身分變了）。 */
  release(): void
  /** 資格變化時通知。回傳取消訂閱的函式。 */
  subscribe(listener: (held: boolean) => void): () => void
}

export interface TabLeaseOptions {
  /**
   * 等多久沒有人回應就認定自己是唯一的分頁（毫秒）。
   *
   * ⚠️ **這個值是「新分頁的黑畫面時間」與「誤判成唯一」之間的取捨。**
   * `BroadcastChannel` 在同一個瀏覽器裡是行程內的訊息傳遞，實測往返遠低於
   * 一毫秒；150ms 留了三個數量級的餘裕，而使用者感覺不到。
   * **調小到接近實際往返時間會開始誤判**，症狀是兩個分頁都以為自己是唯一的。
   */
  graceMs?: number
  /**
   * 讓測試控制時間。
   *
   * ⚠️ **回傳型別是 `TimerHandle` 不是 `ReturnType<typeof setTimeout>`。**
   * 後者在這個 repo 解析成 Node 的 `Timeout` 物件（`@types/node` 進得來），
   * 而瀏覽器的 `setTimeout` 回傳 `number` —— 寫成前者的話，正式碼的
   * `window.setTimeout` 反而型別不合。
   */
  setTimer?: (fn: () => void, ms: number) => TimerHandle
  clearTimer?: (id: TimerHandle) => void
}

/**
 * 對 `key` 這個資源取得（或等待）連線資格。
 *
 * `key` 要含**身分**與 **scene** —— 同一個人在兩個不同的 scene 各連一條是合法的。
 *
 * ⚠️ **一開始是「還不知道」，不是「有」。** 先假設自己有資格的話，
 * 第二個分頁會先連上去再被踢掉 —— 而連上去的那一瞬間就足以把第一個分頁的
 * 角色瞬移回原點（那正是這條規格要擋的事）。
 */
export function claimTabLease(key: string, options: TabLeaseOptions = {}): TabLease {
  const { graceMs = 150, setTimer = setTimeout, clearTimer = clearTimeout } = options
  const me = newTabId()
  const channel = new BroadcastChannel(`guildhub.world-lease.${key}`)
  const listeners = new Set<(held: boolean) => void>()

  let holding = false
  let settled = false
  let timer: TimerHandle | null = null

  const post = (message: LeaseMessage) => channel.postMessage(message)

  const setHolding = (next: boolean) => {
    if (holding === next) return
    holding = next
    for (const listener of listeners) listener(holding)
  }

  const stopWaiting = () => {
    settled = true
    if (timer !== null) clearTimer(timer)
    timer = null
  }

  /** 等待到期，沒有人回應 —— 宣告持有（會被平手規則審視）。 */
  const claim = () => {
    stopWaiting()
    setHolding(true)
    post({ kind: 'holding', from: me })
  }

  channel.onmessage = (event: MessageEvent<LeaseMessage>) => {
    const message = event.data
    if (message.from === me) return
    switch (message.kind) {
      case 'who-holds':
        // 只有持有者回答。**沒有人回答就是沒有人在**，而那是新分頁唯一的線索
        if (holding) post({ kind: 'holding', from: me })
        return
      case 'holding':
        stopWaiting()
        // **平手規則：兩個都宣告持有時，tabId 小的贏。**
        // 兩邊用同一個比較，所以算出來一定一致 —— 不需要再交換一輪訊息。
        if (holding && me < message.from) return
        setHolding(false)
        return
      case 'taking-over':
        // 使用者的明確意圖。**無條件讓位**，不比 tabId
        stopWaiting()
        setHolding(false)
        return
      case 'released':
        // 持有者走了 —— **立刻搶，不必再問一輪。**
        //
        // ⚠️ 這裡原本是重新走一次問答（`ask()`），理由是「否則兩個等待中的
        // 分頁會同時認定自己接手」。**突變測試證明那個理由已經不成立**：
        // 把它換成 `claim()` 之後九條判準全綠 —— 因為上面的平手規則
        // 已經涵蓋了同時宣告的情況。留著只會讓交接多等一個 `graceMs`，
        // 而 `S03` 要的是「在合理時間內取得資格」。
        //
        // **一個活下來的突變體，處置不是補測試就是拿掉多餘的路徑。**
        // 這裡是後者：那條路徑防的事情已經有人防了。而「平手規則才是真正
        // 守門的那個」有對照 —— 把它拿掉，`S03` 那條判準立刻紅。
        if (!holding) claim()
        return
    }
  }

  function ask() {
    settled = false
    post({ kind: 'who-holds', from: me })
    if (timer !== null) clearTimer(timer)
    timer = setTimer(() => {
      if (!settled) claim()
    }, graceMs)
  }

  ask()

  return {
    held: () => holding,
    takeOver() {
      stopWaiting()
      setHolding(true)
      post({ kind: 'taking-over', from: me })
    },
    release() {
      if (timer !== null) clearTimer(timer)
      timer = null
      const wasHolding = holding
      setHolding(false)
      // **讓出來的人才需要通知。** 本來就沒有資格的分頁關掉時送 `released`，
      // 會讓正在等待的分頁以為輪到自己了
      if (wasHolding) post({ kind: 'released', from: me })
      channel.close()
      listeners.clear()
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}
