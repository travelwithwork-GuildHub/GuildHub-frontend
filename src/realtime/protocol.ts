import { ServerMessage } from '@/api/contract/ws'

// 進來的訊息要滿足什麼才會被交付下游。規格 FE-R02。
//
// `FE-R01` 把非 `hello` 的訊息**原樣（raw string）交出去**，接的人是這裡。
// 沒有這一層的話，`FE-R05` / `FE-R07` / `FE-R08` 會各自 `JSON.parse` 再
// 自己判斷 `t` —— 同一份協定被判斷三次，而**最鬆的那一次決定了實際的
// 信任邊界**。
//
// ⚠️ **這一層不做分派。** 「`snapshot` 給誰、`pos` 給誰」是下游各自的事。

export type ProtocolViolation =
  /** 不是合法的 JSON。 */
  | 'not-json'
  /** 是合法 JSON，但不是物件（數字、陣列、null⋯⋯）。 */
  | 'not-an-object'
  /**
   * 通過了 JSON 與物件檢查，但不符合協定 —— 缺 `t`、未知的 `t`、
   * 或者 `t` 對但欄位形狀不合。
   *
   * ⚠️ **這三種刻意不分開。** 對呼叫端來說可安全處置的方式完全一樣：
   * 通報、丟棄、不交付。分得更細只會讓下一個人寫出一段沒有用的 switch。
   */
  | 'not-in-contract'

export type ValidationResult =
  | { readonly ok: true; readonly message: ServerMessage }
  | { readonly ok: false; readonly violation: ProtocolViolation; readonly raw: string }

/**
 * 違規通報。**建立驗證器時必填。**
 *
 * ⚠️ **它保證不了呼叫端有沒有在看。**
 *
 * 必填的價值是**逼呼叫端在組裝的地方明確表態** —— 傳一個 `() => {}` 進來
 * 就等於靜默忽略，而型別擋不住那件事。把它當成「因此絕不會被忽略」的保證，
 * 就是高估這個閘門（`AGENTS.md`：高估一個閘門比沒有它更危險）。
 *
 * 正式組裝時要接到哪裡（UI、telemetry）是 `FE-X03`（W2）與 `FE-R12`（W5）。
 */
export type OnProtocolViolation = (violation: ProtocolViolation, raw: string) => void

/**
 * 建立一個訊息驗證器。
 *
 * 回傳的函式對每一則訊息回傳成功或失敗，**失敗時不交出任何訊息** ——
 * 下游拿到的每一則都必須是驗證過的。
 *
 * **訊息級的失敗只影響那一則**：不斷線、不改變任何狀態、
 * 不阻止後續訊息被驗證與交付。一則格式錯掉的 `pos` 不該讓其他玩家、
 * 後續的 `snapshot`、或整條連線停擺。
 *
 * 也**沒有**「累積幾次違規就斷線」之類的策略 —— 協定沒有規定那件事。
 */
export function createMessageValidator(
  onViolation: OnProtocolViolation,
): (raw: string) => ValidationResult {
  return (raw: string): ValidationResult => {
    const fail = (violation: ProtocolViolation): ValidationResult => {
      onViolation(violation, raw)
      return { ok: false, violation, raw }
    }

    let data: unknown
    try {
      data = JSON.parse(raw)
    } catch {
      return fail('not-json')
    }

    // `typeof null === 'object'`，陣列也是 object —— 兩個都要排除。
    if (data === null || typeof data !== 'object' || Array.isArray(data)) {
      return fail('not-an-object')
    }

    // ⚠️ **用 `api-contract` 的 union 驗，不在這裡重新定義任何形狀。**
    //
    // 這一步同時擋掉三件事：缺 `t`、未知的 `t`、以及**`t` 對但欄位不合**。
    // 只檢查「`t` 在不在清單裡」是不夠的 —— 那會讓一則少了 `you` 的
    // `hello` 通過，而下游會拿到一個缺欄位的物件。
    //
    // **後端新增的訊息類型也會落在這裡**，而那是刻意的：對一個正在執行的
    // 舊版客戶端而言，「後端送錯」與「契約更新了」可安全處置的方式完全相同。
    // 替未來的契約更新留一條寬鬆的路，等於讓**開發時**也不會炸 ——
    // 而那是唯一有人會看到它的時機。
    const parsed = ServerMessage.safeParse(data)
    if (!parsed.success) return fail('not-in-contract')

    return { ok: true, message: parsed.data }
  }
}
