import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import * as controls from '@/design/controls'

// `FE-X13` 在 jsdom 這一層守得住的部分：**兩個入口用的是同一份定義**。
//
// ⚠️⚠️ **對比度本身不在這裡，也不可能在這裡。**
// jsdom 不載入 CSS，`getComputedStyle` 拿不到 Tailwind 算出來的樣式 ——
// 在這裡問「這個按鈕的邊框有多少對比」永遠得到空字串，
// 而斷言「空字串不等於某個值」是**恆真的**。
//
// 那一半在 `tests/e2e/control-contrast.mjs`（真瀏覽器，量 `getComputedStyle`
// 之後做 alpha 合成再算 WCAG 對比度）。**已知缺口：CI 不會自動跑那一支。**
//
// 這一份守的是另一件事：`S07`「外觀定義只有一處」。
// 少了它，`S06`（兩個入口一致）可以用**複製貼上兩份一樣的字串**通過 ——
// 而那兩份會漂。

const ROOT = path.resolve(import.meta.dirname, '..')
/**
 * 讀原始碼，**並且把註解拿掉**。
 *
 * ⚠️ **少了這一步，判準會去掃註解裡的標籤。**
 * 實測第一版直接紅了，而紅燈指的是 `<button>` —— 一個「沒有 className
 * 的按鈕」。它其實是 `FirstEntryFlow.tsx` 註解裡的一句話：
 * 「Tailwind 的 preflight 把 `<button>` 的預設外觀清光了」。
 *
 * **這一份規格的註解本身就在談 `<button>` 與 `<input>`**，所以這不是巧合，
 * 是必然 —— 越把理由寫清楚，越會撞到。
 */
const read = (rel: string) =>
  readFileSync(path.join(ROOT, rel), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')

const ENTRIES = [
  ['登入畫面', 'src/app/login/LoginForm.tsx'],
  ['首次進入流程', 'src/first-entry/FirstEntryFlow.tsx'],
] as const

describe('控制項的外觀只有一份定義', () => {
  it.each(ENTRIES)('[FE-X13-S07] %s 從 @/design/controls 拿外觀，不自己寫一份', (_name, file) => {
    const source = read(file)
    expect(source, '這個入口沒有從共用定義拿外觀 —— 那它的外觀就是自己長的').toMatch(
      /from '@\/design\/controls'/,
    )
  })

  it.each(ENTRIES)('[FE-X13-S06] %s 的按鈕與輸入框都套上了共用外觀', (_name, file) => {
    const source = read(file)

    // **每一個 `<button>` 都要有 `className`。**
    // 這裡不檢查它是哪一個常數 —— 主要動作用 `PRIMARY`、次要用 `SECONDARY`
    // 是產品決定，規格只要求「看得出來可以按」。
    const buttons = source.match(/<button[^>]*>/g) ?? []
    expect(buttons.length, '這個檔案裡一個按鈕都沒有 —— 判準抓不到東西就是恆真的').toBeGreaterThan(
      0,
    )
    for (const tag of buttons) {
      expect(tag, `這個按鈕沒有外觀，preflight 會讓它變成一行漂著的字：\n${tag}`).toMatch(
        /className=\{/,
      )
    }

    // **文字輸入框同理，而且它更嚴重** —— 按鈕至少還有字，
    // 空白的輸入框沒有外觀就是完全隱形的（使用者的原話：「輸入匡也看不到」）。
    const inputs = (source.match(/<input[\s\S]{0,240}?\/>/g) ?? []).filter(
      // 勾選框不歸這一條管：它有自己的原生外觀，preflight 沒有清掉。
      (tag) => !tag.includes("type=\"checkbox\"") && !tag.includes("type=\"radio\""),
    )
    expect(inputs.length, '這個檔案裡一個文字輸入框都沒有 —— 同上，那是恆真的').toBeGreaterThan(0)
    for (const tag of inputs) {
      expect(tag, `這個輸入框沒有外觀，它在畫面上是隱形的：\n${tag}`).toMatch(/className=\{/)
    }
  })

  it('[FE-X13-S07] 共用定義真的把外觀寫在裡面（不是空字串）', () => {
    // ⚠️ **沒有這一條，上面兩條是恆真的。**
    // 把 `PRIMARY` / `FIELD` 全部改成 `''`，上面每一條都還是綠的 ——
    // 因為它們只檢查「有沒有引用」，不檢查引用到的東西有沒有內容。
    // （對比度由 e2e 那一支守，這裡只擋最明顯的那個洞。）
    for (const name of ['PRIMARY', 'SECONDARY', 'FIELD'] as const) {
      expect(controls[name], `${name} 是空的 —— 那等於沒有外觀`).not.toBe('')
      expect(controls[name].length, `${name} 短得不像一組樣式`).toBeGreaterThan(4)
    }
  })

  it('[FE-X13-S01] 控制項的邊界 SHALL NOT 用 --color-line', () => {
    // ⚠️ **這一條擋的是一個很自然的手誤。**
    // `line` 是這個專案既有的邊框色，寫 `border-line` 幾乎是反射動作 ——
    // 而它對頁面底色只有 **1.27:1**，畫得出來但看不見。
    //
    // 規格 `D5` 明寫 `line` 給分隔線與卡片邊界用，**控制項要用另一個 token**。
    // e2e 那一支會抓到（實測突變 X2：三個輸入框全部變成 1.27:1 紅燈），
    // 但那一支 CI 不會跑 —— 所以這裡也擋一次。
    for (const name of ['PRIMARY', 'SECONDARY', 'FIELD'] as const) {
      expect(
        controls[name],
        `${name} 用了 border-line（實測 1.27:1）。控制項的邊界要用 control-edge（3.70:1）`,
      ).not.toMatch(/\bborder-line\b/)
    }
  })
})
