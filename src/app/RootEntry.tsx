'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { FirstEntryFlow } from '@/first-entry/FirstEntryFlow'
import { useIdentity } from '@/identity/IdentityProvider'
import { markFirstEntryDone } from '@/first-entry/seen'

// `/` 的內容。規格 `FE-A06-S01`／`S02`／`S03`。
//
// ⚠️ **這條路是強制的，而它強制得起來的理由很具體**：走到這裡的人**還沒有
// 看過世界**，擋住他不會拿走任何他已經擁有的東西。
// `/world` 那條就不一樣 —— 那裡的人已經在世界裡了，所以那邊只能提示。
//
// ⚠️ **已經有身分的人不能被問第二次名字**（`S03`）。「已經有身分」有兩種：
// session 還在，以及 session 不在但手上有恢復金鑰 —— `resolveIdentity()`
// 已經把後者的自動恢復做掉了，所以這裡只要看最後的答案。

export function RootEntry() {
  const identity = useIdentity()
  const router = useRouter()

  // ⚠️ **`unavailable` 也放行進世界。** 問不到身分的時候擋在門口的話，
  // 後端一抖就沒有人進得去；而放行最多是他以訪客的身分逛（世界本來就
  // 允許訪客）。誤擋與誤放的代價不對稱。
  const passThrough = identity.state === 'signed-in' || identity.state === 'unavailable'

  useEffect(() => {
    if (passThrough) router.replace('/world')
  }, [passThrough, router])

  if (identity.state === 'unknown' || passThrough) {
    // 還沒問到答案時**不顯示流程** —— 顯示了的話，已登入的人會先看到
    // 「取一個名字」再被轉走，而那一閃在投影幕上看得一清二楚
    return <p data-testid="root-entry">準備中⋯</p>
  }

  return (
    <main className="p-gutter flex flex-col gap-gutter" data-testid="root-entry">
      <h1 className="text-title">GuildHub</h1>
      <FirstEntryFlow
        onDone={() => {
          markFirstEntryDone()
          router.replace('/world')
        }}
      />
    </main>
  )
}
