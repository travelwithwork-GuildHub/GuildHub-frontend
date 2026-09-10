import type { Identity } from './types'

/**
 * 自己的 `av`，從身分狀態算出來。規格 `avatar-appearance`（`FE-W19`）。
 *
 * ⚠️ **還沒登入不是錯誤，也不是 `0`。** `Identity` 有四種狀態，
 * 只有 `signed-in` 才有 profile。其餘一律回 `undefined`，
 * 交給 `avatarLook()` 去決定預設是什麼 ——
 * **在這裡寫 `?? 0` 會製造第二份值域規則**，而兩份規則一定會漂。
 *
 * ⚠️ 回傳型別刻意**不是** `number`。`number | undefined` 逼呼叫端面對
 * 「這個人還沒登入」這件事，而那正是世界裡大部分時候的狀態
 *（`/world` 不擋匿名，是 `identity-session` 已合併的要求）。
 */
export function myAvatar(identity: Identity): number | undefined {
  return identity.state === 'signed-in' ? identity.profile.avatar_id : undefined
}
