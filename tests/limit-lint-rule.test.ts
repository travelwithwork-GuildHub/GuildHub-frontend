import path from 'node:path'
import { ESLint } from 'eslint'
import { describe, expect, it } from 'vitest'

// 規格：openspec/changes/fe-o06-limit-source/specs/limit-source/spec.md
//   Requirement: LIMITS 是唯一來源 —— S02（契約 schema 裡的數字字面被 lint 擋下；規則是窄的）
//
// 用 `lintText` 帶虛擬路徑走 repo 的實際設定（跟 `env-lint-rule.test.ts` 同一套）。**不連任何外部服務。**

const ROOT = path.resolve(import.meta.dirname, '..')
async function messagesFor(filePath: string, code: string) {
  const eslint = new ESLint({ cwd: ROOT })
  const [result] = await eslint.lintText(code, { filePath })
  if (!result) throw new Error(`ESLint 沒有回傳 ${filePath} 的結果`)
  return result.messages.filter((m) => m.ruleId === 'no-restricted-syntax')
}
const SCHEMA = (arg: string) => `import { z } from 'zod'\nimport { LIMITS } from './limits'\nexport const X = z.object({ a: z.string().max(${arg}) })\nvoid LIMITS\n`

describe('契約 schema 裡的數字字面', () => {
  it('[FE-O06-S02] rest.ts 裡 .max(20) 被擋、訊息指向 LIMITS；.max(LIMITS.displayName.max) 通過', async () => {
    const bad = await messagesFor('src/api/contract/rest.ts', SCHEMA('20'))
    expect(bad.length).toBeGreaterThan(0)
    expect(bad[0]?.message).toMatch(/LIMITS/)
    const good = await messagesFor('src/api/contract/rest.ts', SCHEMA('LIMITS.displayName.max'))
    expect(good).toEqual([])
  }, 30_000)

  it('[FE-O06-S02] 正面列舉：不是 LIMITS.<欄位>.<min|max> 的一律擋（數字、負數、模板、Number()、算式、本地常數、ws.ts 也一樣）', async () => {
    for (const arg of ['3', '-1', '2e1', '`20`', 'Number("20")', '10 + 10', 'LOCAL']) {
      const code = `const LOCAL = 20\n${SCHEMA(arg)}void LOCAL\n`
      expect((await messagesFor('src/api/contract/ws.ts', code)).length, `.max(${arg}) 沒被擋`).toBeGreaterThan(0)
    }
    expect(await messagesFor('src/api/contract/ws.ts', SCHEMA('LIMITS.facing.min'))).toEqual([])
  }, 60_000)

  it('[FE-O06-S02] 規則是窄的：同樣的 .max(20) 在別的路徑通過', async () => {
    for (const p of ['src/api/contract/limits.ts', 'src/api/operations.ts', 'src/list-panel/paging.ts', 'tests/whatever.test.ts']) {
      const messages = await messagesFor(p, SCHEMA('20'))
      expect(messages.filter((m) => /規格 FE-O06/.test(m.message)), p).toEqual([])
    }
  }, 30_000)
})
