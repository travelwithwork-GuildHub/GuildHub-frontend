import { describe, expect, it } from 'vitest'
import { ESLint } from 'eslint'
import path from 'node:path'

// 規格：openspec/changes/fe-x01-appshell/specs/app-shell/spec.md
//   Requirement: 資料存取只有一條路
//   Scenario FE-X01-S08 / FE-X01-S09
//
// `ignore: false` 是必要的 —— fixture 被 eslint.config.mjs 的 ignores 排除，
// 不然專案的 lint 會因為那個故意違規的檔案而永遠是紅的。

const ROOT = path.resolve(import.meta.dirname, '..')
const FORBIDDEN = 'tests/fixtures/src/components/forbidden-fetch.tsx'
const ALLOWED = 'tests/fixtures/src/api/allowed-fetch.ts'

async function lint(relativePath: string) {
  const eslint = new ESLint({ cwd: ROOT, ignore: false })
  const [result] = await eslint.lintFiles([relativePath])
  if (!result) throw new Error(`ESLint 沒有回傳 ${relativePath} 的結果`)
  return result
}

describe('資料存取只有一條路', () => {
  it('[FE-X01-S08] 元件路徑裡的 fetch 會讓 lint 失敗，並指出檔案與行', async () => {
    const result = await lint(FORBIDDEN)

    expect(result.errorCount).toBeGreaterThan(0)
    expect(result.filePath).toContain('forbidden-fetch.tsx')

    const fetchErrors = result.messages.filter((m) => m.message.includes('fetch'))
    expect(fetchErrors.length).toBeGreaterThan(0)
    // 「指出檔案與行」是規格的字面要求，不是附加的貼心
    expect(fetchErrors[0]?.line).toBeGreaterThan(0)
  })

  it('[FE-X01-S09] src/api 底下的 fetch 通過 lint', async () => {
    const result = await lint(ALLOWED)

    const fetchErrors = result.messages.filter((m) => m.message.includes(NO_FETCH_MARKER))
    expect(fetchErrors).toHaveLength(0)
    expect(result.errorCount).toBe(0)
  })
})

// 只比對這條規則自己的訊息，避免把「其他規則剛好提到 fetch」算進來
const NO_FETCH_MARKER = '元件裡不准出現 fetch'
