import { LIMITS } from '@/api/contract/limits'
import { login } from '@/api/operations'
import { browserRecoveryKeyStore, type RecoveryKeyStore } from './recoveryKey'
import { NicknameLengthError, type Identity } from './types'

// 身分的取得與恢復。規格 `FE-A01`（identity-session）。
//
// ⚠️ **這一層不保存任何「已登入」的旗標。**
// 規格逐字要求「目前身分每次都向後端問」，而且那件事是**可觀察的**：
// 後端上那張名片的名字改了，重新進入應用要顯示新的名字（`S04`／`S11`）。
// 在這裡快取一份名字的話，那條判準會紅 —— 那是刻意的設計，不是效能疏忽。
//
// 唯一落地的東西是**恢復金鑰**，而它只在使用者明確選擇之後才寫（`recoveryKey.ts`）。
//
// ⚠️ **這一刀只做「取得身分」那一半**（`S01`／`S02`／`S03`／`S07`）。
// 「問後端我是誰」與「用金鑰恢復」（`S04`–`S06`、`S08`、`S10`、`S17`）是下一刀 ——
// 拆點在 Scenario 上，不是在行數上（`AGENTS.md`：實作與證明它的判準不得分開）。

/**
 * 暱稱的長度檢查。**在送出之前**（`S02`）。
 *
 * ⚠️ **長度單位是 code point，不是 UTF-16 code unit。**
 * `'𠮷'.length` 是 2，`[...'𠮷'].length` 是 1，而後端的
 * `char_length()` 與 Python 的 `len()` 都數 code point ——
 * 用 `.length` 會拒絕後端收得下的字串。這件事 `limits.ts` 的檔頭有一整段。
 */
export function nicknameProblem(nickname: string): NicknameLengthError | null {
  const size = [...nickname].length
  const { min, max } = LIMITS.displayName
  return size < min || size > max ? new NicknameLengthError(min, max, size) : null
}

export interface SignInOptions {
  /**
   * 讓系統記住恢復金鑰。**預設 `false`**（`S07`）。
   *
   * ⚠️ **預設值寫在這裡而不是留給呼叫端**：漏傳的時候要落在「不寫」那一邊。
   * 反過來的話，一個忘記傳的呼叫點會默默把等同於身分的東西寫進硬碟。
   */
  remember?: boolean
  store?: RecoveryKeyStore
}

/**
 * 登入成功之後處理金鑰。
 *
 * ⚠️ **沒有選擇記住時是 `forget()`，不是「什麼都不做」。**
 * 什麼都不做的話，上一個記住過的人的金鑰會留在原地 ——
 * 而下一次重新載入會用它把畫面變成**另一個人**。
 * `S07` 要求的是「持久儲存中 SHALL NOT 出現恢復金鑰」，不是「不新增」。
 */
function persist(store: RecoveryKeyStore, key: string, remember: boolean): void {
  if (remember) store.remember(key)
  else store.forget()
}

/**
 * 用暱稱建立一個身分。`S01`／`S02`／`S03`。
 *
 * 失敗時**拋出**，不回傳 `unavailable` —— 呼叫端在登入畫面上，
 * 它要的是「這次沒成功、可以再按一次」，不是一個描述整體狀態的值（`S03`）。
 */
export async function signInWithNickname(
  nickname: string,
  { remember = false, store = browserRecoveryKeyStore() }: SignInOptions = {},
): Promise<Identity> {
  const problem = nicknameProblem(nickname)
  if (problem !== null) throw problem

  const profile = await login({ nickname })
  persist(store, profile.id, remember)
  return { state: 'signed-in', profile }
}
