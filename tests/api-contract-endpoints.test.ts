import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { CASES } from './support/api-operations-cases'

// 規格：openspec/changes/fe-j14-project-resources/specs/api-contract/spec.md
//   Requirement: 資料形狀只有一份定義 —— Scenario FE-J14-S26
//
// ⚠️ 兩個子句在**同一條 `it`** 裡：「恰好 21 組」與「每一個操作都在這 21 組裡」
// 拆開的話，其中一條通過缺口報告就說涵蓋了（`contract-limits.test.ts` 檔頭）。
//
// **不連任何外部服務**：讀的是 repo 裡產出的型別檔，不是後端。

const ROOT = path.resolve(import.meta.dirname, '..')

/** `schema.d.ts` 的 `paths` 區塊裡、真的存在的 `(method, path)`。`get?: never` 那種不算。 */
function generatedOperations(): Array<[string, string]> {
  const source = fs.readFileSync(path.join(ROOT, 'src/api/contract/schema.d.ts'), 'utf8')
  const paths = source.slice(source.indexOf('export interface paths {'), source.indexOf('export type webhooks'))
  const found: Array<[string, string]> = []
  let current: string | null = null
  for (const line of paths.split('\n')) {
    const head = /^ {4}"(\/[^"]*)": \{/.exec(line)
    if (head) current = head[1] as string
    const op = /^ {8}(get|put|post|delete|patch|options|head|trace)\??: operations\[/.exec(line)
    if (op && current !== null) found.push([(op[1] as string).toUpperCase(), current])
  }
  return found
}

/** `/api/projects/{project_id}/seats` 這種樣板，比不比得上一個真的路徑。 */
function matchesTemplate(template: string, pathname: string): boolean {
  const wanted = template.split('/')
  const got = pathname.split('/')
  if (wanted.length !== got.length) return false
  // 樣板段（`{project_id}`）吃掉任何非空的一段；其餘要逐字相同。
  return wanted.every((seg, n) =>
    seg.startsWith('{') && seg.endsWith('}') ? (got[n] ?? '').length > 0 : seg === got[n],
  )
}

const RESOURCE_OPERATIONS: Array<[string, string]> = [
  ['GET', '/api/projects/{project_id}/resources'],
  ['POST', '/api/projects/{project_id}/resources'],
  ['PATCH', '/api/projects/{project_id}/resources/{resource_id}'],
  ['DELETE', '/api/projects/{project_id}/resources/{resource_id}'],
]

describe('契約的範圍等於後端的端點集合', () => {
  it('[FE-J14-S26] 契約的範圍與後端的端點集合相等', () => {
    const all = generatedOperations()
    // 防恆真：掃不到任何東西時，下面每一條都會用空集合比較而看起來是對的。
    expect(all.length, '一組端點都沒掃到 —— 掃描壞了，不是後端沒有端點').toBeGreaterThan(10)

    const api = all.filter(([, p]) => p.startsWith('/api/'))
    expect(api).toHaveLength(21)

    for (const [method, template] of RESOURCE_OPERATIONS) {
      expect(api, `${method} ${template} 不在產出的型別檔裡`).toContainEqual([method, template])
    }

    // 每一個資料存取操作送出的 method 與路徑，都要落在這 21 組裡。
    // `DELETE` 也算 —— 只認 `transport.ts` 的 `METHODS` 的話，新加的 method
    // 會在這裡靜靜地被跳過。
    for (const [name, , , method, pathname] of CASES) {
      const hit = api.some(([m, template]) => m === method && matchesTemplate(template, pathname))
      expect(hit, `${name}：${method} ${pathname} 不在產出型別檔的 21 組裡`).toBe(true)
    }
  })
})
