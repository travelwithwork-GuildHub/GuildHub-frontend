import { LIMITS, UNBOUNDED, type Limit } from '@/api/contract/limits'

// 前端自訂的上限。規格 `FE-X05`〈前端自訂的上限另立一個模組，契約永遠只看 `LIMITS`〉。
//
// ⚠️ **這裡的數字沒有後端出處** —— 後端對這些欄位沒有 check（`LIMITS.*.max` 是 `UNBOUNDED`），是我們替使用者訂的產品政策。
// 所以它**不在** `LIMITS` 裡（那張表每個數字都要有後端出處，`LIMIT_SOURCES` 守著），契約 schema 與契約測試也永遠不看它
//（契約的 `.min/.max` 只能接 `LIMITS.*`，lint 守著）。文案要說「本站的上限」，不假裝是後端的。
// 數字（兩位審查者第二輪定案）：title 60、body 2000、skills 最多 10 項、每項 40 字（「React Native (TypeScript)」要放得下）、每週時數 0～80。

export const FORM_LIMITS = {
  projectTitle: { min: 1, max: 60 },
  projectBody: { min: 1, max: 2000 },
  skillCount: { min: 0, max: 10 },
  skillLength: { min: 1, max: 40 },
  /** `hours_per_week`：後端 smallint、沒有 check；`LIMITS` 沒有這個鍵。 */
  hoursPerWeek: { min: 0, max: 80 },
  /**
   * 案子的座位數（`FE-J01`）：後端 smallint、沒有 check。`max` **推導自房間模板的格數**（`LIMITS.seatIndex` 是 0～7，八個工位）——
   * 建一個 `seat_count=9` 的案子，第 9 格永遠坐不到（後端 `claim_seat` 回 400）。不寫死 8：模板加格子時只改一處。
   * 下限 1：0 座位的案子成軍後沒有人坐得下。
   */
  seatCount: { min: 1, max: LIMITS.seatIndex.max + 1 },
  /**
   * 成軍時設的房間密碼（`FE-J04`）：後端不驗（`FE-O08` 量到 3 個字也 200）。太短的密碼讓「走到門前猜」變得可行；太長的隊員貼不進去。
   * 不是帳號密碼，不做強度規則。單位是 code point。
   */
  roomPassword: { min: 4, max: 64 },
} as const satisfies Record<string, { min: number; max: number }>

export type FormLimitKey = keyof typeof FORM_LIMITS

/**
 * 表單該用的上限：後端有上限（`LIMITS` 的 `max` 不是 `UNBOUNDED`）就用它；沒有才用 `FORM_LIMITS`。
 * 兩邊都有的話前端的**不得比後端寬**（那會讓使用者打得進去、送出卻 500）—— `S11` 守著。
 */
export function effectiveLimit(field: keyof typeof LIMITS | FormLimitKey): Limit {
  const contract = (LIMITS as Record<string, Limit | undefined>)[field]
  const ui = (FORM_LIMITS as Record<string, { min: number; max: number } | undefined>)[field]
  if (contract !== undefined && contract.max !== UNBOUNDED) return contract
  if (ui !== undefined) return { min: Math.max(ui.min, contract?.min ?? 0), max: ui.max }
  if (contract !== undefined) return contract
  throw new Error(`沒有 ${field} 的限制：LIMITS 與 FORM_LIMITS 都沒有`)
}
