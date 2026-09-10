// 控制項的最小外觀。規格 `FE-X13`。
//
// ⚠️⚠️ **這一份是截圖抓到的，不是規劃出來的。**
// 使用者傳來 `/login` 的截圖，逐字說「登入畫面也太醜了 / 輸入匡也看不到」——
// Tailwind 的 preflight 把 `<button>` 與 `<input>` 的預設外觀清光了，
// 而沒有任何一行樣式加回去。**18 條端到端斷言全綠，而那個 CTA 沒有人會認得出來。**
//
// ⚠️ **這不是設計系統，是「看得出來能操作」的下限。**
// 完整的表單一致性（欄位尺寸、間距、錯誤狀態、focus、responsive）是
// `FE-X05`（W2，未開始）。**不要在這裡長出帶 API、狀態與變體的元件** ——
// 兩個外部審查者被獨立問到「這一列最可能做錯的決定是什麼」，答的都是這件事。
//
// ⚠️ **一份定義，不是每個畫面各寫一次**（`FE-X13-S07`）。
// 這些字串原本寫在 `FirstEntryFlow.tsx` 裡，而 `/login` 什麼都沒有 ——
// 兩個入口各長各的，正是這一份要收掉的東西。
//
// ## 為什麼邊界用 `control-edge` 而不是 `line`
//
// 規格要求「識別控制項所必需的視覺資訊，與緊鄰背景合成後對比度 SHALL 至少 3:1」
// （`FE-X13-S01`／`S04`，出處是 WCAG 2.1 SC 1.4.11）。實測：
//
//     control-edge    3.70:1   ← 這一份用的
//     accent          4.09:1   ← PRIMARY 的填色，本來就夠
//     line            1.27:1   ← **不夠**，但它「不透明而且與父層不同」
//     surface-raised  1.06:1   ← **不夠**，而「給輸入框一個白底」看起來像修好了
//
// 底下兩個數字是這條規格存在的理由：一個只檢查 `alpha > 0` 的判準會放行它們，
// 然後使用者仍然看不見那個框。

/**
 * 主要動作。用填色達標（`accent` 對頁面底色 4.09:1）。
 *
 * ⚠️ **`disabled` 要看得出來是 `disabled`**（`FE-X13-S08`）——
 * 看不出來的話，使用者會一直按一個沒有反應的按鈕，然後認定網站壞了。
 * `FE-A06` 的「進入世界」預設就是不能按的，所以這不是假設性的情況。
 *
 * ⚠️ 降低對比正是「不能按」的正常表達方式，所以規格明寫
 * `disabled` **不必**達到 3:1 —— `S01` 只管啟用中的控制項。
 */
export const PRIMARY =
  'bg-accent rounded px-gutter py-2 font-medium text-white disabled:cursor-not-allowed disabled:opacity-40'

/**
 * 次要動作。用邊框達標。
 *
 * ⚠️ **邊框色是 `control-edge` 不是 `line`。** 原本這裡是 `border-line`，
 * 而那是 1.27:1 —— 畫得出來，但看不見。
 */
export const SECONDARY =
  'border-control-edge rounded border px-gutter py-2 disabled:cursor-not-allowed disabled:opacity-40'

/**
 * 文字輸入框。
 *
 * ⚠️⚠️ **這個在今天的畫面上完全不存在**，而它比按鈕重要：
 * 按鈕有文字，外觀被清光時畫面上至少還有字；**空白的輸入框沒有任何內容**，
 * 「有沒有東西在那裡」只能靠填色或邊界本身。使用者的原話就是這個。
 *
 * ⚠️ **SHALL NOT 靠 placeholder、游標或 focus ring 達標**（`FE-X13-S04`）。
 * 那些在使用者第一眼看到畫面時都不在，而那正是要修的時刻。
 */
export const FIELD = 'border-control-edge rounded border px-2 py-1'

/** 勾選框那一列：讓框跟字之間有距離，而且整列都點得到。 */
export const CHECK_ROW = 'flex items-center gap-2'

/**
 * 一個表單的容器。
 *
 * ⚠️ **這不是「順手統一 layout」，是 `S06` 要求的同一份外觀。**
 * `FE-A06` 早就在用這一組，而 `/login` 什麼都沒有 —— 結果截圖上
 * 「在世界裡顯示的名字」跟它的輸入框**擠在同一行、右邊還跟著勾選框**，
 * 看起來像一個句子的一部分。那也是「輸入匡也看不到」的一部分。
 *
 * `max-w-prose` 讓輸入框不會拉滿整個視窗寬。
 */
export const FORM = 'flex max-w-prose flex-col items-start gap-gutter'

/** 一個「說明文字 ＋ 輸入框」的欄位。**上下排，不是左右排。** */
export const FIELD_LABEL = 'flex flex-col gap-2'
