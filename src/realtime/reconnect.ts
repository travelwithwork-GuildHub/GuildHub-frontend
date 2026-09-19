// 重連的退避與排程。規格 `FE-R12`〈重連的等待時間是指數退避加 full jitter〉〈單一迴圈〉（design D1、D5；ADR 0013）。
//
// **這裡沒有 React、沒有 client、沒有 socket** —— 它只回答「第 n 次要等多久」與「現在有沒有一個在等」。
// 誰建連線、什麼情況下該放棄（過場中、場景換了）是 `RemoteWorld` 的事；這裡的 `run` 是它給的。
//
// 時間與亂數都可注入：判準用假計時器、固定亂數，不靠 `Math.random` 的機率。

/** 基數：第 0 次的上界。 */
export const RECONNECT_BASE_MS = 1_000
/** 封頂：不管第幾次，等待不超過這個數（後端重啟量到約 30～60 秒，這讓迴圈在它回來後 ≤30 秒內敲到）。 */
export const RECONNECT_CAP_MS = 30_000

/**
 * full jitter（AWS）：`r × min(cap, base × 2^attempt)`，`r ∈ [0, 1)`。
 *
 * `2 ** attempt` 在 attempt 很大時是 `Infinity`，`min` 之後仍是 `cap` —— 不會變 NaN。
 */
export function backoffDelay(attempt: number, random: () => number, base = RECONNECT_BASE_MS, cap = RECONNECT_CAP_MS): number {
  return random() * Math.min(cap, base * 2 ** attempt)
}

export interface ReconnectSchedule {
  /**
   * 排一次重連：等 `backoffDelay(attempt)` 之後跑 `run`。
   * **已經有一個在等就什麼都不做**（舊 socket 重複的 close、遲到的事件都會走到這裡 —— 單一迴圈靠這一條）。
   * `run` 跑之前 `attempt` 已經 +1，所以 `run` 裡失敗再 `schedule()` 用的是下一次的等待。
   */
  readonly schedule: (run: () => void) => void
  /** 連線 `ready` 了：下一次斷線從第 0 次算。 */
  readonly reset: () => void
  /** 取消等待中的那一次（卸載、換場景、失去資格）。幂等。**不**歸零 attempt —— 那是 ready 的事。 */
  readonly cancel: () => void
  /** 下一次是第幾次（從 0 起算）。 */
  readonly attempt: number
  /** 有沒有一個在等。 */
  readonly pending: boolean
}

export interface ReconnectScheduleOptions {
  readonly random?: () => number
  readonly baseMs?: number
  readonly capMs?: number
  /** 預設用全域的計時器（假計時器換掉全域就換掉這裡 —— 呼叫時才取，不在 import 時綁住）。 */
  readonly setTimeout?: (fn: () => void, ms: number) => unknown
  readonly clearTimeout?: (handle: unknown) => void
}

export function createReconnectSchedule(options: ReconnectScheduleOptions = {}): ReconnectSchedule {
  const random = options.random ?? Math.random
  const base = options.baseMs ?? RECONNECT_BASE_MS
  const cap = options.capMs ?? RECONNECT_CAP_MS
  const setTimer = options.setTimeout ?? ((fn, ms) => globalThis.setTimeout(fn, ms))
  const clearTimer = options.clearTimeout ?? ((handle) => globalThis.clearTimeout(handle as ReturnType<typeof globalThis.setTimeout>))
  let attempt = 0
  let handle: unknown = null
  const api = {
    schedule(run: () => void) {
      if (handle !== null) return
      handle = setTimer(() => {
        handle = null
        attempt += 1
        run()
      }, backoffDelay(attempt, random, base, cap))
    },
    reset() {
      attempt = 0
    },
    cancel() {
      if (handle === null) return
      clearTimer(handle)
      handle = null
    },
    get attempt() {
      return attempt
    },
    get pending() {
      return handle !== null
    },
  }
  return api
}
