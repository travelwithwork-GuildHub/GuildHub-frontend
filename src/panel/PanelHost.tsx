'use client'

import { useEffect, useState, type ComponentType } from 'react'
import { PanelErrorShell } from './PanelErrorShell'
import { PanelLoadingShell } from './PanelLoadingShell'

// 阻斷式面板的通用 host（FE-X15-S04／S06；design D3）。三個面板（看板／名片／收件匣）共用它。
//
// 一句話：**開啟意圖成立才載重模組**；載入前那段空窗立即鎖世界輸入、接管焦點、顯示面板形載入殼；
// chunk 到達原位換內容；chunk 失敗釋放鎖與焦點、換可重試的錯誤殼（人不被困）。
//
// 三個刻意的設計（codex 審查）：
//  1. `load` 就是 production 介面（`() => import('...')`，**直接 import、不經 barrel**，否則會被 eager 拉進首屏）。
//     測試把它換成可控 promise —— 不另做一套 test-only 注入。
//  2. **鎖用注入、不寫死**：名片要 host 持鎖、看板已由 `ListPanelProvider` 持鎖（不傳 `lock`）、收件匣 host 持鎖。
//  3. **自己管 dynamic import（不用 `React.lazy`）**：`React.lazy` 會把 rejected 的 promise **永久快取**，
//     重試永遠拿到同一個失敗（`WorldBoundary` 那課）；而且 `lazy()` 寫在 render 裡會被 `react-hooks/static-components` 擋。
//     手動 `import()` 失敗不進 module map，重試（`attempt`＋1）會真的重抓。
//
// 狀態用**衍生**而非在 effect 裡 setState：結果帶著它屬於哪一輪 `attempt`，`attempt` 一變（重試／重開）
// 舊結果自動失效 → 回到載入態。setState 只出現在 `load()` 的 then／catch（資料抓取的正常型態），effect 本體不 setState。

type Loaded = { attempt: number; kind: 'ready'; Content: ComponentType } | { attempt: number; kind: 'error' }

export interface PanelHostProps {
  /** 開不開＝協調者的 active panel（呼叫端算好傳進來）。 */
  open: boolean
  /** 載入殼／錯誤殼的 `data-testid` 與 aria 前綴。 */
  panelId: string
  /** 面板名（載入殼與錯誤殼顯示）。 */
  title: string
  /** 面板重模組載入器。host 只在 `open` 之後才呼叫（S04：開啟意圖前零請求）。 */
  load: () => Promise<{ default: ComponentType }>
  /**
   * 世界輸入鎖（注入）：`open` 且非錯誤態時呼叫 `acquire()` 立即鎖、回傳的 cleanup 在關閉／卸載／載入失敗時釋放（S06）。
   * 不傳＝host 不持鎖。
   */
  lock?: { acquire: () => () => void }
  /** 回到世界（取消載入、錯誤後離開）：呼叫端關掉這個面板。 */
  onExit: () => void
}

export function PanelHost({ open, panelId, title, load, lock, onExit }: PanelHostProps) {
  const [attempt, setAttempt] = useState(0)
  const [loaded, setLoaded] = useState<Loaded | null>(null)

  // 載入：`open` 成立才呼叫 `load`（S04）。`attempt` 進 deps → 重試重抓。
  // 過期回應（關閉／再開／重試後）用 `alive` 丟掉，不搶著 setState（idempotent：過期 promise resolve 後不得偷換內容）。
  useEffect(() => {
    if (!open) return
    let alive = true
    const mine = attempt
    load()
      .then((mod) => {
        if (alive) setLoaded({ attempt: mine, kind: 'ready', Content: mod.default })
      })
      .catch(() => {
        if (alive) setLoaded({ attempt: mine, kind: 'error' })
      })
    return () => {
      alive = false
    }
  }, [open, load, attempt])

  // 只認「這一輪 attempt」的結果；attempt 一變舊結果失效 → 回載入態（不必在 effect 裡 setState）。
  const current = loaded !== null && loaded.attempt === attempt ? loaded : null
  const errored = current?.kind === 'error'

  // 世界輸入鎖：`open` 且不在錯誤態時持有；錯誤／關閉／卸載釋放（S06）。只依 `shouldLock` 布林 →
  // `loading→ready` 之間鎖**連續持有**、不 release+re-acquire（否則世界輸入會閃一格解鎖）；`error→loading`（重試）重新鎖。
  const shouldLock = open && !errored
  useEffect(() => {
    if (!shouldLock || lock === undefined) return
    return lock.acquire()
  }, [shouldLock, lock])

  if (!open) return null
  if (current === null) return <PanelLoadingShell panelId={panelId} title={title} onCancel={onExit} />
  if (current.kind === 'error') {
    return <PanelErrorShell panelId={panelId} title={title} onRetry={() => setAttempt((n) => n + 1)} onExit={onExit} />
  }
  const Content = current.Content
  return <Content />
}
