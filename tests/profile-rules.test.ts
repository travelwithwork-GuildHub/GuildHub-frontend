import { describe, expect, it } from 'vitest'
import { normalizeSkills, joinSkills, skillKey } from '@/profile/normalizeSkills'
import { ProfileFormSchema, initialValues, isDirty, toPayload } from '@/profile/profileRules'

// 規格：openspec/changes/fe-a04-profile-editor/specs/profile-editor/spec.md
//   Requirement: 編輯四欄，payload 白名單，悲觀更新 —— 規則那一半（純函式）：正規化、schema、payload 白名單
//   Requirement: 未儲存就關要確認 —— dirty 的定義（正規化後的 payload 差異）
// 表單本身（S03–S11）在 `tests/profile-editor.test.tsx`（下一個 PR）。

const ME = {
  id: '11111111-1111-1111-1111-111111111111',
  display_name: '阿福',
  avatar_id: 0,
  skills: ['React', 'TypeScript'],
  hours_per_week: null,
  bio: '寫前端的。',
  updated_at: '2026-09-10T00:00:00Z',
}

describe('技能欄的正規化（純函式）', () => {
  it('以 , 或 ， 分割、trim、去空、去重不分大小寫且 NFC、第一個保留原文', () => {
    expect(normalizeSkills('React, ，TypeScript ,react')).toEqual(['React', 'TypeScript'])
    expect(normalizeSkills('')).toEqual([])
    expect(normalizeSkills(' , ,， ')).toEqual([])
    // NFC：組合字元的兩種寫法算同一個（é：U+00E9 vs e + U+0301）
    expect(normalizeSkills('café, café')).toEqual(['café'])
    expect(normalizeSkills('a，b，A')).toEqual(['a', 'b'])
    expect(joinSkills(['a', 'b'])).toBe('a, b')
    expect(skillKey('TypeScript')).toBe(skillKey('typescript'))
  })
})

describe('schema：時機分兩層、上限來自 effectiveLimit', () => {
  const ok = { display_name: '阿福', skills: 'React, ，TypeScript ,react', hours_per_week: '12', bio: '' }
  it('[FE-A04-S04] 正規化與空值：skills 去重、bio 空→null、hours 字串→整數；payload 只有四鍵', () => {
    const r = ProfileFormSchema.safeParse(ok)
    expect(r.success).toBe(true)
    if (!r.success) return
    expect(toPayload(r.data)).toEqual({ display_name: '阿福', skills: ['React', 'TypeScript'], hours_per_week: 12, bio: null })
    expect(Object.keys(toPayload({ ...r.data, avatar_id: 9 } as never)).sort(), '白名單：多的鍵不會被送出').toEqual(['bio', 'display_name', 'hours_per_week', 'skills'])
  })
  it('hours 空字串 → null（type=number 清空是 ""）；-1、81、1.5、abc 都是即時的 code（不是 too_small）', () => {
    expect(ProfileFormSchema.safeParse({ ...ok, hours_per_week: '' }).data?.hours_per_week).toBeNull()
    for (const bad of ['-1', '81', '1.5', 'abc']) {
      const r = ProfileFormSchema.safeParse({ ...ok, hours_per_week: bad })
      expect(r.success, `${bad} 過了`).toBe(false)
      expect(r.error?.issues.map((i) => i.code)).not.toContain('too_small')
    }
  })
  it('名字：空是 too_small（送出才說）；21 字是 too_big（即時）', () => {
    const empty = ProfileFormSchema.safeParse({ ...ok, display_name: '' })
    expect(empty.error?.issues.map((i) => i.code)).toEqual(['too_small'])
    expect(empty.error?.issues[0]?.message).toContain('1 到 20')
    const long = ProfileFormSchema.safeParse({ ...ok, display_name: '字'.repeat(21) })
    expect(long.error?.issues.map((i) => i.code)).toEqual(['too_big'])
  })
  it('[FE-A04-S08] skills 11 項是 too_big、文案說本站；單項 41 字是 custom、文案說本站；bio 301 是 too_big', () => {
    const many = ProfileFormSchema.safeParse({ ...ok, skills: Array.from({ length: 11 }, (_, i) => `s${i}`).join(',') })
    expect(many.error?.issues.map((i) => i.code)).toEqual(['too_big'])
    expect(many.error?.issues[0]?.message).toContain('本站')
    const long = ProfileFormSchema.safeParse({ ...ok, skills: 'x'.repeat(41) })
    expect(long.error?.issues.map((i) => i.code)).toEqual(['custom'])
    expect(long.error?.issues[0]?.message).toContain('本站')
    expect(ProfileFormSchema.safeParse({ ...ok, bio: '字'.repeat(301) }).error?.issues.map((i) => i.code)).toEqual(['too_big'])
    expect(ProfileFormSchema.safeParse({ ...ok, bio: '字'.repeat(300) }).success).toBe(true)
  })
})

describe('預填與 dirty', () => {
  it('預填：skills 以「, 」接、hours 空值是空字串、bio null 是空字串', () => {
    expect(initialValues(ME)).toEqual({ display_name: '阿福', skills: 'React, TypeScript', hours_per_week: '', bio: '寫前端的。' })
    expect(initialValues({ ...ME, hours_per_week: 12, bio: null })).toEqual({ display_name: '阿福', skills: 'React, TypeScript', hours_per_week: '12', bio: '' })
  })
  it('[FE-A04-S09] dirty 比正規化後的 payload：全形逗號、空白、大小寫重複不算改；真的改了才算', () => {
    const base = initialValues(ME)
    expect(isDirty(base, ME)).toBe(false)
    expect(isDirty({ ...base, skills: 'React，  typescript' }, ME), '正規化後相同還算 dirty').toBe(false)
    expect(isDirty({ ...base, skills: 'React, TypeScript, react' }, ME)).toBe(false)
    expect(isDirty({ ...base, bio: '改了' }, ME)).toBe(true)
    expect(isDirty({ ...base, skills: 'React' }, ME)).toBe(true)
    expect(isDirty({ ...base, hours_per_week: '0' }, ME)).toBe(true)
    // useWatch 的 DeepPartial：欄位還沒同步時不炸、不算 dirty
    expect(isDirty(undefined, ME)).toBe(false)
    expect(isDirty({ display_name: '阿福' }, ME)).toBe(true) // skills 空 vs 兩項 → 不同
  })
})
