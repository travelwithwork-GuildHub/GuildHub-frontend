import { describe, expect, it } from 'vitest'
import { boundaryValues } from '@/api/contract/boundaries'
import { LIMITS, LIMIT_SOURCES, UNBOUNDED, codePointLength, remaining, violates } from '@/api/contract/limits'

// 規格：openspec/changes/fe-o06-limit-source/specs/limit-source/spec.md
//   Requirement: LIMITS 是唯一來源，契約 schema 與邊界表都從它取值 —— S01、S03（S02 在 `limit-lint-rule.test.ts`）
//   Requirement: 長度單位是 Unicode code point，helper 是唯一算法 —— S04、S05
//
// **不連任何外部服務。**

describe('邊界值從 limit 算', () => {
  it('[FE-O06-S01] 改 limit，邊界值跟著變；UNBOUNDED 沒有超長的 reject', () => {
    const two = boundaryValues({ min: 0, max: 200 })
    expect(two.accept).toContain('字'.repeat(200))
    expect(two.accept).toContain('😀'.repeat(200))
    expect(two.accept.find((v) => v.startsWith('😀'))?.length, 'emoji 的 .length 是 code point 的兩倍').toBe(400)
    expect(two.reject).toContain('字'.repeat(201))

    const bio = boundaryValues(LIMITS.bio)
    const bioMax = LIMITS.bio.max as number
    expect(bio.accept).toContain('字'.repeat(bioMax))
    expect(bio.reject).toContain('字'.repeat(bioMax + 1))
    expect(bio.reject, 'min 是 0 沒有 min-1').not.toContain('')
    expect(bio.accept).toContain('')

    const title = boundaryValues({ min: 1, max: UNBOUNDED })
    expect(title.reject).toEqual([''])
    expect(title.accept.some((v) => codePointLength(v) === 10_000)).toBe(true)
    expect(title.accept.every((v) => !title.reject.includes(v))).toBe(true)
  })
})

describe('每一個限制都有出處', () => {
  it('[FE-O06-S03] LIMITS 的每個鍵在 LIMIT_SOURCES 有一筆；沒有多的鍵', () => {
    const keys = Object.keys(LIMITS).sort()
    expect(Object.keys(LIMIT_SOURCES).sort()).toEqual(keys)
    for (const key of keys) {
      const entry = LIMIT_SOURCES[key as keyof typeof LIMIT_SOURCES]
      expect(entry.source.length, key).toBeGreaterThan(0)
      expect(entry.checkedOn, key).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(Number.isNaN(Date.parse(entry.checkedOn)), key).toBe(false)
    }
  })
})

describe('長度單位是 code point', () => {
  it('[FE-O06-S04] emoji 與 CJK 各算一個字', () => {
    expect(codePointLength('😀'.repeat(20))).toBe(20)
    expect(codePointLength('字'.repeat(20))).toBe(20)
    expect('😀'.repeat(20).length, '這個 40 不能出現在任何判斷裡').toBe(40)
    // 組合字元：e + U+0301 是兩個 code point —— 跟後端 char_length 一致。
    expect(codePointLength('é')).toBe(2)
  })

  it('[FE-O06-S05] remaining 與 violates 的邊界', () => {
    const d = LIMITS.displayName
    expect(remaining(d, '')).toBe(20)
    expect(remaining(d, '字'.repeat(20))).toBe(0)
    expect(remaining(d, '字'.repeat(21))).toBe(-1)
    expect(remaining(LIMITS.projectTitle, '字'.repeat(10_000))).toBeNull()
    expect(violates(d, '')).toBe('too-short')
    expect(violates(d, '字'.repeat(20))).toBeNull()
    expect(violates(d, '😀'.repeat(20)), '20 個 emoji 是 20 個字').toBeNull()
    expect(violates(d, '字'.repeat(21))).toBe('too-long')
    expect(violates(LIMITS.projectTitle, '字'.repeat(10_000))).toBeNull()
    expect(violates(LIMITS.projectTitle, '')).toBe('too-short')
  })
})
