'use client'

import { createContext, useCallback, useContext, useState, useSyncExternalStore, type ReactNode } from 'react'
import { BlockingPanelCoordinator } from '@/panel/BlockingPanelCoordinator'
import { createResourcesStore, type ResourcesState, type ResourcesStore } from './resourcesStore'

// 資源面板的開關與共享資源狀態的訂閱點。⚠️ 骨架，行為在下一個 commit。

export const RESOURCES_PANEL_ID = 'resources-panel' as const

export interface ResourcesPanelValue {
  readonly openFor: string | null
  readonly openPanel: (projectId: string, opener: HTMLElement | null) => boolean
  readonly closePanel: () => void
  readonly yieldPanel: () => void
  readonly store: ResourcesStore
}

const Ctx = createContext<ResourcesPanelValue | null>(null)

export function useResourcesPanel(): ResourcesPanelValue {
  const value = useContext(Ctx)
  if (value === null) throw new Error('useResourcesPanel 必須在 <ResourcesProvider> 底下使用。')
  return value
}
export function useResourcesPanelIfProvided(): ResourcesPanelValue | null {
  return useContext(Ctx)
}
export function useProjectResources(projectId: string): { state: ResourcesState; retry: () => void } {
  const { store } = useResourcesPanel()
  const getState = useCallback(() => store.getState(projectId), [store, projectId])
  const state = useSyncExternalStore(store.subscribe, getState, getState)
  return { state, retry: useCallback(() => store.read(projectId), [store, projectId]) }
}

export function ResourcesProvider({ children }: { children: ReactNode }) {
  const [store] = useState(createResourcesStore)
  return (
    <BlockingPanelCoordinator>
      <Ctx value={{ openFor: null, openPanel: () => false, closePanel: () => {}, yieldPanel: () => {}, store }}>{children}</Ctx>
    </BlockingPanelCoordinator>
  )
}
