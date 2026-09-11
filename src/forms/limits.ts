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
