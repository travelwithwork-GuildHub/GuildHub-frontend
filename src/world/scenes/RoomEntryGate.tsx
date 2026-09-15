'use client'

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { EntryGateProvider } from './EntryGate'

// 正式的門禁。規格 `FE-N08`〈沒有票時，門前按 E 開的是這間房的 DOM 密碼視窗〉（design D1）。
//
// 它只做一件事：把 `EntryGate` 預留的 `needsToken(projectId, title)` 接成「開這間房的密碼視窗」。
// 開關狀態在這裡（provider 在 `page.tsx`，`SceneProvider` 底下、`InteractionProvider` 外面）；
// 視窗本身（`RoomPasswordDialog`）渲染在 `WorldCanvas` 裡 —— 鎖與焦點錨都在那邊。**不新增任何 E 的監聽**：
// 門、互動範圍、鍵盤重複的去重都是既有的（`FE-V01`／`FE-W12`），這裡只是被叫到。
//
// 同一扇門再叫一次（按住 E 的重複事件穿過去重、或第二次按鍵）：**不換物件**，視窗不重建、欄位不重置（`S01`）。
// 換一扇門：換成那間房（視窗以 `projectId` 為 key 重掛 → 欄位重來）。

export interface RoomEntryRequest {
  projectId: string
  /** 房間標題；深連結／上一頁那條路可能沒有（`S11`，`FE-N08` 的重試片才會送 `null` 進來）。 */
  title: string | null
}

interface RoomEntryGateValue {
  request: RoomEntryRequest | null
  /** 開視窗（門禁的 `needsToken`，以及 `S11` 的「重新輸入密碼」）。 */
  open: (projectId: string, title: string | null) => void
  close: () => void
}

const Ctx = createContext<RoomEntryGateValue | null>(null)

export function RoomEntryGateProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<RoomEntryRequest | null>(null)
  const open = useCallback((projectId: string, title: string | null) => {
    setRequest((prev) => (prev !== null && prev.projectId === projectId ? prev : { projectId, title }))
  }, [])
  const close = useCallback(() => setRequest(null), [])
  const value = useMemo(() => ({ request, open, close }), [request, open, close])
  return (
    <EntryGateProvider needsToken={open}>
      <Ctx.Provider value={value}>{children}</Ctx.Provider>
    </EntryGateProvider>
  )
}

/**
 * 視窗自己用：沒有 provider 就是「沒有正式門禁」（`null`），視窗什麼都不畫 —— 那時門走的是 `FE-V01-S11` 的預設說明，
 * 不是靜默失敗（跟 `useInputLockRef` 同一個道理：讀的那一方單獨渲染時沒有門禁是對的答案）。
 */
export function useRoomEntryGateIfProvided(): RoomEntryGateValue | null {
  return useContext(Ctx)
}
