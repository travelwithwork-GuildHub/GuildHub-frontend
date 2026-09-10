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

interface IdentityContextValue {
  readonly identity: Identity
  /**
   * 採用一個**剛從後端拿回來**的身分。
   *
   * ⚠️ **這不是「在前端設定身分」。** 傳進來的必須是後端回應的那張名片
   *（`POST /api/login` 的 `ProfileOut`）—— 它跟 `GET /api/me` 回的是同一個東西，
   * 只是不必再問一次。
   *
   * ⚠️⚠️ **少了它會有一個只在真瀏覽器裡看得到的 bug**：在世界裡走完首次進入
   * 流程之後，標題列仍然顯示「訪客」，要重整才會變。
   * 單元判準抓不到，因為那兩個元件在判準裡是分開掛載的。
   * **端到端第一次跑就紅在這裡。**
   */
  readonly adopt: (identity: Identity) => void
}

const IdentityContext = createContext<IdentityContextValue | null>(null)

/** 沒有 provider 時是 `unknown` —— **不是** `guest`。分不清「還沒問」與「問完沒有」是這一整層的原罪。 */
export function useIdentity(): Identity {
  return use(IdentityContext)?.identity ?? { state: 'unknown' }
}

/** 拿到採用新身分的動作。沒有 provider 時是 no-op。 */
export function useAdoptIdentity(): (identity: Identity) => void {
  const value = use(IdentityContext)
  return value?.adopt ?? (() => {})
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

  // ⚠️ **每次繪製建立一個新的 value 物件是刻意的、也是安全的**：
  // 這個 context 的消費者本來就要跟著 `identity` 重繪，
  // 而 `useMemo` 在這裡只會多一層讀不出好處的間接。
  return (
    <IdentityContext value={{ identity, adopt: setIdentity }}>{children}</IdentityContext>
  )
}
