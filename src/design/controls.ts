// 控制項的三級。規格 `FE-X13`（看得出來能操作）＋ `FE-X16`（層次與下一步）。
//
// ⚠️⚠️ **這一份是截圖抓到的，不是規劃出來的。** 使用者兩次看了截圖：`FE-X13`「登入畫面也太醜了 / 輸入匡也看不到」
// （preflight 把 `<button>` 與 `<input>` 的外觀清光了、18 條端到端斷言全綠）；`FE-X16`「非 3D 的網頁介面都醜醜的 / 不專業 / 不想使用」
// （功能對了、判準全綠、三個浮層同時開著、三顆一樣大的藍鈕）。
//
// ⚠️ **不要在這裡長出帶 API、狀態與變體的元件**（`FE-X13` 兩個外部審查者共同的警告，`FE-X16` design D4 再確認一次）。
// 這些是**常數**，呼叫端自己選；每個常數帶一個 `data-tier`，判準數的是屬性、不比 class 字串（`S09`／`S10`）。
// 屬性只能從這裡來 —— 在別處把層級標記寫成字面值會被 `tests/dom-token-scan.test.ts` 抓到（`S01`）。**一份定義**（`FE-X13-S07`）。
//
// 為什麼邊界用 `control-edge` 而不是 `line`（`FE-X13-S01`／`S04`，WCAG 2.1 SC 1.4.11 要 3:1）—— 實測：
//     control-edge 3.70:1 ← 邊界用的；accent 5.25:1 ← PRIMARY 的填色（FE-X16 把 L 從 0.58 降到 0.52：白字要 4.5:1，原本 4.35）
//     line 1.27:1、surface-raised 1.06:1 ← **都不夠**，而「給輸入框一個白底」看起來像修好了
//
// 高度下限、過渡、焦點環**不在這裡**：每一個控制項都要有（`S10`／`S11`／`S12`），所以在 `globals.css` 的 `@layer base`，
// 卡片、對話列這種不走常數的 `<button>` 也吃得到。

export type Tier = 'primary' | 'secondary' | 'tertiary'

/** 一個常數：class ＋ 它帶的層級標記。用 `{...PRIMARY}` 展開到元素上。 */
export interface Control {
  readonly className: string
  readonly 'data-tier': Tier
}

/** 常數加上呼叫端自己的版面 class（`shrink-0`、`flex`⋯⋯）。標記跟著常數走，不用呼叫端記得帶。 */
export function withClass<T extends { readonly className: string }>(base: T, extra: string): T {
  return { ...base, className: `${base.className} ${extra}` }
}

const DISABLED = 'disabled:cursor-not-allowed disabled:opacity-40'

/**
 * 主要動作：填色。**每個操作區同一狀態下至多一個**（`FE-X16-S09`），它是推薦的前進動作；關閉／返回／取消不為了湊數升級。
 *
 * ⚠️ **`disabled` 要看得出來是 `disabled`**（`FE-X13-S08`）—— 降低對比正是「不能按」的正常表達方式，規格明寫 `disabled` 不必達 3:1。
 */
export const PRIMARY: Control = {
  'data-tier': 'primary',
  className: `bg-accent hover:bg-accent-hover rounded-control px-gutter py-2 font-medium text-white ${DISABLED}`,
}

/** 次要動作：邊框、沒有填色。hover 時邊界變深、底浮一層 `surface-sunken`。 */
export const SECONDARY: Control = {
  'data-tier': 'secondary',
  className: `border-control-edge hover:border-ink hover:bg-surface-sunken rounded-control border px-gutter py-2 font-medium ${DISABLED}`,
}

/** 文字級：沒有邊框沒有填色，字色**等於主要級的填色**（讀得出可按、跟內文不同色；`S10` 拿 RGBA 比）。給「先四處看看」這種讓路的動作。 */
export const TERTIARY: Control = {
  'data-tier': 'tertiary',
  className: `text-accent hover:bg-surface-sunken rounded-control px-2 py-2 font-medium ${DISABLED}`,
}

/**
 * 文字輸入框。
 *
 * ⚠️⚠️ 空白的輸入框沒有任何內容，「有沒有東西在那裡」只能靠填色或邊界本身；
 * **SHALL NOT 靠 placeholder、游標或 focus ring 達標**（`FE-X13-S04`）。
 */
export const FIELD = { className: 'border-control-edge bg-surface-raised rounded-control border px-3 py-2' } as const

/** 勾選框那一列：讓框跟字之間有距離，而且整列都點得到。 */
export const CHECK_ROW = 'flex items-center gap-2'

/**
 * 一個表單的容器。**這不是「順手統一 layout」，是 `FE-X13-S06` 要求的同一份外觀。**
 * `max-w-prose` 讓輸入框不會拉滿整個視窗寬。
 */
export const FORM = 'flex max-w-prose flex-col items-start gap-gutter'

/** 一個「說明文字 ＋ 輸入框」的欄位。**上下排，不是左右排。** */
export const FIELD_LABEL = 'flex flex-col gap-2'
