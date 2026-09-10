'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { resolveIdentity } from './session'
import type { Identity } from './types'

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

/** 訪客看得到的入口。`S16`：要辨識得出來，而且到得了輸入暱稱的流程。 */
function SignInEntry() {
  return (
    <Link href="/login" className="text-accent underline">
      建立你的身分
    </Link>
  )
}

export function IdentityBadge() {
  const [identity, setIdentity] = useState<Identity>({ state: 'unknown' })

  useEffect(() => {
    let live = true
    void resolveIdentity().then((next) => {
      // 元件已經卸載就不要再 setState —— 世界的路由切換比這個請求快
      if (live) setIdentity(next)
    })
    return () => {
      live = false
    }
  }, [])

  switch (identity.state) {
    case 'unknown':
      return <p data-testid="identity">確認身分中⋯</p>
    case 'signed-in':
      // **顯示的是查詢的結果**，不是任何前端保存的值（`S04`／`S11`）
      return <p data-testid="identity">{identity.profile.display_name}</p>
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
