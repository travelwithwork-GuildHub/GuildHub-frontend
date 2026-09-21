'use client'

import { createContext, useCallback, useContext, useMemo } from 'react'
import type { ProjectOut } from '@/api/contract/rest'
import { PanelHost } from '@/panel/PanelHost'
import { useInteractionIfProvided } from '@/world/interaction/InteractionProvider'
import { RESOURCES_PANEL_ID, useResourcesPanelIfProvided } from './ResourcesProvider'

// 資源面板的**掛載點**。架構同 `ProfilePanel`／`InboxPanel`（`FE-X15` design D3）：
// `PanelHost` lazy 載入內容、**世界輸入鎖在這裡注入**（鎖要在 chunk 抵達前就成立）。
//
// ⚠️ **專案由呼叫端傳進來，面板不自己 `getProject`。** 房間進場時已經讀過它，而這一片最重要的尺是
// 「403／409 之後恰好確認一次」（`S05`／`S06`）—— 面板自己再讀一次，那把尺量到的就不只是確認。
// 傳進來的那份可能是舊的，這正是 D2 那一次確認要解的事。`project` 還沒讀到是 `null`：沒有寫入控制項。

/** 面板的名字。載入殼／錯誤殼（eager）與內容（lazy）共用同一個字，不各寫一份。 */
export const RESOURCES_PANEL_TITLE = '專案資源'

export interface PanelProject {
  readonly projectId: string
  readonly project: ProjectOut | null
}
const PanelProjectContext = createContext<PanelProject | null>(null)

/** lazy 內容用：它拿不到 props（`PanelHost` 只渲染 `<Content />`），所以走 context。 */
export function usePanelProject(): PanelProject {
  const value = useContext(PanelProjectContext)
  if (value === null) throw new Error('資源面板的內容要在 <ResourcesPanel> 底下才拿得到專案。')
  return value
}

export function ResourcesPanel({ projectId, project }: PanelProject) {
  const panel = useResourcesPanelIfProvided()
  const interaction = useInteractionIfProvided()
  const closePanel = panel?.closePanel
  // 開的是**這一個**專案的面板才算（第 8 片同一個房間裡可能有兩塊看板）。
  const open = panel?.openFor === projectId

  // 真的要鎖卻沒有 `InteractionProvider` 時在 acquire 當下炸（不靜默）—— 只有「開啟」才會走到
  const lock = useMemo(
    () => ({
      acquire: () => {
        if (interaction === null) throw new Error('資源面板要在 <InteractionProvider> 底下才能鎖世界輸入。')
        return interaction.holdInputLock(RESOURCES_PANEL_ID)
      },
    }),
    [interaction],
  )
  // 穩定的 loader（直接 import、不經 barrel，否則重模組會被 eager 拉進首屏）。
  const load = useCallback(() => import('./OpenResourcesPanel'), [])
  const onExit = useCallback(() => closePanel?.(), [closePanel])
  const value = useMemo(() => ({ projectId, project }), [projectId, project])

  if (panel === null) return null
  return (
    <PanelProjectContext value={value}>
      <PanelHost open={open} panelId={RESOURCES_PANEL_ID} title={RESOURCES_PANEL_TITLE} load={load} lock={lock} onExit={onExit} />
    </PanelProjectContext>
  )
}
