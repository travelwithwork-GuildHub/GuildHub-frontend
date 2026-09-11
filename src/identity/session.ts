import { LIMITS } from '@/api/contract/limits'
import { getMyProfile, login } from '@/api/operations'
import { toUiError } from '@/errors/uiError'
import { browserRecoveryKeyStore, type RecoveryKeyStore } from './recoveryKey'
import { NicknameLengthError, RecoveryKeyRejectedError, type Identity } from './types'

// 身分的取得與恢復。規格 `FE-A01`（identity-session）。
//
// ⚠️ **這一層不保存任何「已登入」的旗標。**
// 規格逐字要求「目前身分每次都向後端問」，而且那件事是**可觀察的**：
// 後端上那張名片的名字改了，重新進入應用要顯示新的名字（`S04`／`S11`）。
// 在這裡快取一份名字的話，那條判準會紅 —— 那是刻意的設計，不是效能疏忽。
//
// 唯一落地的東西是**恢復金鑰**，而它只在使用者明確選擇之後才寫（`recoveryKey.ts`）。


// ⚠️ **這一層不讀 HTTP status。** 「這個失敗是哪一種」只有一處在決定
//（`src/errors/uiError.ts`，規格 `FE-X03-S16`／`S18`）；這裡看的是翻譯出來的 `kind`。
// 下面兩個 helper 是控制流，不是文案 —— 行為跟以前比 `status === 401`／`404` 時一模一樣。

/** 「要登入」是「你是訪客」，不是錯誤。分辨它是這一層最重要的一件事。 */
function isUnauthorized(error: unknown): boolean {
  return toUiError(error).kind === 'authentication-required'
}

/** 「找不到」在登入這條路徑上只有一個意思：那把金鑰指向的名片不存在。 */
function isNotFound(error: unknown): boolean {
  return toUiError(error).kind === 'not-found'
}

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

/**
 * 用一把手上的恢復金鑰取回身分。`S17`（換裝置）／`S10`（金鑰無效）。
 *
 * ⚠️ **404 轉成 `RecoveryKeyRejectedError`，不是回一張新名片。**
 * 後端在那條路徑上也拒絕靜默建新的（`auth.py` 的註解逐字寫著理由），
 * 兩邊是同一個決定 —— 靜默改建新的話，「我回來了」與「我是新來的」
 * 在畫面上完全一樣，而使用者會以為自己的專案與訊息不見了。
 */
export async function signInWithRecoveryKey(
  key: string,
  { remember = false, store = browserRecoveryKeyStore() }: SignInOptions = {},
): Promise<Identity> {
  let profile
  try {
    profile = await login({ resume_token: key })
  } catch (error) {
    if (isNotFound(error)) throw new RecoveryKeyRejectedError()
    throw error
  }
  persist(store, profile.id, remember)
  return { state: 'signed-in', profile }
}

/**
 * 問後端「我是誰」。`S04`／`S05`／`S06`／`S08`。
 *
 * ⚠️ **401 之後還有一步。** cookie 不在的時候 `GET /api/me` 必然回 401，
 * 而那正是要拿金鑰去恢復的時刻（`S08`）。
 * `S05` 的條件因此是「401 **且手上沒有可用的金鑰**」才是訪客 ——
 * 規格裡那個但書不是修辭，少了它這條會跟 `S08` 直接矛盾，
 * 而矛盾的方向是**讓正確的實作變紅**。
 *
 * ⚠️ **401 不重試。** 它不是暫時性的失敗，重試只會多打一次同樣的 401。
 *
 * ⚠️ **回傳值裡沒有「上次問到的名字」。** 這一層不快取任何身分 ——
 * `S04` 的後兩行要求「後端上的名字改了，重新載入要顯示新的」，
 * 而那條判準存在的理由就是擋掉快取。
 */
export async function resolveIdentity(
  store: RecoveryKeyStore = browserRecoveryKeyStore(),
): Promise<Identity> {
  try {
    return { state: 'signed-in', profile: await getMyProfile() }
  } catch (error) {
    // 5xx、網路中斷、回應不符合契約 —— 全部是「現在問不到」，**不是訪客**（`S06`）。
    if (!isUnauthorized(error)) return { state: 'unavailable', cause: error }

    const key = store.read()
    if (key === null) return { state: 'guest', reason: 'no-session' }

    try {
      return { state: 'signed-in', profile: await login({ resume_token: key }) }
    } catch (recoveryError) {
      // 金鑰指向的名片不存在。**不清掉它** —— 資料庫重建過的話它之後可能又有效，
      // 而清掉是不可逆的。畫面靠 `reason` 說出實話（`S10`）。
      if (isNotFound(recoveryError)) return { state: 'guest', reason: 'recovery-key-rejected' }
      return { state: 'unavailable', cause: recoveryError }
    }
  }
}
