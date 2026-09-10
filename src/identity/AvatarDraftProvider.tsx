'use client'

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

// 「正在挑的那個角色」放在哪。規格 `FE-A05-S01`／`S02`／`S03`。
//
// ⚠️ **它刻意不進 `IdentityProvider`。**
// `Identity` 是**伺服器說的事實**（`/api/me` 回來的那張名片）；
// 草稿是**還沒發生的事**。混在一起之後，「已儲存的 avatar 是什麼」
// 這個問題就沒有唯一答案了 —— 而 `S02`（別人看不到未提交的選擇）
// 正是靠那個唯一答案守住的。
//
// ⚠️ **這裡不放「儲存中」「儲存失敗」那些狀態。**
// 那是選擇器自己的事；這一層只回答「現在畫面上要顯示哪一個」。

interface AvatarDraft {
  /** 正在挑的那個；`undefined` 表示沒有在挑。 */
  readonly draft: number | undefined
  /** 挑一個（或傳 `undefined` 放棄）。 */
  readonly setDraft: (av: number | undefined) => void
  /** 放棄，回到已儲存的那個（`S03`）。 */
  readonly clearDraft: () => void
}

// 預設值讓「沒有 Provider 也不會爆」—— 世界在沒有選擇器的情況下
// 仍然要畫得出角色（讀到 `undefined` 就是用已儲存值）。
const Ctx = createContext<AvatarDraft>({
  draft: undefined,
  setDraft: () => {},
  clearDraft: () => {},
})

export function AvatarDraftProvider({ children }: { children: ReactNode }) {
  const [draft, setDraft] = useState<number | undefined>(undefined)
  const clearDraft = useCallback(() => setDraft(undefined), [])
  const value = useMemo(() => ({ draft, setDraft, clearDraft }), [draft, clearDraft])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAvatarDraft(): AvatarDraft {
  return useContext(Ctx)
}
