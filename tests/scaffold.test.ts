import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

// 規格：Requirement: 工程品質指令可執行且誠實（Scenario FE-X01-S10 的靜態部分）
//
// 這裡只驗**釘得住的東西**：script 名稱與 Node 版本。
// 「四個指令真的以 0 結束」由 CI 與 tasks.md 6.2 的實際輸出證明，
// 在測試裡遞迴跑 `npm run build` 是沒有意義的。

const ROOT = path.resolve(import.meta.dirname, '..')
const read = (p: string) => readFileSync(path.join(ROOT, p), 'utf8')

const pkg = JSON.parse(read('package.json')) as {
  scripts: Record<string, string>
  engines: { node: string }
}

describe('工程品質指令', () => {
  // FE-O10 那個 governance PR 會把 `npm run <name>` 四步加回 ci.yml。
  // 名稱漂掉的話那個 PR 接不上去，而且不會有任何東西報錯。
  it.each(['lint', 'typecheck', 'test', 'build'])('%s 這個 script 存在且不是佔位', (name) => {
    const script = pkg.scripts[name]
    expect(script, `package.json 少了 ${name}`).toBeDefined()
    expect(script).not.toMatch(/還沒設定|exit 1/)
  })

  it('Node 版本在 .nvmrc 與 engines 之間沒有漂', () => {
    const nvmrc = read('.nvmrc').trim()
    expect(nvmrc).toBe('24')
    expect(pkg.engines.node).toContain(nvmrc)
  })
})
