// 閉環的接力狀態。規格 `FE-O08`〈閉環的每一步都對照期望表〉：
// 「前置步驟失敗時，依賴它的步驟 SHALL 以 `blocked: <前置 key>` 開頭的訊息失敗 —— 不得假裝通過、也不得消失」。
//
// 訊息裡的 key 是**根因**，不是直接前置（`S04`：form-team 紅的時候，seats-empty 靠 enter、enter 靠 form-team，
// 報告要說 `blocked: form-team`，不是 `blocked: enter`）。被擋的步驟自己記下根因，讓再下一步接著往上指。
// 一步自己的斷言紅了（不是被擋）就什麼都不記：它就是根因。

export class Relay {
  private readonly passed = new Set<string>()
  private readonly blockedBy = new Map<string, string>()

  /** 跑 `key`：前置有一個沒過就丟 `blocked: <根因>`；`fn` 過了才算 `key` 過。 */
  async run(key: string, deps: readonly string[], fn: () => Promise<void>): Promise<void> {
    for (const dep of deps) {
      if (this.passed.has(dep)) continue
      const root = this.blockedBy.get(dep) ?? dep
      this.blockedBy.set(key, root)
      throw new Error(`blocked: ${root}`)
    }
    try {
      await fn()
    } catch (err) {
      // 步驟自己丟的 `blocked: x`（例如共用狀態少了一塊）也記進來，後面的步驟才追得到根因，不會斷在這一步。
      const m = /^blocked: (\S+)/.exec(err instanceof Error ? err.message : String(err))
      if (m?.[1]) this.blockedBy.set(key, this.blockedBy.get(m[1]) ?? m[1])
      throw err
    }
    this.passed.add(key)
  }
}
