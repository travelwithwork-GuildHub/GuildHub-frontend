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
  /**
   * 沒有 session cookie。這是唯一的「你是訪客」（`FE-A06` 2026-09-21 反轉後）——
   * 恢復金鑰機制退場，`GET /api/me` 回 401 就是訪客，後面不再有「拿金鑰去恢復」那一步。
   */
  'no-session'

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

/**
 * 帳號或密碼錯（403）。規格 `FE-A08`。**不分「帳號不存在」與「密碼錯」**：後端刻意回同一句（不送出帳號存在性），
 * 這個型別也只有一種 —— 文案是前端寫的（`describeError`），不是後端的 `detail`。
 */
export class CredentialsRejectedError extends Error {
  override name = 'CredentialsRejectedError'
  constructor() {
    super('帳號或密碼錯誤。')
  }
}

/** 註冊時帳號撞名（409）。規格 `FE-A08`。 */
export class LoginIdTakenError extends Error {
  override name = 'LoginIdTakenError'
  constructor() {
    super('這個帳號已經有人用了。')
  }
}

