// 收件匣的領域錯誤。規格 `FE-K01`〈寄信是悲觀更新，失敗留值〉。

/** 收件人不存在（404）：這個人已經不在了。文案是前端寫的（`describeError`），不是後端的 `detail`。**只在寄信那一次請求上轉。** */
export class RecipientGoneError extends Error {
  override name = 'RecipientGoneError'
  constructor() {
    super('這個人已經不在了。')
  }
}
