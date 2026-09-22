'use client'

import { type ReactNode } from 'react'
import { FirstEntryFlow } from '@/first-entry/FirstEntryFlow'
import { markFirstEntryDone } from '@/first-entry/seen'
import { useAdoptIdentity, useIdentity } from '@/identity/IdentityProvider'
import { layer } from '@/design/layers'

// 進世界前要先有名字（`first-entry` 的 `FE-A06-S04`／`S05`／`S06`，2026-09-22 二次反轉）。
//
// ⚠️ **這是一道取代世界的門檻，不是蓋在世界上的提示。** guest 時**根本不 render 世界**（`children`），
// 改 render 取名。原因：世界的移動鍵是 `document` 全域監聽，只靠 `EditableFocusLock`（焦點在文字框才鎖）——
// 焦點移到「進入世界」按鈕就放鎖，WASD 會漏進世界；而這個 gate 在 `InteractionProvider` 外，拿不到 `holdInputLock`。
// **沒有世界可漏** 是最穩的「取名前世界不可操作」（`S04` 已改成 method-agnostic：取代或蓋住皆可）。
// 附帶好處：guest 不抓 3D chunk（`WorldBoundary` 在 `children` 裡，根本沒掛）。
//
// ⚠️ **只擋 `guest`。** `unknown`（還在問身分）交給 `children`（`WorldBoundary` 自己顯示載入層，不閃取名）；
// `signed-in` 進世界；`unavailable`（問不到身分）**放行** —— 誤擋讓人完全進不去、誤放最多是未定身分逛，
// 代價不對稱（沿用 `RootEntry` 的 `passThrough`）。
//
// ⚠️ **沒有旁觀出口（`S05`）。** 拿掉了前一版 `FirstEntryNotice` 的「先四處看看」與 `dismissed` ——
// 取名之前沒有任何繞過它去操作世界的控制。
//
// 不用 `aria-modal`：世界沒 render，這就是 guest 的主畫面（不是蓋在活內容上的 modal）；
// `aria-modal` 會把上方標題列從輔助技術藏掉，而那不是我們要的。

export function WorldEntryGate({ children }: { children: ReactNode }) {
  const identity = useIdentity()
  const adopt = useAdoptIdentity()

  if (identity.state !== 'guest') return <>{children}</>

  return (
    <div
      data-testid="world-entry-gate"
      className="bg-surface absolute inset-0 flex items-center justify-center p-gutter"
      style={{ zIndex: layer('panel') }}
    >
      <section className="border-line bg-surface-raised rounded-control p-gutter flex max-w-prose flex-col gap-gutter border shadow-lg">
        <FirstEntryFlow
          autoFocus
          description="填一個名字就能加入 —— 不用帳號、不用密碼。世界裡的其他人會看到這個名字。"
          onDone={(next) => {
            // 走完了才記「已完成首次進入」（`FE-A06-S06`：已取名的人不再被問）。
            markFirstEntryDone()
            // adopt 之後 identity → `signed-in`，下一次 render 這個 gate 回傳 `children`（世界）。
            adopt(next)
          }}
        />
      </section>
    </div>
  )
}
