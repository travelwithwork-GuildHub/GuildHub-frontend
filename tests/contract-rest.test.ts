import { describe, expect, it } from 'vitest'
import { ProfileOut, ProjectCreate, SeatClaim } from '@/api/contract/rest'
import { ErrorEnvelope, isJsonErrorBody } from '@/api/contract/errors'

// 規格：openspec/changes/fe-o01-contract/specs/api-contract/spec.md
//   Requirement: 資料形狀只有一份定義 —— Scenario FE-O01-S01 / FE-O01-S02
//   Requirement: 錯誤 envelope 只涵蓋 JSON 的錯誤回應 —— FE-O01-S09 / FE-O01-S12

const profile = {
  id: '3f2a1b4c-0000-4000-8000-000000000001',
  display_name: '阿澤',
  avatar_id: 0,
  skills: ['React', 'Rapier'],
  hours_per_week: 20,
  bio: null,
  updated_at: '2026-09-08T06:00:00Z',
}

describe('[FE-O01-S01] 契約能驗一份真的後端回應', () => {
  it('形狀對的資料通過，而且型別是已知的', () => {
    const parsed = ProfileOut.parse(profile)
    expect(parsed.display_name).toBe('阿澤')
    expect(parsed.skills).toEqual(['React', 'Rapier'])
  })

  it('skills 換成字串就失敗，而且指得出是哪個欄位', () => {
    const result = ProfileOut.safeParse({ ...profile, skills: 'React' })
    expect(result.success).toBe(false)
    // 只驗「失敗」不夠 —— 一個永遠失敗的 schema 也會讓這條通過。
    // 要能指出**是哪一個欄位**，否則錯誤訊息對使用者與對我們都沒有用。
    const paths = result.error?.issues.map((i) => i.path.join('.'))
    expect(paths).toContain('skills')
  })

  it('失敗是回傳值，不是拋例外 —— safeParse 不該炸掉呼叫端', () => {
    expect(() => ProfileOut.safeParse(null)).not.toThrow()
    expect(ProfileOut.safeParse(null).success).toBe(false)
  })
})

describe('[FE-O01-S02] 缺欄位擋下、多欄位放行', () => {
  it('少了必填欄位要失敗', () => {
    const { display_name: _omitted, ...withoutName } = profile
    expect(ProfileOut.safeParse(withoutName).success).toBe(false)
  })

  it('後端多一個欄位時要通過，而且結果不含那個欄位', () => {
    // **這兩件事是刻意不一致的**：執行期放行（後端加欄位不該讓前端當掉），
    // 型別哨兵變紅（新欄位是契約變更，要被人看到）。
    // 哨兵那一半在 `contract-drift.test.ts`。
    const parsed = ProfileOut.parse({ ...profile, banner_url: 'https://example.test/b.png' })
    expect(parsed).not.toHaveProperty('banner_url')
    expect(parsed.display_name).toBe('阿澤')
  })

  it('有預設值的欄位可以不送，輸出會補上', () => {
    // `needed_skills` 與 `seat_count` 在後端有預設值。用 `.default()` 讓
    // **輸入**可以省略、**輸出**是必填 —— 正好對上產出的型別。
    const parsed = ProjectCreate.parse({ title: '重做入口', body: '把首頁換掉' })
    expect(parsed.needed_skills).toEqual([])
    expect(parsed.seat_count).toBe(4)
    expect(SeatClaim.parse({ seat_index: 3 }).desk_template).toBe(0)
  })
})

describe('[FE-O01-S09] 兩種 detail 形狀都驗得過，其他形狀不行', () => {
  it('後端自己丟的錯誤：detail 是可直接顯示的字串', () => {
    const parsed = ErrorEnvelope.parse({ detail: '這個座位已經有人了' })
    expect(typeof parsed.detail).toBe('string')
  })

  it('框架自動產的 422：detail 是結構化陣列', () => {
    const parsed = ErrorEnvelope.parse({
      detail: [{ type: 'missing', loc: ['body', 'nickname'], msg: 'Field required', input: {} }],
    })
    expect(Array.isArray(parsed.detail)).toBe(true)
  })

  it('不是這個形狀的就失敗', () => {
    expect(ErrorEnvelope.safeParse({ error: 'boom' }).success).toBe(false)
  })
})

describe('[FE-O01-S12] 500 的純文字回應不會被誤判成錯誤 envelope', () => {
  // 實測 `POST /api/login`（資料庫未連上）：
  //   HTTP/1.1 500 Internal Server Error
  //   content-type: text/plain; charset=utf-8
  //   Internal Server Error
  // 而 500 正是**超長欄位**會走到的那條路。

  it('純文字的 body 不是這個 envelope', () => {
    expect(ErrorEnvelope.safeParse('Internal Server Error').success).toBe(false)
  })

  it('那段文字連 JSON 都不是 —— 契約不能假設錯誤回應一定是 JSON', () => {
    expect(() => JSON.parse('Internal Server Error')).toThrow()
  })

  it('content-type 的守衛認得出 JSON 與非 JSON', () => {
    expect(isJsonErrorBody('text/plain; charset=utf-8')).toBe(false)
    expect(isJsonErrorBody('application/json')).toBe(true)
    // FastAPI 的錯誤回應帶 charset 時也要認得
    expect(isJsonErrorBody('application/json; charset=utf-8')).toBe(true)
    expect(isJsonErrorBody(null)).toBe(false)
  })
})
