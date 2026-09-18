import { describe, expect, it } from 'vitest'
import { ProjectResourceCreate, ProjectResourceOut, ProjectResourceUpdate } from '@/api/contract/rest'
import { LIMIT_SOURCES } from '@/api/contract/limits'

// 規格：openspec/changes/fe-j14-project-resources/specs/api-contract/spec.md
//   Requirement: 資料形狀只有一份定義 —— Scenario FE-J14-S25
//   Requirement: 長度與範圍限制有單一來源，且以 code point 計算 —— Scenario FE-J14-S27
//
// ⚠️ Scenario ID 只放在 `it` 標題上，而且那條 `it` 要把該 Scenario 的每一個
// WHEN/THEN 子句都跑過 —— 理由見 `contract-limits.test.ts` 的檔頭。
//
// **不連任何外部服務。**

const create = { label: 'Repo', type: 'github', url: 'https://github.com/o/r' } as const

const out = {
  id: '3f2a1b4c-0000-4000-8000-000000000001',
  project_id: '3f2a1b4c-0000-4000-8000-000000000002',
  label: 'Repo',
  type: 'github',
  url: 'https://github.com/o/r',
  created_at: '2026-09-17T06:00:00Z',
}

/** 開頭固定、總長恰好 `n` 個 code point 的合法網址。 */
function urlOfLength(n: number): string {
  const head = 'https://example.com/'
  return head + 'a'.repeat(n - head.length)
}

describe('專案資源的契約形狀', () => {
  it('[FE-J14-S25] 專案資源的三個形狀：type 封閉、更新可省略不可 null', () => {
    expect(ProjectResourceCreate.parse(create)).toEqual(create)

    const otherType = ProjectResourceCreate.safeParse({ ...create, type: 'other' })
    expect(otherType.success, 'type 是 other 應該失敗 —— V1 的集合是封閉的').toBe(false)
    expect(otherType.error?.issues.map((i) => i.path.join('.'))).toContain('type')

    const { url: _dropped, ...withoutUrl } = create
    const missingUrl = ProjectResourceCreate.safeParse(withoutUrl)
    expect(missingUrl.success, '少了 url 應該失敗').toBe(false)
    expect(missingUrl.error?.issues.map((i) => i.path.join('.'))).toContain('url')

    // 更新：三個欄位皆可省略。
    expect(ProjectResourceUpdate.parse({})).toEqual({})
    const onlyUrl = ProjectResourceUpdate.parse({ url: 'https://example.com' })
    expect(onlyUrl).toEqual({ url: 'https://example.com' })
    // 「結果 SHALL 只含有給的鍵」：沒給的欄位不能被補成 undefined 的鍵，
    // 不然 `PATCH` 的 body 會帶著一堆 `undefined` 出去（S17／S18 靠這件事）。
    expect(Object.keys(onlyUrl)).toEqual(['url'])

    // **可省略不等於可為 null。** 後端欄位型別是 `str`，明確送 null 回 422。
    expect(ProjectResourceUpdate.safeParse({ label: null }).success, '{"label":null} 應該失敗').toBe(false)

    const parsedOut = ProjectResourceOut.parse({ ...out, updated_at: '2026-09-18T06:00:00Z' })
    expect(parsedOut, '多餘的欄位不該留在結果裡').not.toHaveProperty('updated_at')
    expect(parsedOut.label).toBe('Repo')
  })
})

describe('專案資源的長度邊界', () => {
  it('[FE-J14-S27] 資源名稱與網址的邊界成對，且有出處', () => {
    // ⚠️⚠️ **數字寫死，不從 `LIMITS` 讀。**
    // 讀 `LIMITS.resourceUrl.max` 的話，把它改成 2000 之後這條測試的期望值
    // 跟著變成 2000／2001，然後**照樣是綠的** —— 那是恆真，不是判準
    //（`contract-limits.test.ts` 的 S03 同樣寫死 20／21，理由一樣）。
    // 這裡的 2048 是**規格的字面**（Scenario S27），不是從程式抄的。

    // emoji 一個算一個 code point，不是 UTF-16 的兩個。
    expect(ProjectResourceCreate.safeParse({ ...create, label: '😀'.repeat(100) }).success, '100 個 emoji 應該通過').toBe(true)
    expect(ProjectResourceCreate.safeParse({ ...create, label: '字'.repeat(101) }).success, '101 個字應該失敗').toBe(false)
    expect(ProjectResourceCreate.safeParse({ ...create, label: '' }).success, '空字串應該失敗').toBe(false)

    expect(ProjectResourceCreate.safeParse({ ...create, url: urlOfLength(2048) }).success, '2048 個字的網址應該通過').toBe(true)
    expect(ProjectResourceCreate.safeParse({ ...create, url: urlOfLength(2049) }).success, '2049 個字的網址應該失敗').toBe(false)

    // 出處：兩筆都要指向後端的 `sql/001_schema.sql`，而且是**行號**，不是散文。
    for (const key of ['resourceLabel', 'resourceUrl'] as const) {
      const entry = LIMIT_SOURCES[key]
      expect(entry, key).toBeDefined()
      expect(entry.source, key).toMatch(/^sql\/001_schema\.sql:\d+/)
      expect(entry.checkedOn, key).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
  })
})
