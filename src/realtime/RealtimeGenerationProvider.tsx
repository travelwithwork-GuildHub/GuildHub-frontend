'use client'

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

// 「重新建立即時連線」這件事要有一個入口。規格 `FE-A05-S04`。
//
// ⚠️⚠️ **為什麼需要它：`PATCH` 成功不等於別人看得到。**
//
// 即時層每個人的 `av` 來自**那條連線背後的 session**，而後端是在**登入時**
// （`auth.py` 的 `_remember()`）把 `avatar_id` 寫進 session 的，
// `presence.join()` 從那裡讀。所以改了 profile 之後，
// **已經在場的其他人看到的仍然是舊外觀** —— 除非那條連線關掉重開。
//
// ⚠️ **這個 provider 不碰 socket。** 它只是一個會變的數字；
// 連線的建立與關閉仍然只有 `RemoteWorld` 的那一個 effect 在做，
// 而它的 cleanup 本來就會關掉舊的。**多一個關 socket 的地方就是多一個漏的地方。**
//
// ⚠️ 代價寫在規格裡（`S05`）：重連期間其他人可能短暫看到這個人離開又進來。
// 那是**已知而且被接受的**，不是 bug。後端若能在 `PATCH` 時同步 session
// 就能消除它 —— 已開後端票。

interface RealtimeGeneration {
  /** 現在是第幾代連線。**變了就重連。** */
  readonly generation: number
  /** 要求重新建立連線。 */
  readonly rejoin: () => void
}

// 預設值讓沒有 Provider 的地方也能運作（世界不會因為少了它就不連線）。
const Ctx = createContext<RealtimeGeneration>({ generation: 0, rejoin: () => {} })

export function RealtimeGenerationProvider({ children }: { children: ReactNode }) {
  const [generation, setGeneration] = useState(0)
  const rejoin = useCallback(() => setGeneration((n) => n + 1), [])
  const value = useMemo(() => ({ generation, rejoin }), [generation, rejoin])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useRealtimeGeneration(): RealtimeGeneration {
  return useContext(Ctx)
}
