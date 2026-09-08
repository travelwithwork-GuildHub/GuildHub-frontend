import { toProtocol, type ProtocolPoint, type WorldPoint } from '@/world/coords'

// 自己的位置什麼時候送出去。規格 FE-R03。
//
// ⚠️ **這個模組是純的：它不知道 WebSocket 的存在。** 它只回答
// 「這一幀該不該送、送什麼」。真的送出去、以及「送成功了」這件事，
// 由呼叫端負責告訴它。
//
// 三件事在這裡決定，而它們各自的失敗都是無聲的：
//   送太快    後端沒有 rate limit（BE-G16），不會有人告訴你
//   送浮點    協定的 x／y 是 StrictInt，**整則訊息被靜默丟棄**
//   重複送    同一個整數像素送兩次，後端也只是丟掉

/**
 * 兩次送出之間至少要隔多久。
 *
 * **來自後端的 `HZ = 10`**（`protocol.py` 的常數，不可設定）。
 * 送得比它快，多出來的每一則都是浪費 —— 而且**沒有任何東西會擋** 。
 */
export const SEND_INTERVAL_MS = 100

export interface SyncState {
  /**
   * 上次**成功送出**的協定座標。
   *
   * ⚠️ **存的是取整後的兩個數字，不是 Three 的 `Vector3`。**
   * 存物件的話它會被下一幀就地改寫，比對永遠相等 —— 於是永遠不送。
   */
  lastSent: ProtocolPoint | null
  /** 距離上次成功送出過了多久（毫秒）。 */
  sinceLastSend: number
}

export function createSyncState(): SyncState {
  return { lastSent: null, sinceLastSend: SEND_INTERVAL_MS }
}

/**
 * 重置。**換連線的時候一定要呼叫。**
 *
 * 不重置的話，新連線的第一個位置可能被跳過 —— 如果它剛好跟舊連線最後送出的
 * 那一筆相同，去重會判定「沒有變」。而那個症狀是「換場景之後別人看不到我」。
 *
 * `sinceLastSend` 設成已經滿足節流：新連線 `ready` 之後**可以立刻送**第一個位置，
 * 不必再等 100 毫秒。
 */
export function resetSync(state: SyncState): void {
  state.lastSent = null
  state.sinceLastSend = SEND_INTERVAL_MS
}

/**
 * 推進時間，算出這一幀該送什麼。回 `null` 代表不送。
 *
 * 順序本身就是規格：
 *
 *   讀世界座標 → 取整 → 跟「上次成功送出的」比 → 不同且節流滿足 → 送
 *
 * ⚠️ **取整之後才比對，不是之前。** 同一個像素內的浮點漂移對後端與遠端
 * 來說是同一點；在取整前比對會讓物理引擎的微小抖動變成每幀一則訊息。
 *
 * ⚠️ **卡頓造成多幀落後時只送最新的一筆。** 這個函式每次都從「現在的座標」
 * 算，所以中間那些位置自然不會被補送 —— 補送它們只會讓遠端看到一段
 * 已經過去的移動。
 */
export function planSend(state: SyncState, world: WorldPoint, dtMs: number): ProtocolPoint | null {
  state.sinceLastSend += dtMs

  const point = toProtocol(world)
  if (state.lastSent !== null && point.x === state.lastSent.x && point.y === state.lastSent.y) {
    return null
  }
  if (state.sinceLastSend < SEND_INTERVAL_MS) return null
  return point
}

/**
 * 真的送出去之後才呼叫。
 *
 * ⚠️ **沒送成功就不可以呼叫。** 在連線還沒 `ready` 的時候更新
 * `lastSent`，那個位置會被永遠跳過 —— 而且是無聲的。
 */
export function markSent(state: SyncState, point: ProtocolPoint): void {
  state.lastSent = point
  state.sinceLastSend = 0
}
