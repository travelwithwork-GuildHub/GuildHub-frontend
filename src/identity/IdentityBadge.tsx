'use client'

import Link from 'next/link'
import { useProfilePanel } from '@/profile/ProfilePanelProvider'
import { useIdentity } from './IdentityProvider'

// 世界裡「你是誰」的顯示。規格 `FE-A01-S11`／`S12`／`S16`。
//
// ⚠️ **四種狀態各自長不一樣，而那是判準的重點。**
// 規格逐字要求「同一個畫面在有身分與沒有身分時 SHALL 不同」——
// 因為**今天的世界本來就是匿名可進、而且每個人都叫「訪客」**，
// 少了對照的方向，一條「顯示訪客」的斷言在「登入功能完全沒做」的版本上
// 照樣全綠。
//
// ⚠️ **`unknown` 不能省略成「先顯示訪客」。** 那樣已登入的人會先看到自己是
// 訪客再閃回名字，而那個閃爍在發表日的投影幕上看得一清二楚。
//
// ⚠️ **`unavailable` 不能顯示成訪客。** 後端掛掉時所有人都被靜默登出，
// 而畫面上跟真的沒登入一模一樣（`S06`）。
//
// 已登入的名字是一個 `button`「我的名片」（`FE-A04-S01`）：按下開名片面板；關閉後焦點回這個按鈕（`S02`），
// 所以開的時候把自己交給 provider。**必須在 `<ProfilePanelProvider>` 底下。**

/** 訪客看得到的入口。`S16`：要辨識得出來，而且到得了輸入暱稱的流程。 */
function SignInEntry() {
  return (
    <Link href="/login" className="text-accent underline">
      建立你的身分
    </Link>
  )
}

export function IdentityBadge() {
  // ⚠️ **不自己問後端。** 同一個畫面上的世界連線守衛也要知道身分，
  // 兩邊各問一次的話每次載入都會打兩次 `GET /api/me`。
  const identity = useIdentity()
  const { openPanel } = useProfilePanel()

  switch (identity.state) {
    case 'unknown':
      return <p data-testid="identity">確認身分中⋯</p>
    case 'signed-in':
      // **顯示的是查詢的結果**，不是任何前端保存的值（`S04`／`S11`）
      return (
        <p data-testid="identity">
          <button type="button" aria-label="我的名片" className="text-accent underline" onClick={(e) => openPanel(e.currentTarget)}>
            {identity.profile.display_name}
          </button>
        </p>
      )
    case 'guest':
      return (
        <p data-testid="identity">
          訪客 <SignInEntry />
        </p>
      )
    case 'unavailable':
      // 「現在問不到」跟「你是訪客」要分得開，而且分得開的方式是**使用者看得出來**
      return (
        <p data-testid="identity">
          現在問不到你的身分 <SignInEntry />
        </p>
      )
  }
}
