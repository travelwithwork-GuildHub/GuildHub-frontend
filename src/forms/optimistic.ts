// 樂觀更新的回滾。規格 `FE-X05`〈樂觀更新的回滾（hook 層規則，今天沒有表單啟用）〉。
//
// 快照 → 套用 → 請求；失敗還原快照、保留提交值給重試；成功以**伺服器回的值**為準（不是 input）；
// 同一個實例一次只允許一個 in-flight（第二次 `run` 同步 resolve `in-flight`，不套用、不請求、不 throw）。

export interface OptimisticOptions<TInput, TSnapshot, TValue> {
  snapshot: () => TSnapshot
  apply: (input: TInput) => void
  request: (input: TInput) => Promise<TValue>
  restore: (snapshot: TSnapshot) => void
}

export type OptimisticResult<TInput, TValue> =
  | { ok: true; value: TValue }
  | { ok: false; reason: 'failed'; error: unknown; input: TInput }
  | { ok: false; reason: 'in-flight' }

export interface Optimistic<TInput, TValue> {
  run: (input: TInput) => Promise<OptimisticResult<TInput, TValue>>
  readonly inFlight: boolean
}

export function createOptimistic<TInput, TSnapshot, TValue>(options: OptimisticOptions<TInput, TSnapshot, TValue>): Optimistic<TInput, TValue> {
  let inFlight = false
  return {
    get inFlight() {
      return inFlight
    },
    run(input) {
      if (inFlight) return Promise.resolve({ ok: false, reason: 'in-flight' })
      inFlight = true
      const snapshot = options.snapshot()
      const failed = (error: unknown): OptimisticResult<TInput, TValue> => {
        options.restore(snapshot)
        return { ok: false, reason: 'failed', error, input }
      }
      // `apply`／`request` **同步**拋錯（request 在建出 Promise 之前就炸）也要還原、也要解鎖 —— 不然快照丟了、實例永遠 in-flight（審查抓到的）。
      let pending: Promise<TValue>
      try {
        options.apply(input)
        pending = options.request(input)
      } catch (error) {
        inFlight = false
        return Promise.resolve(failed(error))
      }
      return pending
        .then((value): OptimisticResult<TInput, TValue> => ({ ok: true, value }))
        .catch(failed)
        .finally(() => {
          inFlight = false
        })
    },
  }
}
