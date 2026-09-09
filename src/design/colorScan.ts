// 「場景元件不得寫死視覺常數」的判定。規格 `FE-W09-S02`／`S03`。
//
// ⚠️ **這裡是純函式，沒有檔案系統。** 讀檔在 `tests/world-color-scan.test.ts`。
// 分開的理由跟 `src/api/scope.ts` 一樣：負向驗證需要餵它**假的輸入**
// （一段含色碼的原始碼、一段不含的），而碰檔案系統的函式做不到 ——
// 只能真的去改檔案，那種測試失敗時會留下垃圾。
//
// ⚠️⚠️ **刻意不抓 CSS 色名**（`'red'`、`'white'`⋯⋯）。
// 純字串判定分不出 `const red = 1` 與 `color="red"`，誤報率高到會讓這個檢查
// 被關掉 —— **而被關掉的檢查比寬鬆的檢查糟。** 要抓它需要 AST，
// 那是另一個 change 的成本。
//
// **這是一個明知的漏洞，寫出來是為了它不被誤讀成「已經擋住了」。**
//
// 判定寧可寬（誤報）也不可窄（漏報）：兩者的代價不對稱 ——
// 漏報製造「這件事有人在管」的假象，誤報只是叫作者多寫一行豁免。

/** `#rgb`、`#rrggbb`、`#rrggbbaa`。 */
const HEX_STRING = /#[0-9a-fA-F]{3,8}\b/g

/** `0xrrggbb` 這種數字形式。**只看 `#` 的判定被 `color={0xff0000}` 繞得過。** */
const HEX_NUMBER = /\b0x[0-9a-fA-F]{3,8}\b/g

/** 這一行要求豁免。用在真的需要字面值的地方（今天沒有）。 */
const ALLOW = 'world-color-allow'

/**
 * 一段原始碼裡的顏色字面值。空陣列代表沒問題。
 *
 * 帶 `world-color-allow` 註解的那一行整行跳過。
 */
export function colorLiterals(source: string): string[] {
  const found: string[] = []
  for (const line of source.split('\n')) {
    if (line.includes(ALLOW)) continue
    for (const re of [HEX_STRING, HEX_NUMBER]) {
      re.lastIndex = 0
      for (const match of line.matchAll(re)) found.push(match[0])
    }
  }
  return found
}
