'use client'

import { createContext, use, useEffect, useRef, useState, type ReactNode } from 'react'
import { claimTabLease, type TabLease } from './tabLease'

// 「這個分頁可不可以連 world」的共用答案。規格 `FE-R06-S02`／`S03`。
//
// ⚠️ **`leaseKey` 是 `null` 時一律放行，而且那是正確的。**
// 匿名連線在後端是**不同的人**（`_identify()` 每條回一個新的 `uuid4()`），
// 所以兩個匿名分頁互相看得見是合法的，還是我們本機驗證多人行為的手段
//（`FE-R06-S01`）。**擋掉它會擋掉我們自己的 E2E。**

export interface WorldLease {
  /** 這個分頁現在可不可以連線。**匿名一律 `true`。** */
  readonly allowed: boolean
  /** 有沒有別的分頁佔著（`allowed` 為 `false` 的唯一原因）。 */
  readonly blockedByOtherTab: boolean
  /** 「改用這個分頁」。匿名時是 no-op。 */
  readonly takeOver: () => void
}

const ALWAYS_ALLOWED: WorldLease = {
  allowed: true,
  blockedByOtherTab: false,
  takeOver: () => {},
}

const WorldLeaseContext = createContext<WorldLease>(ALWAYS_ALLOWED)

export function useWorldLease(): WorldLease {
  return use(WorldLeaseContext)
}

export interface WorldLeaseProviderProps {
  /**
   * 協調用的鍵。**要含身分與 scene** —— 同一個人在兩個不同的 scene
   * 各連一條是合法的。`null` 代表匿名（不協調）。
   */
  leaseKey: string | null
  children: ReactNode
}

export function WorldLeaseProvider({ leaseKey, children }: WorldLeaseProviderProps) {
  // ⚠️ **`key` 讓換身分時整個重掛，而不是在 effect 裡把狀態設回去。**
  // 後者是 `react-hooks/set-state-in-effect` 擋的東西，**而那條規則是對的**：
  // 在 effect 裡同步 setState 會多一輪繪製，而這裡真正要的語意就是
  // 「換了一個鍵 ＝ 換了一個資源，重新來過」。
  if (leaseKey === null) {
    return <WorldLeaseContext value={ALWAYS_ALLOWED}>{children}</WorldLeaseContext>
  }
  return (
    <LeaseHolder key={leaseKey} leaseKey={leaseKey}>
      {children}
    </LeaseHolder>
  )
}

function LeaseHolder({ leaseKey, children }: { leaseKey: string; children: ReactNode }) {
  // **初始值一定是 `false`，而且那不是保守而已 —— 那是事實。**
  // `claimTabLease()` 一開始就是「還不知道」，要等 grace 到期或別人回應
  // 才會變。所以這裡不需要在 effect 裡同步一次。
  const [held, setHeld] = useState(false)
  const leaseRef = useRef<TabLease | null>(null)

  useEffect(() => {
    const claimed = claimTabLease(leaseKey)
    leaseRef.current = claimed
    const unsubscribe = claimed.subscribe(setHeld)
    return () => {
      unsubscribe()
      leaseRef.current = null
      // ⚠️ **一定要 release。** 不放的話，同一個分頁換身分（登出再登入）
      // 之後會跟自己搶，而畫面上是「你已經在另一個分頁裡開著這個世界」
      // —— 指著一個不存在的分頁。
      claimed.release()
    }
  }, [leaseKey])

  const value: WorldLease = {
    allowed: held,
    blockedByOtherTab: !held,
    takeOver: () => leaseRef.current?.takeOver(),
  }
  return <WorldLeaseContext value={value}>{children}</WorldLeaseContext>
}
