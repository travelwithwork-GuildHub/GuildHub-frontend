'use client'

import { createContext, useContext } from 'react'
import type { ProjectOut } from '@/api/contract/rest'

// 資源面板的掛載點（`PanelHost` ＋ 世界輸入鎖）。⚠️ 骨架，行為在下一個 commit。

export const RESOURCES_PANEL_TITLE = '專案資源'

export interface PanelProject {
  readonly projectId: string
  readonly project: ProjectOut | null
}
const PanelProjectContext = createContext<PanelProject | null>(null)

export function usePanelProject(): PanelProject {
  const value = useContext(PanelProjectContext)
  if (value === null) throw new Error('資源面板的內容要在 <ResourcesPanel> 底下才拿得到專案。')
  return value
}

export function ResourcesPanel(_props: PanelProject) {
  void PanelProjectContext
  return null
}
