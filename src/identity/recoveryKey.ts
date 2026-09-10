// 恢復金鑰的持久化。規格 `FE-A01-S07`／`S08`。
//
// ⚠️ **金鑰不是密碼。** 後端逐字寫著「拿到 token 的人就是那張名片的人」——
// 它不驗證任何東西。所以預設**不寫**：使用者沒有明確選擇之前，
// 這裡不碰任何持久儲存（`S07`）。
//
// ⚠️ **它就是 `ProfileOut.id`。** 後端沒有為它新增欄位或端點 ——
// 登入時已經回給前端了。所以「取得金鑰」不需要再打任何 API（`S09`）。

/** 金鑰在持久儲存裡的鍵。**改它等於讓所有已經記住的人回不去。** */
export const RECOVERY_KEY_STORAGE_KEY = 'guildhub.recovery-key'

/**
 * 金鑰放哪裡。
 *
 * ⚠️ **拆成介面不是為了「可替換」，是為了讓「預設不寫」驗得到。**
 * 判準要能斷言「這一次登入之後，持久儲存裡沒有東西」——
 * 而斷言「沒有東西」需要一個問得到的對象。
 */
export interface RecoveryKeyStore {
  /** 沒有、或讀不到，都是 `null`。 */
  read(): string | null
  remember(key: string): void
  forget(): void
}

/**
 * `localStorage` 版本。**每一個操作都包在 try/catch 裡。**
 *
 * ⚠️ 三種情況下光是**碰** `localStorage` 就會拋：無痕模式、
 * 使用者關掉網站資料、以及某些嵌入情境。不包的話，
 * 症狀是「整個應用在某些瀏覽器打不開」，而錯誤指向一行看起來無害的讀取。
 *
 * 讀不到就是 `null` —— 對呼叫端來說跟「沒有存過」一樣，
 * 而那正確：兩種情況下都沒有金鑰可用。
 */
export function browserRecoveryKeyStore(): RecoveryKeyStore {
  return {
    read() {
      try {
        return globalThis.localStorage?.getItem(RECOVERY_KEY_STORAGE_KEY) ?? null
      } catch {
        return null
      }
    },
    remember(key) {
      try {
        globalThis.localStorage?.setItem(RECOVERY_KEY_STORAGE_KEY, key)
      } catch {
        // 存不進去不是致命的 —— 這一次的登入已經成功了，
        // 失去的只是「下次自動回來」。**不要因此讓登入失敗。**
      }
    },
    forget() {
      try {
        globalThis.localStorage?.removeItem(RECOVERY_KEY_STORAGE_KEY)
      } catch {
        // 同上
      }
    },
  }
}
