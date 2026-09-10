import { describe, expect, it } from 'vitest'
import { myAvatar } from '@/identity/myAvatar'
import type { Identity } from '@/identity/types'
import type { ProfileOut } from '@/api/contract/rest'

// 規格 `avatar-appearance`（`FE-W19`）：自己的 `av` 從哪來。
//
// ⚠️⚠️ **這一份是突變測試逼出來的。**
//
// 把 `WorldCanvas` 傳給 `LocalPlayer` 的 `av` 整個拿掉之後，
// **543 條測試裡沒有任何一條會紅** —— 映射對、接線對、遠端對，
// 只有「自己的 `av` 從身分來」這一段沒有人守。
//
// ⚠️ 這一份守的是**四種身分狀態怎麼對應到 `av`**。
// 「`WorldCanvas` 有沒有把結果傳給 `LocalPlayer`」它守不到 ——
// 那要真的 Canvas，在 e2e。**這個缺口是知道的，不是漏掉的。**

const profile = (avatar_id: number): ProfileOut => ({
  id: 'abc1def2-3a4b-4c5d-8e6f-7a8b9c0d1e2f',
  display_name: '某人',
  avatar_id,
  created_at: '2026-09-10T00:00:00Z',
})

describe('自己的 av 從身分來', () => {
  it('[FE-W19-S01] 登入的人用自己 profile 上的 `avatar_id`', () => {
    expect(myAvatar({ state: 'signed-in', profile: profile(1) })).toBe(1)
    // ⚠️ **這一句不能省。** 只驗 `1` 的話，一個永遠回 `1` 的實作也會通過。
    expect(myAvatar({ state: 'signed-in', profile: profile(0) })).toBe(0)
  })

  it('[FE-W19-S09] 還沒登入的三種狀態都不給值', () => {
    const notSignedIn: Identity[] = [
      { state: 'unknown' },
      { state: 'guest', reason: 'no-session' },
      { state: 'guest', reason: 'recovery-key-rejected' },
      { state: 'unavailable', cause: new Error('後端掛了') },
    ]
    for (const identity of notSignedIn) {
      expect(
        myAvatar(identity),
        `${identity.state} 給了一個值 —— 那會變成第二份值域規則，而值域規則只能有一份（avatarLook）`,
      ).toBeUndefined()
    }
  })

  it('[FE-W19-S09] 後端送來的怪值原樣往下傳，不在這裡修', () => {
    // ⚠️ **這裡 SHALL NOT 自己 fallback。** 值域檢查只有 `avatarLook()` 一份 ——
    // 在這裡補一層 `?? 0` 或範圍檢查，就會有兩份規則，而兩份一定會漂。
    // 症狀會是「本地的怪值被修好了、遠端的沒有」。
    expect(myAvatar({ state: 'signed-in', profile: profile(999) })).toBe(999)
    expect(myAvatar({ state: 'signed-in', profile: profile(-1) })).toBe(-1)
  })
})
