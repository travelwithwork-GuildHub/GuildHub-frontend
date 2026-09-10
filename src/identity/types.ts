import type { ProfileOut } from '@/api/contract/rest'

// 「我是誰」的四種狀態。規格 `FE-A01`（identity-session）。
//
// ⚠️ **四種，不是三種，也不是一個布林。**
// 規格逐字要求 `S05` 與 `S06` 分得開：後端回 401 是「你是訪客」這個**正常狀態**，
// 而後端 500 或根本沒送達是「現在問不到」。把後者一起吞成訪客的症狀是
// **「後端掛了的時候，所有人都被靜靜地登出」** —— 而那跟真的沒登入在畫面上
// 一模一樣，使用者會以為自己的東西不見了。
//
// `unknown` 也不能省：它是「還沒問完」。少了它，第一次繪製時只能在
// 「訪客」與「已登入」之間挑一個，而挑「訪客」會讓已登入的人先看到自己是訪客再閃回來。

/** 恢復金鑰為什麼沒把人帶回來。`S10` 要求這件事**看得出來**。 */
export type GuestReason =
  /** 沒有 session，手上也沒有金鑰。這是最普通的「第一次來」。 */
  | 'no-session'
  /**
   * 手上有金鑰，但後端說那張名片不存在（404）。
   *
   * ⚠️ **這一種 MUST NOT 被靜默改成「建一張新名片」**（`S10`）——
   * 那樣「我回來了」與「我是新來的」在畫面上會完全一樣，
   * 而使用者會以為自己的專案與訊息不見了。後端的註解裡逐字寫著這個顧慮。
   */
  | 'recovery-key-rejected'

export type Identity =
  /** 還沒問完。**不是**「未登入」。 */
  | { readonly state: 'unknown' }
  /** 問完了，沒有身分。 */
  | { readonly state: 'guest'; readonly reason: GuestReason }
  /** 問完了，這是後端回的那張名片。 */
  | { readonly state: 'signed-in'; readonly profile: ProfileOut }
  /**
   * 問不到。**跟訪客是兩件事**（`S06`）。
   *
   * `cause` 留著原始的錯誤 —— 畫面要能說出「現在問不到」而不是編一個理由。
   */
  | { readonly state: 'unavailable'; readonly cause: unknown }

/**
 * 暱稱的長度不被接受。**在送出之前拋**（`S02`）。
 *
 * ⚠️ **這個型別本身就是判準的一部分。** 只擋住請求是不夠的 ——
 * `operations.login()` 裡的 Zod 契約也會擋（`LoginIn` 有 min/max），
 * 所以「有沒有送出請求」這一條**在拿掉這裡的檢查之後仍然是綠的**。
 * 分得開兩者的是「使用者得不得知是長度的問題」：Zod 丟的是 `ZodError`，
 * 訊息是英文的 schema 語彙，指不回輸入框。
 */
export class NicknameLengthError extends Error {
  override name = 'NicknameLengthError'
  constructor(
    readonly min: number,
    readonly max: number,
    readonly actual: number,
  ) {
    super(`暱稱要 ${min} 到 ${max} 個字，現在是 ${actual} 個。`)
  }
}

/** 這把恢復金鑰後端找不到（404）。`S10`／`S17`。 */
export class RecoveryKeyRejectedError extends Error {
  override name = 'RecoveryKeyRejectedError'
  constructor() {
    super(
      '這把恢復金鑰對應的名片不存在。它可能被刪掉了，或者資料庫重建過。' +
        '不會自動改成建立一張新名片 —— 那樣你會以為自己的東西不見了。',
    )
  }
}
