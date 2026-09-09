import { describe, expect, it } from 'vitest'
import { WORLD_COLORS, worldColor, type WorldColorName } from '@/design/world'
import { colorLiterals } from '@/design/colorScan'

// 規格：openspec/changes/fe-w09-world-design-system/specs/world-design-system/spec.md
//   FE-W09-S01  未知的 token 名要拋錯（**驗收在執行期，不是型別**）
//   FE-W09-S02  顏色字面值的判定（含 0x 數字形式）
//
// `FE-W09-S03`（掃描範圍）在 `tests/world-color-scan.test.ts` —— 那條要碰檔案系統。
// `FE-W09-S04`／`S05`／`S06`（快取與 primitive）在 `tests/world-primitives.test.ts`。

describe('世界的視覺常數', () => {
  it('[FE-W09-S01] 已知名稱回傳值，未知名稱拋錯', () => {
    expect(worldColor('skin')).toBe(WORLD_COLORS.skin)
    expect(worldColor('skin')).not.toBe('')

    // ⚠️ **驗收下在執行期，不是型別。** `@ts-expect-error` 只證明那一行
    // 有「某種」錯誤 —— 一個 `missingFunction(worldColor('typo'))` 在
    // `worldColor` 已經退化成接受任意字串時仍然會綠。
    const unknown = 'nope' as unknown as WorldColorName
    expect(() => worldColor(unknown)).toThrow(/nope/)
    // 訊息要包含至少一個合法名稱，否則打錯字的人不知道該用什麼
    expect(() => worldColor(unknown)).toThrow(/skin/)
  })
})

describe('顏色字面值的判定', () => {
  it('[FE-W09-S02] 字串與數字兩種形式都被抓到，取 token 不會', () => {
    expect(colorLiterals('<meshStandardMaterial color="#ff0000" />')).toContain('#ff0000')
    // **只看 `#` 的判定被這個繞得過**
    expect(colorLiterals('<meshBasicMaterial color={0xff0000} />')).toContain('0xff0000')
    expect(colorLiterals("const c = worldColor('skin')")).toHaveLength(0)
  })

  it('[FE-W09-S02] 明文豁免的那一行整行跳過', () => {
    expect(colorLiterals("const c = '#ff0000' // world-color-allow 理由")).toHaveLength(0)
  })
})

