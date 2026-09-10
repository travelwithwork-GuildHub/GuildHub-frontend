'use client'

import { createContext, use, useEffect, useState, type ReactNode } from 'react'
import { resolveIdentity } from './session'
import type { Identity } from './types'

// 目前身分的**單一共用來源**。規格 `FE-A01`（identity-session）。
//
// ⚠️ **這一層不是快取。** 它在掛載時問後端一次，讓同一次繪製裡的每一個
// 消費者拿到同一個答案 —— 而不是各自打一次 `GET /api/me`。
// 規格要求的「每次進入應用都向後端問」仍然成立：**重新載入頁面就會再問一次**，
// 而 `S04` 的「後端上的名字改了要跟著變」也還是紅的判準守著。
//
// ⚠️ **刻意不放進 `src/app/providers.tsx`。** 那個檔案寫著「這一刀刻意不掛載
// 任何東西⋯⋯在這裡先裝等於替 `FE-X02` 裁決」。這個 provider 掛在需要它的
// 路由段上，等 `FE-X02` 決定全域狀態怎麼組再說。

const IdentityContext = createContext<Identity | null>(null)

/** 沒有 provider 時是 `null` —— **不是** `guest`。分不清「還沒問」與「問完沒有」是這一整層的原罪。 */
export function useIdentity(): Identity {
  return use(IdentityContext) ?? { state: 'unknown' }
}

export function IdentityProvider({ children }: { children: ReactNode }) {
  const [identity, setIdentity] = useState<Identity>({ state: 'unknown' })

  useEffect(() => {
    let live = true
    void resolveIdentity().then((next) => {
      // 元件已經卸載就不要再 setState —— 路由切換比這個請求快
      if (live) setIdentity(next)
    })
    return () => {
      live = false
    }
  }, [])

  return <IdentityContext value={identity}>{children}</IdentityContext>
}
