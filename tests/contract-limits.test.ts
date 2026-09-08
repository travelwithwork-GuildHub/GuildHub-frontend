import { describe, expect, it } from 'vitest'
import { LIMITS, UNBOUNDED } from '@/api/contract/limits'
import { LoginIn, MessageCreate, ProfileUpdate, SeatClaim } from '@/api/contract/rest'

// 規格：openspec/changes/fe-o01-contract/specs/api-contract/spec.md
//   Requirement: 長度與範圍限制有單一來源，且以 code point 計算
//   —— Scenario FE-O01-S03 / FE-O01-S04 / FE-O01-S05

const repeat = (s: string, n: number) => s.repeat(n)

describe('[FE-O01-S03] 邊界成對驗，上下界都要', () => {
  // **只驗「超過上限會拒絕」是不夠的**：把上限從 20 改成 10 之後，
  // 送 21 仍然被拒，那種測試照樣是綠的（WBS 的 FE-O05 那條 Alarm）。
  // 所以每一組都驗 max 接受、max+1 拒絕、min-1 拒絕。

  it('display_name 1–20', () => {
    expect(LoginIn.safeParse({ nickname: repeat('字', 20) }).success).toBe(true)
    expect(LoginIn.safeParse({ nickname: repeat('字', 21) }).success).toBe(false)
    expect(LoginIn.safeParse({ nickname: '' }).success).toBe(false)
  })

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

  // WS 狀態文字的 ≤12 在 `contract-ws.test.ts` —— 那個 schema 屬於 WS 那一刀。
})

describe('[FE-O01-S04] 長度單位是 code point，不是 UTF-16 code unit', () => {
  // 後端的算法：
  //   Postgres  char_length()  數 code point
  //   Python    len()          數 code point
  // 用 JS 的 `.length`（UTF-16 code unit）會**拒絕後端收得下的字串**，
  // 而使用者只會看到「打不進去」，沒有任何錯誤訊息解釋為什麼。

  const twentyEmoji = repeat('😀', 20)

  it('20 個 BMP 外的字元當 display_name：後端接受，契約也要接受', () => {
    // 前提先釘住，否則這條測試在講別的事
    expect(twentyEmoji.length, 'UTF-16 code unit 應該是 40').toBe(40)
    expect([...twentyEmoji].length, 'code point 應該是 20').toBe(20)

    expect(
      LoginIn.safeParse({ nickname: twentyEmoji }).success,
      '契約用了 UTF-16 code unit 計數 —— 它拒絕了後端收得下的字串',
    ).toBe(true)
  })

  it('21 個同樣的字元要拒絕', () => {
    expect(LoginIn.safeParse({ nickname: repeat('😀', 21) }).success).toBe(false)
  })

  it('組合字元照 code point 算，跟後端一致', () => {
    // é = e + U+0301 是**兩個** code point。Postgres 的 char_length 也數兩個，
    // 所以 11 個 é 是 22 個 code point，超過 20。
    const combining = repeat('e\u0301', 11)
    expect([...combining].length).toBe(22)
    expect(LoginIn.safeParse({ nickname: combining }).success).toBe(false)
  })
})

describe('[FE-O01-S05] 沒有後端上限的欄位，契約要說出來', () => {
  it('projects.title / body 的上限是明確的「未定」，不是缺鍵', () => {
    // **`undefined` 跟 `null` 在這裡差很多**：前者看起來像「沒查過」，
    // 後者是「查過了，後端沒有上限」。
    expect(LIMITS.projectTitle.max).toBe(UNBOUNDED)
    expect(LIMITS.projectBody.max).toBe(UNBOUNDED)
    expect(LIMITS.skillCount.max).toBe(UNBOUNDED)
    expect(Object.hasOwn(LIMITS.projectTitle, 'max')).toBe(true)
  })

  it('有上限的欄位讀得到數字 —— FE-O06 之後要從這裡拿', () => {
    // WBS FE-O06：「maxlength、剩餘字數、送出鈕禁用都要**真的拿到那些數字**」。
    // 這一條釘住「拿得到」這件事：改成 `.refine()` 之類讀不到數字的寫法會紅。
    expect(LIMITS.displayName.max).toBe(20)
    expect(LIMITS.bio.max).toBe(300)
    expect(LIMITS.messageBody.max).toBe(2000)
    expect(LIMITS.statusText.max).toBe(12)
    expect(LIMITS.seatIndex.max).toBe(7)
  })
})
