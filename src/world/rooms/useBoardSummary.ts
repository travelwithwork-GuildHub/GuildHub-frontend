'use client'

import { useEffect, useState } from 'react'
import { fetchListPage, type ListItemOf } from '@/list-panel/useListPage'
import type { ListKind } from '@/list-panel/paging'
import { POLL_INTERVAL_MS } from './useRooms'

// 世界看板摘要的常駐資料（`FE-W20`，design D1）：進 Guild Hall 抓 page 0、每 30 秒輪詢、分頁隱藏停／可見立即重取、
// 單一在飛請求、失敗保留舊的（stale）、離場中止。**跟面板的 `useListPage` 各自獨立**（各自 fetch，不共享訂閱）——
// 看板要在面板關著時也活著（D1）。輪詢的骨架跟 `useRooms`（走廊門）同一套；頻率沿用它的 `POLL_INTERVAL_MS`（同一份，不另定）。
//
// ⚠️ **元件不自己 `fetch`**（`CLAUDE.md`）—— 走 `fetchListPage`（種類→端點的對應只有 `useListPage` 那一份，D1／不漂）。
// ⚠️ **只回 page 0 的前 `BOARD_SUMMARY_COUNT` 筆**：看板只表達第一頁前幾筆（N=4，對齊 mesh 卡槽，design D4）；翻頁是按 E 開面板的事。
// ⚠️ **輪詢不是繼承來的**（`FE-W12` 同一條）：REST 輪詢的生命週期由本 change 自己訂，跟 render loop／WS 分開。

/** 看板摘要顯示第一頁的前幾筆。**4** 對齊看板 mesh 上既有的 4 個卡槽（design D4）。要改是 Requirement 變更，不是調這個常數。 */
export const BOARD_SUMMARY_COUNT = 4

export type BoardSummaryStatus =
  /** 第一次請求還沒回來。沒有舊資料可留 —— 看板畫骨架卡（`FE-W20-S06`）。 */
  | 'loading'
  /** 有資料、而且是最新的。`items` 空陣列代表「page 0 零筆」＝空的（`FE-W20-S04`）。 */
  | 'ready'
  /** 有資料、但最近一次輪詢失敗了。舊的留著 —— 一次網路抖動不該讓看板閃成空白（`FE-W20-S05`）。 */
  | 'stale'
  /** 第一次請求就失敗，什麼都沒有 —— 看板畫讀不到（`FE-W20-S05`）。 */
  | 'failed'

export interface BoardSummary<K extends ListKind> {
  readonly status: BoardSummaryStatus
  /** page 0 的前 `BOARD_SUMMARY_COUNT` 筆；`failed` 時是空的、`stale` 時是上一次成功的那幾筆。 */
  readonly items: readonly ListItemOf[K][]
  /** `failed` 時的原因（給 `toUiError` 取語彙用）；其餘狀態是 null。 */
  readonly error: unknown
}

const EMPTY: readonly never[] = []

/**
 * 取一塊看板的摘要資料。
 *
 * @param kind 'projects'（專案看板）或 'profiles'（人才看板）—— 決定打哪個端點（`fetchListPage`）。
 * @param enabled 只有 Guild Hall 有看板（`FE-V01`）。`false` 時**不打、不輪詢**，回一個 `loading`／空的 ——
 *   房間裡每 30 秒打一次是白打的。它是參數不是條件式呼叫：hook 的順序要穩定。從 `false` 變回 `true` 立即重取。
 */
export function useBoardSummary<K extends ListKind>(kind: K, enabled = true): BoardSummary<K> {
  const [status, setStatus] = useState<BoardSummaryStatus>('loading')
  const [items, setItems] = useState<readonly ListItemOf[K][]>(EMPTY)
  const [error, setError] = useState<unknown>(null)

  useEffect(() => {
    if (!enabled) return undefined
    // 進行中的那一次：同時是「單一飛行」的鎖與「中止」的把手（`useRooms` 的教訓 —— 拆成 boolean＋controller 會漂）。
    let inFlight: AbortController | null = null
    let timer: ReturnType<typeof setInterval> | null = null

    const load = () => {
      if (inFlight !== null) return // 同一時間最多一個在飛
      const controller = new AbortController()
      inFlight = controller
      fetchListPage(kind, 0, controller.signal)
        .then((page0) => {
          // 中止同時擋掉：切背景、卸載、離場、以及晚到的舊回應 —— 都走中止這一條（`useRooms` 同一條，不另加 mounted 旗標）。
          if (controller.signal.aborted) return
          setItems(page0.slice(0, BOARD_SUMMARY_COUNT))
          setError(null)
          setStatus('ready')
        })
        .catch((cause: unknown) => {
          if (controller.signal.aborted) return // 中止不是失敗
          setError(cause)
          // 有舊資料就退到 stale，不把摘要清掉（`FE-W20-S05`）。
          setStatus((current) => (current === 'loading' || current === 'failed' ? 'failed' : 'stale'))
        })
        .finally(() => {
          if (inFlight === controller) inFlight = null
        })
    }

    const start = () => {
      if (timer === null) timer = setInterval(load, POLL_INTERVAL_MS)
    }
    const stop = () => {
      if (timer !== null) clearInterval(timer)
      timer = null
    }
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        // 中止在飛的、停輪詢：只標記「不要結果」的話請求還在飛，回到可見的立即重取會讓兩個並存（`FE-W12-S24`）。
        inFlight?.abort()
        inFlight = null
        stop()
        return
      }
      load()
      start()
    }

    load()
    start()
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      // 卸載／離場一定中止：`/world` 會被離開，週期 30 秒 —— 「離開時剛好有請求在飛」是常態。
      inFlight?.abort()
      inFlight = null
      stop()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [kind, enabled])

  if (!enabled) return { status: 'loading', items: EMPTY, error: null }
  return { status, items, error }
}
