'use client'

import { useState } from 'react'
import { FirstEntryFlow } from '@/first-entry/FirstEntryFlow'
import { firstEntryDone, markFirstEntryDone } from '@/first-entry/seen'
import { useIdentity } from '@/identity/IdentityProvider'
import { layer } from '@/design/layers'

// 世界裡給訪客看的引導。規格 `FE-A06-S04`／`S05`／`S06`。
//
// ⚠️ **這裡只能提示，不能擋。** `identity-session` 已合併的規格逐字要求
// 「未登入的使用者進入世界時，世界 SHALL 照常載入並可操作」——
// 本能力 MUST NOT 讓那一條變紅。`/` 那條路才是強制的，而它強制得起來的
// 理由是：走到那裡的人**還沒有看過世界**，擋住他不會拿走他已經擁有的東西。
//
// ⚠️⚠️ **「關掉了」不落地，「走完了」才落地。**
// 封存前審查時 codex 特別指出：關閉引導層**不應被記成「已完成首次進入」**。
// 混在一起的症狀是**一個手滑點掉的人再也不會被提示** ——
// 而那正好摧毀這一整項存在的理由。
// 所以 `dismissed` 是這次繪製裡的 state，`markFirstEntryDone()` 才寫進儲存。

export function FirstEntryNotice() {
  const identity = useIdentity()
  const [dismissed, setDismissed] = useState(false)
  // ⚠️ **lazy initializer，不是每次繪製都讀。** 每次都讀的話，
  // 走完流程之後這個元件會在同一次繪製裡自己消失，而「進入世界」的
  // 導向還沒發生 —— 畫面會閃一下
  const [alreadyDone] = useState(firstEntryDone)

  if (identity.state !== 'guest' || dismissed || alreadyDone) return null

  return (
    // ⚠️ **`pointer-events-none` 在外層、`pointer-events-auto` 在卡片上。**
    // 少了這一對，一個蓋住整個畫面的容器會吃掉世界的鍵盤與滑鼠 ——
    // 而規格 `S05` 驗的正是「還沒關掉的時候世界就能動」。
    <div
      className="pointer-events-none absolute inset-0 flex items-start justify-center p-gutter"
      style={{ zIndex: layer('panel') }}
      data-testid="first-entry-notice"
    >
      <section
        aria-labelledby="notice-heading"
        className="pointer-events-auto border-line bg-surface-raised p-gutter flex max-w-prose flex-col gap-gutter border"
      >
        <h2 id="notice-heading" className="text-title">
          你現在是訪客
        </h2>
        <p>取一個名字，世界裡的其他人就看得到你是誰。</p>
        <FirstEntryFlow
          onDone={() => {
            markFirstEntryDone()
            setDismissed(true)
          }}
        />
        <button type="button" onClick={() => setDismissed(true)}>
          先四處看看
        </button>
      </section>
    </div>
  )
}
