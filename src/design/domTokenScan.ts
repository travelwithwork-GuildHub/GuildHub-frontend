// 「DOM 元件只從 token 取值」的判定。規格 `FE-X16-S01`。
// `colorScan.ts`（`FE-W09`）只管 `src/world` 與 hex；這一份管整個 `src/**`：
// 色碼、顏色函式、字體堆疊的屬性、Tailwind 任意值 class、層級標記屬性（tier／text）的字面值。
//
// ⚠️ **純函式，沒有檔案系統。** 讀檔與豁免上限在 `tests/dom-token-scan.test.ts`（理由同 `colorScan.ts`：負向驗證要餵假輸入）。
// ⚠️ 樣板（連這裡的註解）全部避開字面值，**不然這個檔案會抓到自己** —— 第一版的註解就被自己抓到六條。

const COLOR_FUNCTIONS = ['rgb', 'rgba', 'hsl', 'hsla', 'oklch', 'oklab', 'color-mix']
/** 規格點名的任意值前綴。`w-[`、`max-h-[` 這種尺寸不在名單裡 —— 規格管的是「視覺 token 的七類」。 */
const ARBITRARY = ['bg', 'text', 'border', 'ring', 'shadow', 'rounded', 'duration', 'font', 'z']
const FONT_FAMILY = ['font', 'family'].join('-')
const TIER_ATTR = ['data', 'tier'].join('-')
const TEXT_ATTR = ['data', 'text'].join('-')

const PATTERNS: ReadonlyArray<readonly [kind: string, re: RegExp]> = [
  ['色碼', /#[0-9a-fA-F]{3,8}\b/g],
  ['色碼', /\b0x[0-9a-fA-F]{3,8}\b/g],
  ['顏色函式', new RegExp(`\\b(?:${COLOR_FUNCTIONS.join('|')})\\(`, 'g')],
  ['字體堆疊', new RegExp(FONT_FAMILY, 'g')],
  // 前面要是行首、空白、引號或 variant 的冒號：帶 `hover:` 前綴的也要抓；前面接著別的字的不算
  ['任意值', new RegExp(`(?:^|[\\s"'\`:])(?:${ARBITRARY.join('|')})-\\[`, 'g')],
  ['層級標記', new RegExp(`\\b(?:${TIER_ATTR}|${TEXT_ATTR})=`, 'g')],
]

/** 這一行要求豁免。**冒號後面要有理由**；沒有理由算違規。 */
export const ALLOW = ['dom', 'token', 'allow'].join('-') + ':'

export interface TokenViolation {
  line: number
  kind: string
  text: string
}
export interface TokenScan {
  violations: TokenViolation[]
  /** 帶理由、而且那一行真的有東西要豁免的行數。 */
  exemptions: number
}

export function domTokenScan(source: string): TokenScan {
  const violations: TokenViolation[] = []
  let exemptions = 0
  source.split('\n').forEach((line, index) => {
    const found: TokenViolation[] = []
    for (const [kind, re] of PATTERNS) {
      re.lastIndex = 0
      for (const match of line.matchAll(re)) found.push({ line: index + 1, kind, text: match[0].trim() })
    }
    const allow = line.indexOf(ALLOW)
    if (allow === -1) {
      violations.push(...found)
      return
    }
    if (line.slice(allow + ALLOW.length).trim() === '') {
      violations.push({ line: index + 1, kind: '沒有理由的豁免', text: line.trim() })
      return
    }
    if (found.length > 0) exemptions += 1
  })
  return { violations, exemptions }
}
