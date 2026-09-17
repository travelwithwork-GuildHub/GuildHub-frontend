import { describe, expect, it, vi } from 'vitest'
import { LIMITS } from '@/api/contract/limits'
import { FORM_LIMITS } from '@/forms/limits'
import { CreateProjectSchema, INITIAL, isDirty, toPayload } from '@/projects/projectRules'

// 規格：openspec/changes/fe-j01-create-project/specs/project-posting/spec.md
//   Requirement: 上限由前端守，數字有出處，時機照全站規則 —— S03 的 schema 那一半（哪些超限、訊息裡的數字、即時還是延後、上限是推導的）
//   Requirement: 送出的是白名單 payload⋯⋯ —— S05 的 payload 那一半（恰好四鍵、trim、正規化、整數）
//
// 表單怎麼把這些接到欄位上（`aria-invalid`、送出鈕停用、沒有請求）在 `create-project.test.tsx`（`--form`）。
// 這裡把 `LIMITS.seatIndex.max` 換成 5：`FORM_LIMITS.seatCount.max` SHALL 是 6，schema 的座位數訊息與判準也跟著 6 —— 寫死 8 兩處都要紅。

vi.mock('@/api/contract/limits', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/api/contract/limits')>()
  return { ...real, LIMITS: { ...real.LIMITS, seatIndex: { min: 0, max: 5 } } }
})

const parse = (patch: Partial<typeof INITIAL>) => CreateProjectSchema.safeParse({ ...INITIAL, title: '好', body: '好', ...patch })
/** 某個欄位的 issues；順便斷言它們**沒有一個是 `too_small`**（那會被 `useForm` 延到送出才說，規格要即時）。 */
function immediateIssues(patch: Partial<typeof INITIAL>, field: keyof typeof INITIAL) {
  const result = parse(patch)
  expect(result.success, `${field} 該紅卻過了`).toBe(false)
  const issues = result.success ? [] : result.error.issues.filter((i) => i.path[0] === field)
  expect(issues.length, `${field} 沒有錯誤`).toBeGreaterThan(0)
  expect(issues.map((i) => i.code), `${field} 的錯誤會被延後`).not.toContain('too_small')
  return issues.map((i) => i.message).join(' ')
}

describe('上限由前端守，數字有出處，時機照全站規則', () => {
  it('[FE-J01-S03] 座位數上限推導自 LIMITS.seatIndex.max + 1（這裡是 5 → 6），下限 1', () => {
    expect(LIMITS.seatIndex.max, 'mock 沒生效').toBe(5)
    expect(FORM_LIMITS.seatCount).toEqual({ min: 1, max: 6 })
  })

  it('[FE-J01-S03] 標題／內容超上限即時紅，數字是 FORM_LIMITS 的；單位是 code point', () => {
    // 60 個「𠮷」是 120 個 UTF-16 code unit —— 用 `.length` 數的實作這裡會紅。**每個欄位各自驗**（codex 審查：只驗標題的話，內容改用 `.length` 照樣綠）
    expect(parse({ title: '𠮷'.repeat(FORM_LIMITS.projectTitle.max) }).success).toBe(true)
    expect(immediateIssues({ title: '𠮷'.repeat(FORM_LIMITS.projectTitle.max + 1) }, 'title')).toContain(String(FORM_LIMITS.projectTitle.max))
    expect(parse({ body: '𠮷'.repeat(FORM_LIMITS.projectBody.max) }).success).toBe(true)
    expect(immediateIssues({ body: '𠮷'.repeat(FORM_LIMITS.projectBody.max + 1) }, 'body')).toContain(String(FORM_LIMITS.projectBody.max))
  })

  it('[FE-J01-S03] 技能第 11 項、某一項 41 字即時紅；去空去重不分大小寫後算', () => {
    const eleven = Array.from({ length: FORM_LIMITS.skillCount.max + 1 }, (_, i) => `s${i}`).join(',')
    expect(immediateIssues({ skills: eleven }, 'skills')).toContain(String(FORM_LIMITS.skillCount.max))
    // 重複的不算第二項：10 項 ＋ 一個大小寫不同的重複 → 仍是 10 項
    expect(parse({ skills: `${Array.from({ length: FORM_LIMITS.skillCount.max }, (_, i) => `s${i}`).join(',')}, S0` }).success).toBe(true)
    // 每項長度也是 code point
    expect(immediateIssues({ skills: 'a, ' + '𠮷'.repeat(FORM_LIMITS.skillLength.max + 1) }, 'skills')).toContain(String(FORM_LIMITS.skillLength.max))
    expect(parse({ skills: '𠮷'.repeat(FORM_LIMITS.skillLength.max) }).success).toBe(true)
  })

  it('[FE-J01-S03] 座位數 0／7／2.5 即時紅（7 是 6+1）；範圍訊息裡的數字是 6 不是 8', () => {
    for (const bad of ['0', String(FORM_LIMITS.seatCount.max + 1)]) {
      const message = immediateIssues({ seat_count: bad }, 'seat_count')
      expect(message).toContain('6')
      expect(message).not.toContain('8')
    }
    expect(immediateIssues({ seat_count: '2.5' }, 'seat_count')).toContain('整數')
    expect(parse({ seat_count: '1' }).success).toBe(true)
    expect(parse({ seat_count: '6' }).success).toBe(true)
  })

  it('[FE-J01-S04] 標題、內容、座位數空白（含只有空白）是 too_small —— 送出時才說，不是即時的 invalid_type', () => {
    for (const patch of [{ title: '' }, { title: '   ' }, { body: '' }, { body: '\n' }, { seat_count: '' }, { seat_count: ' ' }]) {
      const result = parse(patch)
      expect(result.success).toBe(false)
      const codes = result.success ? [] : result.error.issues.map((i) => i.code)
      expect(codes, `${JSON.stringify(patch)} 的錯誤不是 too_small`).toEqual(['too_small'])
    }
  })
})

describe('送出的是白名單 payload', () => {
  it('[FE-J01-S05] payload 恰好四鍵：title／body trim、skills 正規化、seat_count 整數', () => {
    const result = CreateProjectSchema.safeParse({
      title: '  找一個會 Three.js 的人  ',
      body: '做一個小房間。\n',
      skills: ' three.js, TypeScript ,three.js ',
      seat_count: '3',
    })
    expect(result.success).toBe(true)
    if (!result.success) return
    const payload = toPayload(result.data)
    expect(payload).toEqual({ title: '找一個會 Three.js 的人', body: '做一個小房間。', needed_skills: ['three.js', 'TypeScript'], seat_count: 3 })
    expect(Object.keys(payload).sort()).toEqual(['body', 'needed_skills', 'seat_count', 'title'])
  })

  it('[FE-J01-S07] dirty：任一欄跟初始值不同；座位數留 4、還沒同步的欄位不算', () => {
    expect(isDirty(undefined)).toBe(false)
    expect(isDirty({})).toBe(false)
    expect(isDirty({ ...INITIAL })).toBe(false)
    expect(isDirty({ title: ' ' })).toBe(true)
    expect(isDirty({ skills: 'a' })).toBe(true)
    expect(isDirty({ seat_count: '5' })).toBe(true)
    expect(isDirty({ seat_count: '4' })).toBe(false)
  })
})
