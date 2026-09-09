import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

// 規格：openspec/changes/fe-o02-data-access/specs/data-access/spec.md
//   Requirement: 位址與憑證只有一個來源 —— Scenario FE-O02-S08
//
// `src/config/env.ts` 是唯一准許讀 `process.env` 的檔案（eslint 有一條規則擋），
// 而它對「部署出去卻沒設位址」的處置是**拋錯**而不是退回 localhost。
// 在操作裡寫死位址會繞過那道防線 —— 而症狀是「正式站連到 localhost」，
// 也就是「所有資料都不見了」，不是「設定錯了」。

const ROOT = path.resolve(import.meta.dirname, '..')

/** 後端位址的字面值。**只找 `//` 之後接著主機的那種**，不找註解裡的網址。 */
const BACKEND_URL = /(['"`])(https?|wss?):\/\/[^'"`\s]+\1/

/** 拿掉註解 —— 這個 repo 的註解裡有大量說明用的網址與範例。 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return walk(full)
    return /\.tsx?$/.test(entry.name) ? [full] : []
  })
}

describe('位址只有一個來源', () => {
  it('[FE-O02-S08] src/api/ 底下沒有寫死的後端位址', () => {
    const files = walk(path.join(ROOT, 'src/api'))

    // **防恆真**：掃不到檔案的話下面那個空陣列什麼都沒證明
    expect(files.length, '一個檔案都沒掃到 —— 掃描壞了').toBeGreaterThan(3)

    const offenders = files
      .filter((file) => BACKEND_URL.test(stripComments(fs.readFileSync(file, 'utf8'))))
      .map((file) => path.relative(ROOT, file))

    expect(offenders).toEqual([])
  })

  it('偵測器本身抓得到 —— 不然上面那條是恆真的', () => {
    // 成對比較。少了這一條，一個永遠回 false 的正規表示式也會讓上面那條通過。
    expect(BACKEND_URL.test(stripComments("const base = 'http://localhost:8000'"))).toBe(true)
    expect(BACKEND_URL.test(stripComments("const ws = 'wss://example.com/ws'"))).toBe(true)
    // 註解裡的網址不算 —— 這個 repo 的註解裡有大量說明用的位址
    expect(BACKEND_URL.test(stripComments("// 後端在 http://localhost:8000"))).toBe(false)
    expect(BACKEND_URL.test(stripComments("/* 見 https://example.com/docs */\nexport const x = 1"))).toBe(false)
    // 路徑不是位址
    expect(BACKEND_URL.test(stripComments("path: '/api/profiles/me'"))).toBe(false)
  })

  it('唯一的例外是 src/config/env.ts —— 它本來就有預設位址', () => {
    const env = fs.readFileSync(path.join(ROOT, 'src/config/env.ts'), 'utf8')

    // 這一條不是在擋什麼，是在**說明為什麼上面那條的範圍是 src/api/ 而不是 src/**。
    // 這個檔案裡的位址是刻意的（LOCAL_DEFAULTS），而且它有自己的規格（FE-O09）。
    expect(BACKEND_URL.test(stripComments(env)), 'env.ts 的預設位址不見了？').toBe(true)
  })
})
