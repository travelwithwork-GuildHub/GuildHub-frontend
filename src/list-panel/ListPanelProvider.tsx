'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useInteraction } from '@/world/interaction/InteractionProvider'
import type { ListKind } from './paging'

// 「現在開著哪一塊看板的面板」。規格 `FE-B01`〈走到看板前按 E，開得起對應的面板〉、
// 〈Escape 關閉面板，並把世界的輸入還回去〉。
//
// ⚠️ **開的動作在 Canvas 裡面（看板的 `onInteract`），面板本身在 Canvas 外面。**
// 兩邊要看到同一份狀態，所以這個 provider 要包住兩者 —— 跟 `InteractionProvider` 一樣。
//
// ⚠️ **必須在 `<InteractionProvider>` 底下。** 面板開著的時候要鎖住世界的移動輸入
// （`S18`），而那把鎖在互動層；沒有那一層的話這裡直接炸，不會靜默變成「面板開了人還在走」。

interface ListPanelValue {
  open: ListKind | null
  openPanel: (kind: ListKind) => void
  closePanel: () => void
}

const ListPanelContext = createContext<ListPanelValue | null>(null)

export function useListPanel(): ListPanelValue {
  const value = useContext(ListPanelContext)
  if (value === null) throw new Error('useListPanel 必須在 <ListPanelProvider> 底下使用。')
  return value
}

export function ListPanelProvider({ children }: { children: ReactNode }) {
  const { holdInputLock } = useInteraction()
  const [open, setOpen] = useState<ListKind | null>(null)
  /** 面板開著時持有的那一把；`null` = 沒持有。 */
  const releaseRef = useRef<(() => void) | null>(null)

  // 鎖跟著開關走，**同步持有**，不等 effect —— 開面板的那個 E 之後的第一個方向鍵就該被擋。
  // 面板已經開著時再開（換一塊看板）：不再持有第二把，那一把還在。
  const openPanel = useCallback(
    (kind: ListKind) => {
      releaseRef.current ??= holdInputLock('list-panel')
      setOpen(kind)
    },
    [holdInputLock],
  )
  const closePanel = useCallback(() => {
    // ⚠️ **這一行是 `FE-B01-S17`。** 少了它，關掉面板之後人走不動，要用滑鼠點一下畫面
    // —— 而只驗 `S18` 的話，「開了就永遠鎖住」是全綠的。
    // 釋放的是**自己那一把**：輸入框還有焦點時它的那一把還在（`FE-X06-S10`）。
    releaseRef.current?.()
    releaseRef.current = null
    setOpen(null)
    // 面板是按 E 開的，沒有 DOM 的開啟控制可以回去：焦點放到世界焦點錨（`FE-X06-S13`），
    // 不留在 `body`、不跑去標題列。錨是什麼元素不是這裡決定的 —— 用語意標記找。
    document.querySelector<HTMLElement>('[data-focus-anchor="world"]')?.focus()
  }, [])

  // 這一層開著的時候被卸載（例如路由切走）：不還的話世界回來時人走不動。
  useEffect(
    () => () => {
      releaseRef.current?.()
      releaseRef.current = null
    },
    [],
  )

  const value = useMemo(() => ({ open, openPanel, closePanel }), [open, openPanel, closePanel])
  return <ListPanelContext.Provider value={value}>{children}</ListPanelContext.Provider>
}
