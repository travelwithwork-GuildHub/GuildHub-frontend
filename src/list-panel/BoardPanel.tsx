'use client'

import { useCallback } from 'react'
import { PanelHost } from '@/panel/PanelHost'
import type { ListKind } from './paging'
import { useListPanel } from './ListPanelProvider'

// 兩塊看板的**掛載點**：從 `ListPanelProvider` 讀「開著哪一塊」，把重內容（`BoardPanelContent`）交給 `PanelHost` lazy 載入。
// 規格 `FE-B01`〈走到看板前按 E，開得起對應的面板〉、`FE-X15`〈面板按開啟意圖才載入，載入殼立即接管〉（S04／S06；design D3）。
//
// ⚠️ **這個檔案要 eager（進首屏 chunk）**：它只 import `PanelHost` 與 provider，看板重模組（表單／詳情／卡片⋯⋯）走
// `() => import('./BoardPanelContent')` 動態載入，開啟意圖成立前不請求。**不得**靜態 import `BoardPanelContent`，否則整包被拉進首屏。
//
// ⚠️ **世界輸入鎖不在這裡、也不經 host**：看板的鎖由 eager 的 `ListPanelProvider` 持有（綁開啟意圖、早於 chunk）——
// 所以這裡不傳 `lock` 給 `PanelHost`（名片是 host 持鎖，看板不是）。chunk 失敗時錯誤殼的「回到世界」＝ `closePanel`，
// 那條路徑會 `requestClose`＋清 route → provider 的鎖跟著放（阻斷式面板：錯誤殼顯示中世界仍鎖，直到使用者離開）。

/** 兩塊看板的標題（載入殼與 `ListPanel` 都用；`BoardPanelContent` 從這裡 import 以免靜態把內容拉進首屏）。 */
export const TITLES: Record<ListKind, string> = { projects: '專案看板', profiles: '人才看板' }
/** 案件看板的視圖切換（`FE-J03`）：兩顆 `aria-pressed` 的次要鈕，只給已登入的人。內容在 `BoardPanelContent`，這裡 export 給測試與內容共用。 */
export const BOARD_VIEW_LABELS = { group: '看板視圖', recruiting: '招募中', mine: '我的案件' } as const

export function BoardPanel() {
  const { open, closePanel } = useListPanel()
  const load = useCallback(() => import('./BoardPanelContent'), [])
  const onExit = useCallback(() => closePanel(), [closePanel])
  // `open` 是 `ListKind | null`：非空即「有開啟意圖」（走近按 E／深連結）。host 只在 `open` 時載入殼＋呼叫 `load`。
  // 不傳 `lock`：看板鎖在 `ListPanelProvider`。載入殼／錯誤殼的標題顯示是哪一塊看板正在載。
  return <PanelHost open={open !== null} panelId="list-panel" title={open === null ? '' : TITLES[open]} load={load} onExit={onExit} />
}
