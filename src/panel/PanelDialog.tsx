'use client'

import { createContext, useContext, useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

// 確認視窗的層（規格 `FE-X16-S06`）：蓋在面板**內容區**上的遮罩（`scrim` token，alpha 在 [0.3, 0.6]）＋視窗本身；
// 標題列不被蓋。被遮的內容區由殼標成 `inert`（殼看 `setOpen`）。
//
// 為什麼是 portal 而不是「呼叫端把視窗放進殼的 `overlay`」：結案確認住在詳情深處（`OwnerActions`），放棄修改確認住在表單旁邊 ——
// 它們各自的父層都不是殼；要蓋住整個內容區、讓內容區 inert，只有殼做得到。視窗元件只要包一層 `<PanelDialog>`。
//
// 沒有殼（單獨渲染元件的測試）就原地渲染、沒有遮罩：視窗自己的 Escape 層與焦點行為都不變。

export interface DialogHost {
  host: HTMLElement | null
  setOpen: (open: boolean) => void
}

export const DialogHostContext = createContext<DialogHost | null>(null)

export function PanelDialog({ children }: { children: ReactNode }) {
  const ctx = useContext(DialogHostContext)
  const setOpen = ctx?.setOpen
  useEffect(() => {
    setOpen?.(true)
    return () => setOpen?.(false)
  }, [setOpen])
  if (ctx === null || ctx.host === null) return children
  return createPortal(
    <div data-testid="panel-scrim" className="bg-scrim absolute inset-0 z-20 flex items-start justify-center overflow-y-auto p-gutter">
      {children}
    </div>,
    ctx.host,
  )
}
