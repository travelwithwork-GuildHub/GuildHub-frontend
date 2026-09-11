'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
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
  const { inputLockRef } = useInteraction()
  const [open, setOpen] = useState<ListKind | null>(null)

  // 鎖跟著開關走，**同步寫**，不等 effect —— 開面板的那個 E 之後的第一個方向鍵就該被擋。
  const openPanel = useCallback(
    (kind: ListKind) => {
      inputLockRef.current = true
      setOpen(kind)
    },
    [inputLockRef],
  )
  const closePanel = useCallback(() => {
    // ⚠️ **這一行是 `S17`。** 少了它，關掉面板之後人走不動，要用滑鼠點一下畫面
    // —— 而只驗 `S18` 的話，「開了就永遠鎖住」是全綠的。
    inputLockRef.current = false
    setOpen(null)
  }, [inputLockRef])

  // 這一層開著的時候被卸載（例如路由切走）：鎖是共用的，不還的話世界回來時人走不動。
  useEffect(() => () => void (inputLockRef.current = false), [inputLockRef])

  const value = useMemo(() => ({ open, openPanel, closePanel }), [open, openPanel, closePanel])
  return <ListPanelContext.Provider value={value}>{children}</ListPanelContext.Provider>
}
