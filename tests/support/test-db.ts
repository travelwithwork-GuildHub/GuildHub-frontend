// 測試用的資料庫：**只連 `INTERNAL_TEST_DATABASE_URL`，不動開發資料**。規格 `FE-O04`〈測試用另一個資料庫，不動開發資料〉。
//
// 兩條硬規則：跟 `INTERNAL_DATABASE_URL` 相同 → 拒絕（整檔紅，不是 skip）；沒設 → skip，**不退回開發庫**。
// 「退回」是 L3 的教訓：測試會污染 DB、洗掉紀錄，跑越多次越亂。

export type TestDatabase = { url: string } | { skip: string }

export function testDatabase(env: Record<string, string | undefined> = process.env): TestDatabase {
  const test = env.INTERNAL_TEST_DATABASE_URL || null
  const dev = env.INTERNAL_DATABASE_URL || null
  if (test !== null && test === dev) {
    throw new Error('INTERNAL_TEST_DATABASE_URL 跟 INTERNAL_DATABASE_URL 是同一個庫 —— 測試會清空它。兩者必須分開。')
  }
  if (test === null) return { skip: 'INTERNAL_TEST_DATABASE_URL 沒設；需要資料庫的測試跳過（不退回 INTERNAL_DATABASE_URL）' }
  return { url: test }
}
