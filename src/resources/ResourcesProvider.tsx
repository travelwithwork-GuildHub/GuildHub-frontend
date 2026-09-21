'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { BlockingPanelCoordinator, useActivePanel, useBlockingPanels } from '@/panel/BlockingPanelCoordinator'
import { createResourcesStore, type ResourcesState, type ResourcesStore } from './resourcesStore'

// 資源面板開著沒有（開的是**哪一個專案**的），以及共享資源狀態的訂閱點（design `D1`）。
//
// ⚠️ **「開不開」在協調者**（`FE-X16`）：`openFor` ＝ `active === 'resources-panel'` 時記著的那個 `project_id`；
// 這裡只管「是哪一個專案」與關閉後的焦點。讓位不還焦點。**世界輸入鎖不在這裡** —— 在 `ResourcesPanel`
// 注入給 `PanelHost`（鎖要在 lazy chunk 抵達前就成立）。
// ⚠️ store 放在 provider 不放模組層：模組層的單例會跨測試、跨路由殘留（回大廳再進來要重讀）。

export const RESOURCES_PANEL_ID = 'resources-panel' as const

export interface ResourcesPanelValue {
  /** 面板開著的是哪一個專案；`null` ＝ 沒開。 */
  readonly openFor: string | null
  /** `opener` 是按下去的那個元素 —— 關閉後焦點回它。被協調者拒絕時回 `false`。 */
  readonly openPanel: (projectId: string, opener: HTMLElement | null) => boolean
  readonly closePanel: () => void
  /** 被協調者讓位：不還焦點（新面板自己取焦）。 */
  readonly yieldPanel: () => void
  readonly store: ResourcesStore
}

const Ctx = createContext<ResourcesPanelValue | null>(null)

/** **明顯失敗，不回空的預設值**：回預設值的話，忘了包 provider 的症狀是「按 E 沒反應」。 */
export function useResourcesPanel(): ResourcesPanelValue {
  const value = useContext(Ctx)
  if (value === null) throw new Error('useResourcesPanel 必須在 <ResourcesProvider> 底下使用。')
  return value
}
/** 掛載點用的：沒有 provider 就回 `null`、面板不掛（那種樹裡也沒有入口）。 */
export function useResourcesPanelIfProvided(): ResourcesPanelValue | null {
  return useContext(Ctx)
}
/** 某個專案的資源狀態＋使用者按的重試。看板（第 8 片）與面板讀的是同一份。 */
export function useProjectResources(projectId: string): { state: ResourcesState; retry: () => void } {
  const { store } = useResourcesPanel()
  const getState = useCallback(() => store.getState(projectId), [store, projectId])
  const state = useSyncExternalStore(store.subscribe, getState, getState)
  return { state, retry: useCallback(() => store.read(projectId), [store, projectId]) }
}

export function ResourcesProvider({ children }: { children: ReactNode }) {
  return (
    <BlockingPanelCoordinator>
      <ResourcesPanelState>{children}</ResourcesPanelState>
    </BlockingPanelCoordinator>
  )
}

function ResourcesPanelState({ children }: { children: ReactNode }) {
  const { requestOpen, requestClose } = useBlockingPanels()
  const [store] = useState(createResourcesStore)
  const active = useActivePanel() === RESOURCES_PANEL_ID
  const [projectId, setProjectId] = useState<string | null>(null)
  const openerRef = useRef<HTMLElement | null>(null)
  const restoreFocusRef = useRef(false)

  const openPanel = useCallback(
    (id: string, opener: HTMLElement | null) => {
      if (!requestOpen(RESOURCES_PANEL_ID)) return false
      setProjectId(id)
      openerRef.current = opener
      store.openRead(id) // 讀取的時機之一：面板每一次開啟（第一次跟看板共用，store 決定）
      return true
    },
    [requestOpen, store],
  )
  const closePanel = useCallback(() => {
    restoreFocusRef.current = true
    requestClose(RESOURCES_PANEL_ID)
  }, [requestClose])
  const yieldPanel = useCallback(() => {
    restoreFocusRef.current = false
    openerRef.current = null
  }, [])

  // 焦點回開啟它的那個元素（`S21`）。**等面板真的卸載之後**才還：還掛著時 focus trap 會把焦點拉回來。
  const open = active && projectId !== null
  useEffect(() => {
    if (open || !restoreFocusRef.current) return
    restoreFocusRef.current = false
    const opener = openerRef.current
    openerRef.current = null
    if (opener?.isConnected) opener.focus()
  }, [open])

  const value = useMemo(
    () => ({ openFor: open ? projectId : null, openPanel, closePanel, yieldPanel, store }),
    [open, projectId, openPanel, closePanel, yieldPanel, store],
  )
  return <Ctx value={value}>{children}</Ctx>
}
