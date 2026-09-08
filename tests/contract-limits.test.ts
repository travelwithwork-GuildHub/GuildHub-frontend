import { describe, expect, it } from 'vitest'
import { LIMITS, UNBOUNDED } from '@/api/contract/limits'
import { LoginIn, MessageCreate, ProfileUpdate, SeatClaim } from '@/api/contract/rest'

// 規格：openspec/specs/api-contract/spec.md
//   Requirement: 長度與範圍限制有單一來源，且以 code point 計算
//   —— Scenario FE-O01-S03 / FE-O01-S05
//
// ⚠️ **Scenario ID 只放在 `it` 標題上，而且那條 `it` 要把該 Scenario 的
// 每一個 WHEN/THEN 子句都跑過。**
//
// 放在 `describe` 上等於沒放：缺口報告只認通過的**葉節點**標題
//（`AGENTS.md`：「那個 describe 底下每一條都會沾到它，一條 ID 就能替一整群
// 測試背書」）。把同一個 ID 複製到底下每一條 `it`，是同一個問題換個形式 ——
// 四條裡有一條通過，報告就說涵蓋了。
//
// **ID 是那條測試對規格的宣告，不是覆蓋率標記。** 標題與斷言範圍要一致。
// 超出 Scenario 的額外案例照寫，但不掛 ID。

const repeat = (s: string, n: number) => s.repeat(n)

describe('長度與範圍限制', () => {
  it('[FE-O01-S03] 邊界成對驗，上下界都要', () => {
    // Scenario 講的是 display_name：20 通過、21 失敗、0 失敗。
    expect(LoginIn.safeParse({ nickname: repeat('字', 20) }).success, '20 個字應該通過').toBe(true)
    expect(LoginIn.safeParse({ nickname: repeat('字', 21) }).success, '21 個字應該失敗').toBe(false)
    expect(LoginIn.safeParse({ nickname: '' }).success, '空字串應該失敗').toBe(false)
  })

  // 以下三條超出 S03 的字面（它只講 display_name），所以不掛 ID。
  // **但仍然要驗** —— 只驗一個欄位的話，另外三個欄位打錯數字沒有人會發現。

  it('bio ≤300，可以是空的', () => {
    expect(ProfileUpdate.safeParse({ bio: repeat('字', 300) }).success).toBe(true)
    expect(ProfileUpdate.safeParse({ bio: repeat('字', 301) }).success).toBe(false)
    expect(ProfileUpdate.safeParse({ bio: '' }).success).toBe(true)
  })

  it('站內信 body 1–2000', () => {
    const to = { recipient_id: 'u1' }
    expect(MessageCreate.safeParse({ ...to, body: repeat('字', 2000) }).success).toBe(true)
    expect(MessageCreate.safeParse({ ...to, body: repeat('字', 2001) }).success).toBe(false)
    expect(MessageCreate.safeParse({ ...to, body: '' }).success).toBe(false)
  })

  it('seat_index 0–7', () => {
    expect(SeatClaim.safeParse({ seat_index: 0 }).success).toBe(true)
    expect(SeatClaim.safeParse({ seat_index: 7 }).success).toBe(true)
    expect(SeatClaim.safeParse({ seat_index: 8 }).success).toBe(false)
    expect(SeatClaim.safeParse({ seat_index: -1 }).success).toBe(false)
  })

  it('[FE-O01-S05] 沒有後端上限的欄位，契約要說出來', () => {
    // **`undefined` 跟 `null` 在這裡差很多**：前者看起來像「沒查過」，
    // 後者是「查過了，後端沒有上限」。
    expect(LIMITS.projectTitle.max, 'projects.title 的上限應該是明確的未定').toBe(UNBOUNDED)
    expect(Object.hasOwn(LIMITS.projectTitle, 'max'), '那個鍵不能不存在').toBe(true)
    expect(LIMITS.projectBody.max).toBe(UNBOUNDED)
    expect(LIMITS.skillCount.max).toBe(UNBOUNDED)
    // 「MUST NOT 施加一個憑空發明的數字上限」：超長的 title 要通過。
    expect(
      LIMITS.projectTitle.max === UNBOUNDED,
      '契約替 projects.title 發明了一個後端沒有的上限',
    ).toBe(true)
  })

  it('有上限的欄位讀得到數字 —— FE-O06 之後要從這裡拿', () => {
    // WBS FE-O06：「maxlength、剩餘字數、送出鈕禁用都要**真的拿到那些數字**」。
    // 改成 `.refine()` 之類讀不到數字的寫法會讓這條紅。
    expect(LIMITS.displayName.max).toBe(20)
    expect(LIMITS.bio.max).toBe(300)
    expect(LIMITS.messageBody.max).toBe(2000)
    expect(LIMITS.statusText.max).toBe(12)
    expect(LIMITS.seatIndex.max).toBe(7)
  })
})

describe('長度單位是 code point，不是 UTF-16 code unit', () => {
  // S04 的字面是「WS 狀態文字」，那條在 `contract-ws.test.ts`。
  // 這裡驗的是**同一個單位在 REST 欄位上也成立** —— 後端的 char_length
  // 與 len() 是同一個算法，兩邊漏掉任何一邊都會讓使用者打不進字。

  it('20 個 BMP 外的字元當 display_name：後端接受，契約也要接受', () => {
    const twentyEmoji = repeat('😀', 20)
    // 前提先釘住，否則這條測試在講別的事
    expect(twentyEmoji.length, 'UTF-16 code unit 應該是 40').toBe(40)
    expect([...twentyEmoji].length, 'code point 應該是 20').toBe(20)

    expect(
      LoginIn.safeParse({ nickname: twentyEmoji }).success,
      '契約用了 UTF-16 code unit 計數 —— 它拒絕了後端收得下的字串',
    ).toBe(true)
    expect(LoginIn.safeParse({ nickname: repeat('😀', 21) }).success).toBe(false)
  })

  it('組合字元照 code point 算，跟後端一致', () => {
    // é = e + U+0301 是**兩個** code point。Postgres 的 char_length 也數兩個，
    // 所以 11 個 é 是 22 個 code point，超過 20。
    const combining = repeat('é', 11)
    expect([...combining].length).toBe(22)
    expect(LoginIn.safeParse({ nickname: combining }).success).toBe(false)
  })
})
