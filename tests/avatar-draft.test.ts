import { describe, expect, it } from 'vitest'
import { shownAvatar } from '@/identity/avatarDraft'
import { avatarLook } from '@/design/avatar'
import type { Identity } from '@/identity/types'

// 規格 `FE-A05-S01`／`S03`：正在挑的那個要立刻看得到，放棄之後要回到已儲存的。
//
// ⚠️ **這一份守的是那個 `??`。** 它看起來只是一個運算子的選擇，
// 但寫成 `||` 的話**第一個角色會永遠選不動** —— 而畫面上沒有任何錯誤，
// 只是「按了沒反應」。

const signedIn = (avatar_id: number): Identity => ({
  state: 'signed-in',
  profile: {
    id: 'abc1def2-3a4b-4c5d-8e6f-7a8b9c0d1e2f',
    display_name: '草稿測試員',
    avatar_id,
    skills: [],
    hours_per_week: null,
    bio: null,
    updated_at: '2026-09-10T00:00:00Z',
  },
})

describe('正在挑的那個角色', () => {
  it('[FE-A05-S01] 有草稿時，畫面上的自己用草稿而不是已儲存值', () => {
    expect(shownAvatar(signedIn(0), 1)).toBe(1)
  })

  it('[FE-A05-S03] 沒有草稿時，畫面回到已儲存值', () => {
    // **沒有這一條，上一條可以用「永遠回傳草稿」通過** —— 而那個實作
    // 在使用者放棄選擇之後，畫面會停在他沒有選的那一個。
    expect(shownAvatar(signedIn(1), undefined)).toBe(1)
  })

  it('[FE-A05-S01] ⚠️ 草稿是 `0` 時 SHALL NOT 退回已儲存值', () => {
    // ⚠️⚠️ **這一條是這個檔案存在的理由。**
    //
    // 索引 `0` 是 falsy。寫成 `draft || myAvatar(identity)` 的話，
    // 使用者挑第一款角色時會**拿到他原本那一款** —— 畫面完全沒反應，
    // 而且沒有任何錯誤訊息。
    expect(
      shownAvatar(signedIn(1), 0),
      '挑第一款角色（索引 0）時畫面沒有跟著改 —— `??` 被寫成 `||` 了嗎？' +
        '`0` 是 falsy，`||` 會把它當成「沒有草稿」',
    ).toBe(0)
  })

  it('[FE-A05-S01] 草稿 `0` 與已儲存 `1` 真的畫成不同的外觀', () => {
    // ⚠️ **上一條只證明數字對，這一條證明那個數字有意義。**
    // 如果兩個索引畫出同一款外觀，「選了看得到」就是假的 ——
    // 而 `avatarLook()` 的值域規則只有一份，這裡順便釘住它。
    expect(avatarLook(shownAvatar(signedIn(1), 0))).not.toEqual(
      avatarLook(shownAvatar(signedIn(1), undefined)),
    )
  })

  it('[FE-A05-S01] 訪客有草稿時也看得到', () => {
    // 訪客也在世界裡（世界本來就允許匿名），而他挑的角色一樣要立刻看得到。
    // 存不存得起來是另一件事（那要登入），這一層不管。
    expect(shownAvatar({ state: 'guest', reason: 'no-session' }, 1)).toBe(1)
  })

  it('[FE-A05-S03] 訪客沒有草稿時不給值', () => {
    // **不要在這裡寫 `?? 0`** —— 值域規則只有 `avatarLook()` 一份，
    // 在這裡補一個預設值就是第二份，而兩份會漂。
    expect(shownAvatar({ state: 'guest', reason: 'no-session' }, undefined)).toBeUndefined()
  })
})
