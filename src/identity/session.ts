import { LIMITS, codePointLength, violates } from '@/api/contract/limits'
import { getMyProfile, login, register } from '@/api/operations'
import type { ProfileOut } from '@/api/contract/rest'
import { AVATAR_COUNT } from '@/design/avatar'
import { toUiError } from '@/errors/uiError'
import { saveAvatar } from './saveAvatar'
import { CredentialsRejectedError, LoginIdTakenError, NicknameLengthError, type Identity } from './types'

// 身分的取得與恢復。規格 `FE-A01`（identity-session）＋ `FE-A06`（`fe-a06-first-entry`，2026-09-21 反轉）。
//
// ⚠️ **這一層不保存任何「已登入」的旗標。**
// 規格逐字要求「目前身分每次都向後端問」，而且那件事是**可觀察的**：
// 後端上那張名片的名字改了，重新進入應用要顯示新的名字（`S04`）。
// 在這裡快取一份名字的話，那條判準會紅 —— 那是刻意的設計，不是效能疏忽。
//
// ⚠️⚠️ **恢復金鑰機制在 2026-09-21 整段退場**（`fe-a06-first-entry` 反轉、`identity-session` REMOVED delta）：
// 匿名身分綁在後端簽章的 HttpOnly session cookie（同瀏覽器重整、再訪都是同一個人；換瀏覽器就是新人）。
// 前端**不再**把恢復金鑰寫進 localStorage、不再自動用它恢復、`/login` 也不再有「貼上恢復金鑰」的入口。
// 跨裝置、可證明的持久身分走帳號密碼註冊（`POST /api/register`，`FE-A08`）。
// 後端 `POST /api/login` 的 `resume_token` 模式仍在（後端不改），前端不使用它。


// ⚠️ **這一層不讀 HTTP status。** 「這個失敗是哪一種」只有一處在決定
//（`src/errors/uiError.ts`，規格 `FE-X03-S16`／`S18`）；這裡看的是翻譯出來的 `kind`。

/** 「要登入」是「你是訪客」，不是錯誤。分辨它是這一層最重要的一件事。 */
function isUnauthorized(error: unknown): boolean {
  return toUiError(error).kind === 'authentication-required'
}

/** 403 在帳號密碼登入這一次請求上只有一個意思：帳號或密碼錯。**只在 `signInWithPassword` 裡用**（`FE-A08` design `D2`）。 */
function isForbidden(error: unknown): boolean {
  return toUiError(error).kind === 'permission-denied'
}

/** 409 在註冊這一次請求上只有一個意思：帳號撞名。**只在 `registerAccount` 裡用**。 */
function isConflict(error: unknown): boolean {
  return toUiError(error).kind === 'conflict'
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
  // 算法只有一份：`limits.ts` 的 `violates`／`codePointLength`（`FE-O06`）。這裡不再自己 `[...s].length`。
  const { min, max } = LIMITS.displayName
  return violates(LIMITS.displayName, nickname) === null ? null : new NicknameLengthError(min, max, codePointLength(nickname))
}

export interface SignInOptions {
  /**
   * 首次建立身分時挑外觀用的亂數來源，回 `[0, 1)`。**預設 `Math.random`**；測試注入固定序列。
   * 規格 `avatar-selection`〈首次建立身分時隨機指派一款外觀〉（`FE-A05-S21`）。
   */
  random?: () => number
}

/**
 * 剛建立的身分隨機發一款外觀（`FE-A05-S17`～`S21`）：均勻來源 ＋ 無偏映射 `Math.floor(r × 款數)`，
 * 款數讀映射的常數（不寫死 8）。走既有的 `saveAvatar`（值域檢查、無條件帶 `avatar_id`、不送 null）。
 *
 * ⚠️ **失敗就用後端回的那張名片、不重試、不拋**（`S20`）：進得了世界比外觀重要，換角色的入口一直在。
 * ⚠️ **只給剛建立的**：密碼登入既有名片的路徑不呼叫這個（`S19`）。
 * ⚠️ 亂數來源每次恰好取一次值 —— 「均勻」由來源與映射保證，不用抽樣統計驗。
 */
async function assignRandomAvatar(profile: ProfileOut, random: () => number): Promise<ProfileOut> {
  const av = Math.floor(random() * AVATAR_COUNT)
  const saved = await saveAvatar(av)
  return saved.ok ? saved.profile : profile
}

/**
 * 用暱稱建立一個身分。`S01`／`S02`／`S03`。
 *
 * 失敗時**拋出**，不回傳 `unavailable` —— 呼叫端在登入畫面上，
 * 它要的是「這次沒成功、可以再按一次」，不是一個描述整體狀態的值（`S03`）。
 *
 * ⚠️ **成功就是登入了**（後端寫 session cookie）—— 前端不落地任何東西。
 */
export async function signInWithNickname(
  nickname: string,
  { random = Math.random }: SignInOptions = {},
): Promise<Identity> {
  const problem = nicknameProblem(nickname)
  if (problem !== null) throw problem

  const created = await login({ nickname })
  // 暱稱登入**一定是新建立的**身分（後端每次建一張新名片）→ 隨機發一款外觀，存完才回（呼叫端 await 完才導向：`S17` 的順序）。
  const profile = await assignRandomAvatar(created, random)
  return { state: 'signed-in', profile }
}

/**
 * 用帳號密碼登入。規格 `FE-A08`〈帳號密碼登入驗證身分，錯了不透露哪一個錯〉。
 *
 * ⚠️ **只把這一次 `POST /api/login` 的 403 轉成 `CredentialsRejectedError`**（design `D2`）；別的 status 原樣拋、走 `toUiError`。
 * 不在 transport 或這一層的通用位置按 status 全域轉 —— 那會把別的端點的 403 說成密碼錯。
 * 三欄原值原樣送（不 trim、不折疊大小寫）：後端沒有這些規則，前端加了會讓註冊與登入的值對不上。
 */
export async function signInWithPassword(loginId: string, password: string): Promise<Identity> {
  let profile
  try {
    profile = await login({ login_id: loginId, password })
  } catch (error) {
    if (isForbidden(error)) throw new CredentialsRejectedError()
    throw error
  }
  return { state: 'signed-in', profile }
}

/**
 * 註冊一個帶帳號密碼的名片，**成功即登入**（後端寫 session）。規格 `FE-A08`〈註冊建立一張帶帳號密碼的名片，成功即登入〉。
 *
 * ⚠️ **只把這一次 `POST /api/register` 的 409 轉成 `LoginIdTakenError`**；別的原樣拋。
 * 不先查「帳號可不可用」：後端明寫先查再寫是競態，撞名由 409 說。
 */
export async function registerAccount(
  input: { loginId: string; password: string; nickname: string },
  { random = Math.random }: SignInOptions = {},
): Promise<Identity> {
  let created
  try {
    created = await register({ login_id: input.loginId, password: input.password, nickname: input.nickname })
  } catch (error) {
    if (isConflict(error)) throw new LoginIdTakenError()
    throw error
  }
  // 註冊也是新建立的身分（`S18`）。
  const profile = await assignRandomAvatar(created, random)
  return { state: 'signed-in', profile }
}

/**
 * 問後端「我是誰」。`S04`／`S05`／`S06`。
 *
 * ⚠️ **401 就是訪客**（`S05`）：匿名身分綁 session cookie，cookie 不在就是訪客 ——
 * 恢復金鑰機制退場之後，這裡不再有「拿金鑰去恢復」那一步。
 *
 * ⚠️ **401 不重試。** 它不是暫時性的失敗，重試只會多打一次同樣的 401。
 *
 * ⚠️ **回傳值裡沒有「上次問到的名字」。** 這一層不快取任何身分 ——
 * `S04` 的後兩行要求「後端上的名字改了，重新載入要顯示新的」，
 * 而那條判準存在的理由就是擋掉快取。
 */
export async function resolveIdentity(): Promise<Identity> {
  try {
    return { state: 'signed-in', profile: await getMyProfile() }
  } catch (error) {
    // 5xx、網路中斷、回應不符合契約 —— 全部是「現在問不到」，**不是訪客**（`S06`）。
    if (!isUnauthorized(error)) return { state: 'unavailable', cause: error }
    return { state: 'guest', reason: 'no-session' }
  }
}
