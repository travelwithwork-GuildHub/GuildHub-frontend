import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'

// 規格 `FE-O20`：路徑參數的鍵由路徑決定。
//
// 這條只有編譯期證明得了。fixture 在 `tests/type-fixtures/`，有自己的 tsconfig，
// 並被主 tsconfig 的 exclude 排除 —— 否則 `pnpm run typecheck` 會因為它永遠紅。
//
// ⚠️ **那個目錄是共用的**，別的 change 的違規檔已經讓 tsc 非零結束；而「檔名出現在輸出」
// 也只證明那個檔有**某個**錯（少寫 `method`、忘了 import 都算）。所以這裡把 tsc 的輸出
// 解析成 `{ 檔名 → [診斷碼] }`，每一條斷言自己那個檔**恰好一則、指定的碼**：
// 約束拿掉時是「一則變零則」，fixture 多了別的錯是「一則變兩則」，兩種都紅。

const ROOT = path.resolve(import.meta.dirname, '..')
const FIXTURES = 'tests/type-fixtures'
const DIAG = /^tests\/type-fixtures\/([^(]+)\(\d+,\d+\): error (TS\d+)/

/** 跑一次 tsc，按 fixture 檔名分組診斷碼。用 node 直接跑 `typescript/bin/tsc`，不依賴哪個套件管理器在 PATH 上。 */
function diagnosticsByFile(): Map<string, string[]> {
  const tsc = createRequire(import.meta.url).resolve('typescript/bin/tsc')
  let output = ''
  try {
    output = execFileSync(process.execPath, [tsc, '-p', `${FIXTURES}/tsconfig.json`], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: 'pipe',
    })
  } catch (e) {
    output = (e as { stdout?: string }).stdout ?? ''
  }
  const byFile = new Map<string, string[]>()
  for (const line of output.split('\n')) {
    const m = DIAG.exec(line)
    if (!m) continue
    const [, file, code] = m as unknown as [string, string, string]
    byFile.set(file, [...(byFile.get(file) ?? []), code])
  }
  return byFile
}

describe('路徑參數的鍵由路徑決定', () => {
  const diags = diagnosticsByFile()

  it.each([
    ['[FE-O20-S01] 鍵拼錯', 'path-params-typo.ts', 'TS2353'],
    ['[FE-O20-S02] 少給', 'path-params-missing.ts', 'TS2345'],
    ['[FE-O20-S03] 沒有參數的路徑給了 params', 'path-params-extra.ts', 'TS2353'],
    ['[FE-O20-S04] 正確的鍵之外再多一個', 'path-params-superset.ts', 'TS2353'],
  ])('%s', (_label, file, code) => {
    expect(diags.get(file) ?? [], `${file} 應該恰好一則 ${code} —— 零則代表約束不在，多則代表 fixture 自己有別的錯`).toEqual([code])
  })

  it('[FE-O20-S06] 新操作寫對就過（同一次 tsc、零診斷）', () => {
    expect(diags.get('path-params-ok.ts') ?? []).toEqual([])
  })
}, 120_000)
