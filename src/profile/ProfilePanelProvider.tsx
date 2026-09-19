'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

// 「我的名片」面板現在開著沒有。規格 `FE-A04`〈名字是入口，面板是阻斷式的〉；design `D1`（修正後）。
//
// ⚠️ **這個 provider 只管兩件事：開關狀態、關閉後焦點回開啟者。** 世界輸入鎖**不在這裡** ——
// 它在 `InteractionProvider`，而那一層在 `WorldCanvas` 裡面、標題列（開啟按鈕）在外面，一個 provider 沒辦法同時被兩邊看到。
// 鎖由 `ProfilePanel` 自己在掛載時持有（它渲染在 `WorldCanvas` 裡）。
//
// ⚠️ **不放進 `ListPanelProvider`。** 那是看板清單的狀態（`FE-B01`／`FE-B09`，還有網址同步）；名片面板不在網址裡，也不是清單。
//
// 掛在 `page.tsx`：`IdentityProvider` 底下、標題列與 `WorldBoundary` 之上。

interface ProfilePanelValue {
  open: boolean
  /** 開面板。`opener` 是按下去的那個元素 —— 關閉後焦點回它（`S02`）。 */
  openPanel: (opener: HTMLElement | null) => void
  closePanel: () => void
}

const ProfilePanelContext = createContext<ProfilePanelValue | null>(null)

export function useProfilePanel(): ProfilePanelValue {
  const value = useContext(ProfilePanelContext)
  // **明顯失敗，不要回一個空的預設值。** 回預設值的話，忘了包 provider 的症狀是「按名字沒反應」。
  if (value === null) throw new Error('useProfilePanel 必須在 <ProfilePanelProvider> 底下使用。')
  return value
}

/**
 * 面板本體用的：沒有 provider 就回 `null`、面板不掛。**不是靜默失敗** —— 沒有 provider 的樹裡也沒有開啟按鈕
 * （`IdentityBadge` 用的是會 throw 的那個），面板本來就開不起來；`WorldCanvas` 單獨渲染（很多既有測試）不必為它包一層。
 */
export function useProfilePanelIfProvided(): ProfilePanelValue | null {
  return useContext(ProfilePanelContext)
}

export function ProfilePanelProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const openerRef = useRef<HTMLElement | null>(null)
  const restoreFocusRef = useRef(false)

  const openPanel = useCallback((opener: HTMLElement | null) => {
    openerRef.current = opener
    setOpen(true)
  }, [])
  const closePanel = useCallback(() => {
    restoreFocusRef.current = true
    setOpen(false)
  }, [])
  // 焦點回開啟它的按鈕（`S02`）：不是 `body`（鍵盤使用者迷航）、不是世界焦點錨（這次操作跟世界無關）。
  // **等面板真的卸載之後**才還（effect，不在 closePanel 裡同步做）：面板還掛著時 focus trap 還在，同步 focus 出去可能被拉回來（審查抓到的）。
  // 記的是元素不是 `document.activeElement`：Safari 點按鈕不會給它焦點。
  useEffect(() => {
    if (open || !restoreFocusRef.current) return
    restoreFocusRef.current = false
    const opener = openerRef.current
    openerRef.current = null
    if (opener?.isConnected) opener.focus()
  }, [open])

  const value = useMemo(() => ({ open, openPanel, closePanel }), [open, openPanel, closePanel])
  return <ProfilePanelContext value={value}>{children}</ProfilePanelContext>
}
