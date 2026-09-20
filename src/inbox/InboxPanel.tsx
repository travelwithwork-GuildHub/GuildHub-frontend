'use client'

import { useCallback, useMemo } from 'react'
import { PanelHost } from '@/panel/PanelHost'
import { useInteractionIfProvided } from '@/world/interaction/InteractionProvider'
import { useInboxIfProvided } from './InboxPanelProvider'

// 收件匣面板的**掛載點**。規格 `FE-K01`；`FE-X15` --panel-inbox（design D3）：
// 改用 `PanelHost` lazy 載入內容（`OpenInboxPanel`：操作邏輯＋面板 UI，import 訊息 API）、**世界輸入鎖上移到 host**。
//
// 渲染在 `WorldCanvas` 裡（`InteractionProvider` 底下）—— host 的世界輸入鎖從這裡拿。
// 「開不開」在協調者（`useActivePanel() === 'inbox-panel'`，由 `view.kind !== 'closed'` 推導）＋要有 `me`（訪客沒有信）。
// 內容重模組在開啟意圖成立後才 import（S04）。沒有 provider（`WorldCanvas`／`BoardPanel` 單獨渲染的既有測試）：沒有入口，面板不存在。

const TITLE = { list: '收件匣', thread: '對話' }

export function InboxPanel() {
  const inbox = useInboxIfProvided()
  const interaction = useInteractionIfProvided()
  const view = inbox?.view ?? { kind: 'closed' as const }
  const open = view.kind !== 'closed' && (inbox?.me ?? null) !== null
  const closePanel = inbox?.closePanel

  // 注入給 host 的世界輸入鎖：open 當下 host 呼叫 `acquire()`（chunk 抵達前就鎖，S04）。
  // 真的要鎖卻沒有 `InteractionProvider` 時在 acquire 當下炸（不靜默）—— 但只有「開啟」才會走到，關著不炸。
  const lock = useMemo(
    () => ({
      acquire: () => {
        if (interaction === null) throw new Error('收件匣面板要在 <InteractionProvider> 底下才能鎖世界輸入。')
        return interaction.holdInputLock('inbox-panel')
      },
    }),
    [interaction],
  )
  // 穩定的 loader（`import()` 直接指到 lazy 模組、不經 barrel）：不 memo 的話每次 render 都是新函式，host 的載入 effect 會反覆重跑。
  const load = useCallback(() => import('./OpenInboxPanel'), [])
  const onExit = useCallback(() => closePanel?.(), [closePanel])

  if (inbox === null) return null
  return <PanelHost open={open} panelId="inbox-panel" title={view.kind === 'thread' ? TITLE.thread : TITLE.list} load={load} lock={lock} onExit={onExit} />
}
