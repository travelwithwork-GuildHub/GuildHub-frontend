import { describe, expect, it } from 'vitest'
import { ESLint } from 'eslint'
import path from 'node:path'

// 規格：openspec/changes/fe-x01-appshell/specs/app-shell/spec.md
//   Requirement: 資料存取只有一條路 —— Scenario FE-X01-S08 / FE-X01-S09
//
// 用 `lintText` 帶虛擬 filePath，不是真的建 fixture 檔案。這樣做的理由不是省事：
// fixture 若是真檔案，就必須被 eslint 的 ignores 排除（否則專案 lint 永遠紅），
// 而被排除的檔案又要靠放寬例外的 glob 才能適用同一條規則 ——
// 那個放寬**實測是一個洞**（`src/components/src/api/*` 會被當成例外）。
// 虛擬路徑讓例外 glob 可以維持精確。

const ROOT = path.resolve(import.meta.dirname, '..')
const CODE = 'export async function go() { return fetch("/api/x") }\n'

async function messagesFor(filePath: string, code = CODE) {
  const eslint = new ESLint({ cwd: ROOT })
  const [result] = await eslint.lintText(code, { filePath })
  if (!result) throw new Error(`ESLint 沒有回傳 ${filePath} 的結果`)
  return result.messages
}

const blocked = (msgs: Awaited<ReturnType<typeof messagesFor>>) =>
  msgs.filter((m) => m.message.includes('元件裡不准出現 fetch'))

describe('資料存取只有一條路', () => {
  it('[FE-X01-S08] 元件路徑裡的 fetch 會讓 lint 失敗，並指出行號', async () => {
    const hits = blocked(await messagesFor('src/components/Profile.tsx'))

    expect(hits.length).toBeGreaterThan(0)
    // 「指出檔案與行」是規格的字面要求
    expect(hits[0]?.line).toBeGreaterThan(0)
    expect(hits[0]?.severity).toBe(2)
  })

  it('[FE-X01-S09] 同一段程式碼放在 src/api 底下就通過 —— 差別只在路徑', async () => {
    // 成對比較。只斷言「這裡沒報錯」的話，規則整個沒載入時測試一樣會綠 ——
    // 那是一條恆真的測試，比沒有測試更糟。
    const inComponent = blocked(await messagesFor('src/components/Profile.tsx'))
    const inApi = blocked(await messagesFor('src/api/profiles.ts'))

    expect(inComponent.length).toBeGreaterThan(0)
    expect(inApi).toHaveLength(0)
  })

  // 下面每一條都是實測撞出來的躲法。沒有這些測試的話，
  // 規則會在某次重構中悄悄退化成只擋得住最天真的那一種寫法。
  it.each([
    ['多開一層假的 src/api 目錄', 'src/components/src/api/sneaky.ts', CODE],
    ['self.fetch', 'src/components/A.tsx', 'export const go = () => self.fetch("/x")\n'],
    ['方括號取值', 'src/components/B.tsx', 'export const go = () => window["fetch"]("/x")\n'],
    ['解構賦值', 'src/components/C.tsx', 'export const go = () => { const { fetch: f } = window; return f("/x") }\n'],
    ['換一個 HTTP client', 'src/components/D.tsx', 'import axios from "axios"\nexport const go = () => axios.get("/x")\n'],
  ])('[FE-X01-S08] 擋得住：%s', async (_name, filePath, code) => {
    expect(blocked(await messagesFor(filePath, code)).length).toBeGreaterThan(0)
  })
})
