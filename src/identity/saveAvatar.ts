import { updateMyProfile } from '@/api/operations'
import { AVATAR_COUNT } from '@/design/avatar'
import type { ProfileOut } from '@/api/contract/rest'

// 把選好的角色存起來。規格 `FE-A05-S08`／`S09`／`S10`。
//
// ⚠️ **元件裡不准出現 `fetch`**（`CLAUDE.md`）—— 資料存取一律走 `src/api/`。
// 這一層在它上面，負責的是「什麼可以送、什麼不可以送」。

/**
 * 存的結果。**三種，而且呼叫端要分得出來** ——
 * 「值域外」與「後端失敗」的正確處置不同（`S10` vs `S06`）。
 */
export type SaveAvatarResult =
  | { readonly ok: true; readonly profile: ProfileOut }
  /** 這個索引不是一個角色。**沒有送出任何請求。** */
  | { readonly ok: false; readonly reason: 'out-of-range' }
  /** 送出去了但沒成功。 */
  | { readonly ok: false; readonly reason: 'failed'; readonly error: unknown }

/**
 * @param av 要存的角色索引。
 *
 * ⚠️⚠️ **`{ avatar_id: av }` 是無條件帶上的，而這件事是規格的一條 Scenario。**
 *
 * `ProfileUpdate` 的每一欄都是選填（未給的欄位不動），所以很自然會寫成
 * 「有值才帶上這個欄位」：
 *
 *     const body = {}
 *     if (av) body.avatar_id = av        // ⚠️ 這行是 bug
 *
 * **索引 `0` 是 falsy** —— 使用者挑第一款角色時，那樣的實作**什麼都不送**。
 * 而最惡劣的地方是：**預覽是對的**（本地狀態確實改了），畫面上完全正常，
 * 只有重新整理之後才會發現沒存到。
 *
 * ⚠️ **也不會送 `avatar_id: null`**（`S09`）。合約上 `null` 會把欄位**清空**，
 * 而 `ProfileOut.avatar_id` 是必填的 `number` —— MVP 沒有「無角色」這個狀態。
 */
export async function saveAvatar(av: number): Promise<SaveAvatarResult> {
  // ⚠️ **值域檢查在送出之前，而且是這一層的責任。**
  //
  // 後端不驗證 `avatar_id`，任何整數都存得進去。存進一個畫不出來的值之後，
  // `avatarLook()` 的 fallback 會讓它顯示成第一款 —— 使用者會看到
  // 「存好了，但外觀不是我選的那個」，而那比存不進去更難查。
  if (!Number.isInteger(av) || av < 0 || av >= AVATAR_COUNT) {
    return { ok: false, reason: 'out-of-range' }
  }

  try {
    return { ok: true, profile: await updateMyProfile({ avatar_id: av }) }
  } catch (error) {
    return { ok: false, reason: 'failed', error }
  }
}
