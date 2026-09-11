// 測試用的資料庫：**只連 `INTERNAL_TEST_DATABASE_URL`，不動開發資料**。規格 `FE-O04`〈測試用另一個資料庫，不動開發資料〉。
//
// 兩條硬規則：跟 `INTERNAL_DATABASE_URL` 相同 → 拒絕（整檔紅，不是 skip）；沒設 → skip，**不退回開發庫**。
// 「退回」是 L3 的教訓：測試會污染 DB、洗掉紀錄，跑越多次越亂。

export type TestDatabase = { url: string } | { skip: string }

/**
 * 「同一個庫」看的是 host／port／資料庫名，不是字串：`localhost:5432/x` 跟 `localhost/x`、換個帳號、多個 query 參數
 * 都是同一個庫（審查抓到的：逐字比對可以被等價的寫法繞過）。解析不了的字串原樣回傳，讓連線那一步去報錯。
 */
export function databaseIdentity(url: string): string {
  try {
    const u = new URL(url)
    const host = u.hostname === '[::1]' ? '::1' : u.hostname.toLowerCase()
    const port = u.port || '5432'
    return `${host}:${port}${u.pathname}`
  } catch {
    return url
  }
}

/** query 帶 host／port／dbname 之類會改連線目標的參數：`pg` 會用它們覆寫 authority，identity 就算錯了。一律拒絕。 */
function assertNoEndpointOverride(url: string, name: string): void {
  try {
    const u = new URL(url)
    const bad = ['host', 'hostaddr', 'port', 'dbname', 'service'].filter((k) => u.searchParams.has(k))
    if (bad.length > 0) throw new Error(`${name} 的 query 不得帶 ${bad.join('、')} —— pg 會用它們覆寫連線目標。`)
  } catch (e) {
    if (e instanceof Error && e.message.includes('不得帶')) throw e
  }
}

export function testDatabase(env: Record<string, string | undefined> = process.env): TestDatabase {
  const test = env.INTERNAL_TEST_DATABASE_URL || null
  const dev = env.INTERNAL_DATABASE_URL || null
  if (test !== null) assertNoEndpointOverride(test, 'INTERNAL_TEST_DATABASE_URL')
  if (dev !== null) assertNoEndpointOverride(dev, 'INTERNAL_DATABASE_URL')
  if (test !== null && dev !== null && databaseIdentity(test) === databaseIdentity(dev)) {
    throw new Error('INTERNAL_TEST_DATABASE_URL 跟 INTERNAL_DATABASE_URL 是同一個庫 —— 測試會清空它。兩者必須分開。')
  }
  if (test === null) return { skip: 'INTERNAL_TEST_DATABASE_URL 沒設；需要資料庫的測試跳過（不退回 INTERNAL_DATABASE_URL）' }
  return { url: test }
}
