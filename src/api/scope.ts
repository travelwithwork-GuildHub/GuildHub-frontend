// 「後端沒有的 domain 不得出現在資料存取層」的判定。規格 `FE-O02-S09`／`S10`。
//
// ⚠️ **這裡是純函式，沒有檔案系統。** 讀檔在 `tests/api-domain-scope.test.ts`。
// 分開的理由跟 `FE-W07` 的涵蓋率檢查一樣：兩個方向的負向驗證都需要餵它
// **假的輸入**（一個沒有契約的操作、以及「契約已經補上」的情況），
// 而碰檔案系統的函式做不到 —— 只能真的去改檔案，那種測試失敗時會留下垃圾。

/**
 * 後端今天沒有的 domain。來源是 `BE-G10`，而契約層 `rest.ts` 的檔頭
 * 已經寫著「刻意不出現在這裡」。
 *
 * ⚠️ **這不是永久清單。** 後端補上任何一個，它就要從這裡拿掉 ——
 * 而那件事由 `S10` 那一半保證：契約層有了對應的 schema 之後，
 * 這個檢查 MUST NOT 再擋它。
 */
export const DOMAINS_WITHOUT_BACKEND = ['role', 'application', 'invitation', 'offer'] as const

export type DomainWithoutBackend = (typeof DOMAINS_WITHOUT_BACKEND)[number]

export interface ScopeInput {
  /** `src/api/` 底下（不含 `contract/`）匯出的操作名稱。 */
  operationNames: readonly string[]
  /** 契約層匯出的 schema 名稱。 */
  contractNames: readonly string[]
}

/** 名稱裡有沒有提到這個 domain。`listRoles`／`RoleOut` 都算。 */
function mentions(name: string, domain: string): boolean {
  return name.toLowerCase().includes(domain)
}

/**
 * 範圍的問題清單。空陣列代表沒問題。
 *
 * **兩個方向都要顧**（規格 `S09` 與 `S10`）：
 * 只擋不放的話，後端補上之後這條規則會變成純粹的阻礙，
 * 而下一個人的選擇是把它整條刪掉 —— **被刪掉的規則比寬鬆的規則糟。**
 */
export function scopeProblems({ operationNames, contractNames }: ScopeInput): string[] {
  const problems: string[] = []
  for (const domain of DOMAINS_WITHOUT_BACKEND) {
    const offenders = operationNames.filter((name) => mentions(name, domain))
    if (offenders.length === 0) continue
    // 契約層已經有它了 → 後端補上了，放行（`S10`）
    if (contractNames.some((name) => mentions(name, domain))) continue
    problems.push(
      `資料存取層出現了「${domain}」的操作（${offenders.join('、')}），` +
        `但契約層還沒有對應的 schema —— 那個 domain 卡在 BE-G10（後端沒有這組端點）。` +
        '憑空定的介面等後端真的開出來幾乎一定不合，那時要先改介面才能接，比留白貴。',
    )
  }
  return problems
}
