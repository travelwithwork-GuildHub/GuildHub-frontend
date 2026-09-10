'use client'

import type { ReactNode } from 'react'
import { useIdentity } from '@/identity/IdentityProvider'
import { WorldLeaseProvider } from '@/realtime/WorldLeaseProvider'

// 把「目前身分」翻成「這個分頁的連線資格鍵」。規格 `FE-R06-S01`／`S02`。
//
// ⚠️ **只有 `signed-in` 才協調。** 其餘三種狀態（`unknown`／`guest`／
// `unavailable`）全部放行，而每一種的理由不一樣：
//
//   `unknown`      還沒問到答案。**這裡先擋住的話，每次載入都會有一段
//                  黑畫面**，而多數情況下根本沒有第二個分頁。
//   `guest`        匿名連線在後端是不同的人 —— 擋掉它會擋掉 `S01`
//                  與我們自己的多人 E2E。
//   `unavailable`  問不到身分。**猜錯的兩個方向不對稱**：誤擋讓人完全
//                  進不去世界，誤放最多是後端那個已知的覆蓋問題。
//
// scene 進鍵裡：同一個人在大廳與某個房間各連一條是合法的。
// 今天只有 `lobby`，寫成常數是為了它變成變數時看得到要改哪裡。
const SCENE = 'lobby'

export function WorldGate({ children }: { children: ReactNode }) {
  const identity = useIdentity()
  const leaseKey = identity.state === 'signed-in' ? `${identity.profile.id}/${SCENE}` : null
  return <WorldLeaseProvider leaseKey={leaseKey}>{children}</WorldLeaseProvider>
}
