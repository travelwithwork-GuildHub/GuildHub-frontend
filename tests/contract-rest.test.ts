import { describe, expect, it } from 'vitest'
import { ProfileOut, ProjectCreate, SeatClaim } from '@/api/contract/rest'
import { ErrorEnvelope, isJsonErrorBody } from '@/api/contract/errors'

// 規格：openspec/specs/api-contract/spec.md
//   Requirement: 資料形狀只有一份定義 —— Scenario FE-O01-S01 / FE-O01-S02
//   Requirement: 錯誤 envelope 只涵蓋 JSON 的錯誤回應 —— FE-O01-S09 / FE-O01-S12
//
// ⚠️ Scenario ID 只放在 `it` 標題上，而且那條 `it` 要把該 Scenario 的每一個
// WHEN/THEN 子句都跑過 —— 理由見 `contract-limits.test.ts` 的檔頭。

const profile = {
  id: '3f2a1b4c-0000-4000-8000-000000000001',
  display_name: '阿澤',
  avatar_id: 0,
  skills: ['React', 'Rapier'],
  hours_per_week: 20,
  bio: null,
  updated_at: '2026-09-08T06:00:00Z',
}

describe('REST 契約', () => {
  it('[FE-O01-S01] 契約能驗一份真的後端回應', () => {
    const parsed = ProfileOut.parse(profile)
    expect(parsed.display_name).toBe('阿澤')
    expect(parsed.skills).toEqual(['React', 'Rapier'])

    const bad = ProfileOut.safeParse({ ...profile, skills: 'React' })
    expect(bad.success, 'skills 是字串時應該失敗').toBe(false)
    // 只驗「失敗」不夠 —— 一個永遠失敗的 schema 也會讓這條通過。
    // 要能指出**是哪一個欄位**，否則錯誤訊息對誰都沒有用。
    expect(bad.error?.issues.map((i) => i.path.join('.'))).toContain('skills')

    // 「失敗 MUST NOT 是拋出未捕捉的例外以外的靜默結果」
    expect(() => ProfileOut.safeParse(null)).not.toThrow()
    expect(ProfileOut.safeParse(null).success).toBe(false)
  })

  it('[FE-O01-S02] 缺必填欄位會被擋下，多出來的欄位放行但不留下', () => {
    const { display_name: _omitted, ...withoutName } = profile
    expect(ProfileOut.safeParse(withoutName).success, '少了 display_name 應該失敗').toBe(false)

    // **這兩件事是刻意不一致的**：執行期放行（後端加欄位不該讓前端當掉），
    // 型別哨兵變紅（新欄位是契約變更，要被人看到）。
    // 哨兵那一半在 `contract-drift.test.ts` 的 S11。
    const parsed = ProfileOut.parse({ ...profile, banner_url: 'https://example.test/b.png' })
    expect(parsed, '多餘的欄位不該留在結果裡').not.toHaveProperty('banner_url')
    expect(parsed.display_name).toBe('阿澤')
  })

  it('有預設值的欄位可以不送，輸出會補上', () => {
    // 超出 S01/S02 的字面，不掛 ID。`needed_skills` 與 `seat_count` 在後端
    // 有預設值 —— 用 `.default()` 讓輸入可以省略、輸出是必填。
    const parsed = ProjectCreate.parse({ title: '重做入口', body: '把首頁換掉' })
    expect(parsed.needed_skills).toEqual([])
    expect(parsed.seat_count).toBe(4)
    expect(SeatClaim.parse({ seat_index: 3 }).desk_template).toBe(0)
  })
})

describe('錯誤 envelope', () => {
  it('[FE-O01-S09] 兩種 detail 形狀都驗得過，其他形狀不行', () => {
    const asString = ErrorEnvelope.parse({ detail: '這個座位已經有人了' })
    expect(typeof asString.detail, 'detail 是字串時要辨識得出來').toBe('string')

    const asArray = ErrorEnvelope.parse({
      detail: [{ type: 'missing', loc: ['body', 'display_name'], msg: 'Field required', input: {} }],
    })
    expect(Array.isArray(asArray.detail), 'detail 是陣列時要辨識得出來').toBe(true)

    expect(ErrorEnvelope.safeParse({ error: 'boom' }).success, '不是這個形狀的要失敗').toBe(false)
  })

  it('[FE-O01-S12] 500 的純文字回應不會被誤判成錯誤 envelope', () => {
    // 實測 `POST /api/login`（資料庫未連上）：
    //   HTTP/1.1 500 Internal Server Error
    //   content-type: text/plain; charset=utf-8
    //   Internal Server Error
    // 而 500 正是**超長欄位**會走到的那條路。
    expect(
      ErrorEnvelope.safeParse('Internal Server Error').success,
      '純文字的 body 不該被當成這個 envelope',
    ).toBe(false)

    expect(
      () => JSON.parse('Internal Server Error'),
      '那段文字連 JSON 都不是 —— 契約不能假設錯誤回應一定是 JSON',
    ).toThrow()
  })

  it('content-type 的守衛認得出 JSON 與非 JSON', () => {
    expect(isJsonErrorBody('text/plain; charset=utf-8')).toBe(false)
    expect(isJsonErrorBody('application/json')).toBe(true)
    // FastAPI 的錯誤回應帶 charset 時也要認得
    expect(isJsonErrorBody('application/json; charset=utf-8')).toBe(true)
    expect(isJsonErrorBody(null)).toBe(false)
  })
})
