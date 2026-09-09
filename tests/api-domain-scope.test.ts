import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { DOMAINS_WITHOUT_BACKEND, scopeProblems } from '@/api/scope'

// 規格：openspec/changes/fe-o02-data-access/specs/data-access/spec.md
//   Requirement: 後端沒有的 domain 不得出現在這一層 —— Scenario FE-O02-S09 / S10

const ROOT = path.resolve(import.meta.dirname, '..')

function exportedNames(file: string): string[] {
  const source = fs.readFileSync(path.join(ROOT, file), 'utf8')
  return [...source.matchAll(/export (?:async )?(?:function|const) ([A-Za-z0-9_]+)/g)].map(
    (m) => m[1] as string,
  )
}

describe('資料存取層的 domain 範圍', () => {
  it('現況乾淨：沒有任何一個沒有契約的 domain 出現在操作裡', () => {
    const operationNames = exportedNames('src/api/operations.ts')
    const contractNames = exportedNames('src/api/contract/rest.ts')

    // **防恆真**：掃不到任何操作或任何契約名稱時，下面那個空陣列是空集合的比較。
    // 真的發生的話代表正規表示式壞了，不是「這一層很乾淨」。
    expect(operationNames.length, '一個操作都沒掃到 —— 掃描壞了').toBeGreaterThan(10)
    expect(contractNames.length, '一個契約名稱都沒掃到 —— 掃描壞了').toBeGreaterThan(10)

    expect(scopeProblems({ operationNames, contractNames })).toEqual([])
  })

  it('[FE-O02-S09] 有人替沒有契約的 domain 加操作時，檢查失敗', () => {
    const contractNames = exportedNames('src/api/contract/rest.ts')
    // 模擬「有人加了一個 Role 的操作」。**不真的寫檔** —— 見 scope.ts 的檔頭。
    const operationNames = [...exportedNames('src/api/operations.ts'), 'listOpenRoles']

    const problems = scopeProblems({ operationNames, contractNames })

    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('listOpenRoles')
    // 規格的字面要求：指出那個 domain 卡在哪一個後端缺口
    expect(problems[0]).toContain('BE-G10')
  })

  it('[FE-O02-S10] 契約層補上之後，這條檢查要放行', () => {
    const operationNames = [...exportedNames('src/api/operations.ts'), 'listOpenRoles']
    // 模擬「後端補上了 Role，契約層也有了」
    const contractNames = [...exportedNames('src/api/contract/rest.ts'), 'RoleOut']

    expect(
      scopeProblems({ operationNames, contractNames }),
      '契約補上了還在擋 —— 這條規則會變成純粹的阻礙，而下一個人會把它刪掉',
    ).toEqual([])
  })

  // ⚠️⚠️ **下面這一組刻意寫死四個名字，不從 `DOMAINS_WITHOUT_BACKEND` 展開。**
  //
  // 原本是 `it.each(DOMAINS_WITHOUT_BACKEND)`，而那是一個**恆真的形狀**：
  // 把清單縮成 `['role']`，測試從 24 條變成 21 條然後**全部通過** ——
  // 因為那組測試是用「要被檢查的那份清單」當參數的。實測踩到。
  //
  // 寫死一份是刻意的重複。它的作用是：**有人從清單裡拿掉一個 domain 時，
  // 這裡會紅**，而那時候他必須說明為什麼（正當的理由是後端補上了，
  // 那時 `S10` 那一半才是對的處理方式）。
  const EXPECTED_DOMAINS = ['role', 'application', 'invitation', 'offer']

  it('清單就是那四個 —— 少一個要紅，多一個也要紅', () => {
    expect([...DOMAINS_WITHOUT_BACKEND]).toEqual(EXPECTED_DOMAINS)
  })

  it.each(EXPECTED_DOMAINS)('四個 domain 每一個都擋得住：%s', (domain) => {
    const problems = scopeProblems({
      operationNames: [`list${domain}s`],
      contractNames: [],
    })

    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain(domain)
  })
})
