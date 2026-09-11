import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

// 規格：openspec/changes/fe-o04-disposable-db/specs/disposable-db/spec.md
//   Requirement: 連線只在伺服器端 —— S12（jsdom 裡 import 就拋）、S13（連線字串沒有第二個讀取點）
//
// 這一檔跑在預設的 jsdom：那正是「瀏覽器環境」。**不連任何外部服務。**

async function walk(dir: string): Promise<string[]> {
  const out: string[] = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...(await walk(p)))
    else if (/\.(ts|tsx|mjs|js)$/.test(entry.name)) out.push(p)
  }
  return out
}

describe('連線只在伺服器端', () => {
  it('[FE-O04-S12] 在瀏覽器環境 import 資料庫模組：import 那一刻就 reject', async () => {
    await expect(import('@/server/db')).rejects.toThrow(/server|Server/)
  })

  it('[FE-O04-S13] INTERNAL_*DATABASE_URL 在 src/ 底下只有 env.ts 讀', async () => {
    const src = path.resolve(__dirname, '..', 'src')
    const offenders: string[] = []
    for (const file of await walk(src)) {
      if (file.endsWith(path.join('config', 'env.ts'))) continue
      if (/process\.env\.INTERNAL_(TEST_)?DATABASE_URL/.test(await readFile(file, 'utf8'))) offenders.push(path.relative(src, file))
    }
    expect(offenders).toEqual([])
  })
})
