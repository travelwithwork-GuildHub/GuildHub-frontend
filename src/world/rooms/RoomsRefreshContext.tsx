'use client'

import { createContext, useContext, type ReactNode } from 'react'

// 「門立即重取」的交接（`FE-J04` design D5）：`useRooms` 在 `WorldCanvas` 裡；成軍／結案在看板面板的詳情裡 ——
// 兩邊都在同一棵 `WorldCanvas` 的樹底下，用 context 交一個函式過去。
//
// 預設是 no-op：單獨渲染 `BoardPanel` 的既有測試、不在大廳（沒有走廊）都不需要 provider。

const RoomsRefreshContext = createContext<() => void>(() => {})

export function RoomsRefreshProvider({ refresh, children }: { refresh: () => void; children: ReactNode }) {
  return <RoomsRefreshContext value={refresh}>{children}</RoomsRefreshContext>
}

/** 成軍／結案成功後呼叫：門馬上重取。沒有 provider 時是 no-op。 */
export function useRoomsRefresh(): () => void {
  return useContext(RoomsRefreshContext)
}
