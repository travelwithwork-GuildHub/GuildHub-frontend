'use client'

import { createContext, useCallback, useContext, type ReactNode } from 'react'
import { useIdentity } from '@/identity/IdentityProvider'
import { heldRoomToken } from './roomTokens'
import { useScene } from './SceneProvider'

// 門禁的接口。規格 `FE-V01-S10`／`S11`（design D7）。
//
//     對著門按 E → requestEntry(projectId, title)
//       持有那間房的票 → enterRoom（走過場）
//       沒有           → gate.needsToken(projectId, title)
//
// `needsToken` 的**預設實作**是一句 `role="status"` 的說明（在 `SceneNotices`）：「這間房需要房間密碼。輸入密碼的功能還沒開放。」
// `FE-N08` 用 `EntryGateProvider` 蓋掉它：開密碼 Modal、`POST /enter` 成功後 `holdRoomToken()` ＋ `enterRoom()`。
// 對玩家來說「按 E 沒反應」跟門壞了長得一樣 —— 所以沒有票也要有回應，不是什麼都不做。

export type NeedsToken = (projectId: string, title: string) => void

const Ctx = createContext<NeedsToken | null>(null)

export function EntryGateProvider({ needsToken, children }: { needsToken: NeedsToken; children: ReactNode }) {
  return <Ctx.Provider value={needsToken}>{children}</Ctx.Provider>
}

/**
 * 拿到「請求進入」這個動作。**在 Canvas 外面呼叫**，把結果當 prop 交給 Canvas 裡的門（`SceneObjects`）。
 * 身分穩定（`useCallback`）：它會一路傳進 `Interactable` 的 `onInteract`，換一個就重新註冊。
 */
export function useRequestEntry(): (projectId: string, title: string) => void {
  const { enterRoom, showGateNotice } = useScene()
  const gate = useContext(Ctx)
  const identity = useIdentity()
  const profileId = identity.state === 'signed-in' ? identity.profile.id : null
  return useCallback(
    (projectId: string, title: string) => {
      const token = profileId === null ? null : heldRoomToken(profileId, projectId)
      if (token !== null) {
        enterRoom(projectId, { title })
        return
      }
      if (gate !== null) gate(projectId, title)
      else showGateNotice(projectId)
    },
    [profileId, enterRoom, showGateNotice, gate],
  )
}
