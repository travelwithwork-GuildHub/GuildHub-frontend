import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'

// 跑一次 `tests/type-fixtures/` 的 tsc，把診斷按檔名分組。抽出來給每個「只有編譯期證明得了」的判準共用
// （`path-params.test.ts` 先寫的做法：每個 fixture 檔**恰好一則、指定的碼** —— 約束拿掉是零則、fixture 自己有別的錯是兩則，兩種都紅）。

const ROOT = path.resolve(import.meta.dirname, '../..')
export const FIXTURES = 'tests/type-fixtures'
const DIAG = /^tests\/type-fixtures\/([^(]+)\(\d+,\d+\): error (TS\d+)/

export function diagnosticsByFile(): Map<string, string[]> {
  const tsc = createRequire(import.meta.url).resolve('typescript/bin/tsc')
  let output = ''
  try {
    output = execFileSync(process.execPath, [tsc, '-p', `${FIXTURES}/tsconfig.json`], { cwd: ROOT, encoding: 'utf8', stdio: 'pipe' })
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
