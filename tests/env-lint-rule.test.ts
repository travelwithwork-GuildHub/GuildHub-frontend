import { describe, expect, it } from 'vitest'
import { ESLint } from 'eslint'
import path from 'node:path'

// 規格：openspec/changes/fe-o09-env/specs/runtime-config/spec.md
//   Requirement: 環境變數只有一處讀取，而且只能用字面存取 —— Scenario FE-O09-S01
//
// 用 `lintText` 帶虛擬 filePath，不是真的建 fixture 檔案 —— 理由照
// `tests/no-fetch-rule.test.ts` 的檔頭：fixture 若是真檔案就必須被 eslint 的
// ignores 排除，而被排除的檔案又要靠放寬的 glob 才適用同一條規則，
// 那個放寬**實測是一個洞**。虛擬路徑讓例外的 glob 可以維持精確。
//
// **這一組每一條都要自己的逾時。** 第一次 `lintText` 會把整份 eslint flat
// config 載進來（含 next 的 plugin），在忙碌的機器上超過 vitest 預設的 5 秒，
// 於是這一條會隨機紅，而**紅的原因跟被測的規則一點關係也沒有**。

const ROOT = path.resolve(import.meta.dirname, '..')

const LITERAL = 'export const a = process.env.NEXT_PUBLIC_GUILDHUB_REST\n'
const COMPUTED = 'const k = "NEXT_PUBLIC_GUILDHUB_REST"\nexport const a = process.env[k]\n'
const ALIASED = 'const e = process.env\nexport const a = e.NEXT_PUBLIC_GUILDHUB_REST\n'

async function messagesFor(filePath: string, code: string) {
  const eslint = new ESLint({ cwd: ROOT })
  const [result] = await eslint.lintText(code, { filePath })
  if (!result) throw new Error(`ESLint 沒有回傳 ${filePath} 的結果`)
  return result.messages
}

const blocked = (msgs: Awaited<ReturnType<typeof messagesFor>>, needle: string) =>
  msgs.filter((m) => m.message.includes(needle))

const ONLY_HERE = '環境變數只能在'
const NOT_INLINED = 'Next.js 只替換完整的字面存取'

describe('環境變數的 lint 規則', () => {
  it(
    '[FE-O09-S01] 別處讀 process.env、或用計算屬性讀，都會被 lint 擋下',
    async () => {
      // ① 設定模組以外讀 process.env → 擋
      const elsewhere = await messagesFor(path.join(ROOT, 'src/world/WorldCanvas.tsx'), LITERAL)
      expect(blocked(elsewhere, ONLY_HERE), '別的檔案讀 process.env 竟然沒被擋').toHaveLength(1)

      // ② 設定模組本身用字面存取 → 不擋
      const allowed = await messagesFor(path.join(ROOT, 'src/config/env.ts'), LITERAL)
      expect(blocked(allowed, ONLY_HERE), '設定模組自己讀 process.env 竟然被擋了').toHaveLength(0)

      // ③ 設定模組本身用計算屬性 → 擋
      //    這是在瀏覽器裡會靜默變成 undefined 的那種寫法。
      const computed = await messagesFor(path.join(ROOT, 'src/config/env.ts'), COMPUTED)
      expect(blocked(computed, NOT_INLINED), '計算屬性存取竟然沒被擋').not.toHaveLength(0)
    },
    120_000,
  )

  it(
    '先把 process.env 指派給變數再取用，同樣被擋',
    async () => {
      // 官方文件把這種寫法跟計算屬性並列，兩種都不會被建置期替換。
      const aliased = await messagesFor(path.join(ROOT, 'src/config/env.ts'), ALIASED)
      expect(blocked(aliased, NOT_INLINED), '先指派再取用竟然沒被擋').not.toHaveLength(0)
    },
    120_000,
  )

  it(
    '例外是完整路徑，不是萬用字元 —— 多開一個 env.ts 繞不過去',
    async () => {
      // 既有的 no-fetch 規則踩過這個洞：寬鬆的 glob 會讓
      // `src/components/src/api/sneaky.ts` 被當成例外。
      // 這條測試釘住「例外用完整路徑」這個決定 —— 改成 `**/env.ts` 就會紅。
      const decoy = await messagesFor(path.join(ROOT, 'src/world/env.ts'), LITERAL)
      expect(blocked(decoy, ONLY_HERE), 'src/world/env.ts 竟然被當成例外放行').toHaveLength(1)
    },
    120_000,
  )

  it(
    'src/ 以外不擋 —— 測試本來就要設環境變數',
    async () => {
      // 規格的字面是「`src/` 底下該模組以外」。把測試也擋住的話，
      // 「缺變數會怎樣」就驗不了，這條規則第一天就會被關掉。
      const inTests = await messagesFor(path.join(ROOT, 'tests/env-config.test.ts'), LITERAL)
      expect(blocked(inTests, ONLY_HERE)).toHaveLength(0)
    },
    120_000,
  )
})
