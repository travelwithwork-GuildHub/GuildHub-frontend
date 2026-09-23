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

/** 文字的層級（`FE-X16-S03`）。內文是預設，不標；`body` 不在這裡，因為「沒有標記的 p」就是內文。 */
export type TextLevel = 'display' | 'title' | 'heading' | 'caption'

/** 一個文字常數：字級 class ＋ 層級標記。跟 `Control` 一樣用 `{...TITLE}` 展開，`withClass()` 加自己的 class。 */
export interface TextStyle {
  readonly className: string
  readonly 'data-text': TextLevel
}

/** 頁面標題（`/login`、`/`、404 的 h1）：`≥ 1.5 ×` 內文。 */
export const DISPLAY: TextStyle = { 'data-text': 'display', className: 'text-display font-semibold tracking-tight' }
/** 面板標題（殼的標題列、視窗的第一行、`/login` 三個區塊的 h2）：`≥ 1.25 ×` 內文。 */
export const TITLE: TextStyle = { 'data-text': 'title', className: 'text-title font-semibold' }
/** 條目標題（卡片標題、對話對象的名字）：介於面板標題與內文之間。 */
export const HEADING: TextStyle = { 'data-text': 'heading', className: 'text-heading font-medium' }
/** 說明文字（欄位提示、狀態列、chip、時間戳）：`≥ 13px`；顏色由呼叫端決定（`ink-muted`、`danger` 都要對背景 `≥ 4.5:1`，`S04`）。 */
export const CAPTION: TextStyle = { 'data-text': 'caption', className: 'text-caption' }

/**
 * 文字輸入框。
 *
 * ⚠️⚠️ 空白的輸入框沒有任何內容，「有沒有東西在那裡」只能靠填色或邊界本身；
 * **SHALL NOT 靠 placeholder、游標或 focus ring 達標**（`FE-X13-S04`）。
 */
export const FIELD = { className: 'border-control-edge bg-surface-raised rounded-control w-full border px-3 py-2' } as const

/** 勾選框那一列：讓框跟字之間有距離，而且整列都點得到。 */
export const CHECK_ROW = 'flex items-center gap-2'

/**
 * 深色玻璃 HUD 上的 icon-only 控制（`FE-X17`）。標題列與世界 HUD 的入口從文字按鈕改成圖示膠囊時共用這一份，
 * 讓它們看起來是「世界的系統選單」而不是網頁導覽列。低顯著：沒有填色、沒有邊框，hover 才浮一層極淡的亮面。
 * **文字色是玻璃上的淺色**（深 header 上深字會看不見）；**呼叫端一定要給 `aria-label`**（icon 沒有可見文字，讀屏／鍵盤靠它）。
 * 高度下限走 `globals.css` base 層（跟其他控制一致），所以不撐高標題列（`FE-X16-S19` 的 rect）。
 */
export const HUD_ICON_BUTTON = 'text-glass-ink hover:bg-glass-line rounded-control flex items-center justify-center px-2 py-2'

/**
 * 深色玻璃 HUD 上的**文字**按鈕（`FE-X17` §4.1）。承接 `HUD_ICON_BUTTON` 的低顯著邏輯：無邊框、無填色、
 * hover 才浮一層極淡亮面（`bg-glass-line`）＋字轉亮；點擊微動畫走 `.hud-press`（globals.css，尊重 `prefers-reduced-motion`）。
 * 給玻璃上的**次要**動作（聊天送出、回到最新、清除／收合）——**不是** primary（primary 仍用 `PRIMARY` 的填色，每區至多一個，`FE-X16-S09`）。
 * ⚠️ 它不帶 `data-tier`：次要級在 3D HUD 上刻意不搶視線，層級由「有沒有填色」表達（primary 有、其餘沒有）。
 * ⚠️ 文字色是玻璃上的淺色；玻璃外（淺底）不要用它。
 */
export const HUD_GHOST_BUTTON = `text-glass-ink-muted hover:text-glass-ink hover:bg-glass-line rounded-control hud-press px-3 py-1.5 font-medium ${DISABLED}`

/**
 * 深色玻璃 HUD 上的快捷 chip（`FE-X17` §4.1）。比 ghost 多一道邊框（一組可選項要看得出邊界），選中（`aria-pressed`）的填色與描邊
 * 由 `.glass-panel button[aria-pressed='true']` 接手（globals.css）——base 的 ink 深色邊界在深玻璃上看不見。
 */
export const HUD_CHIP = 'text-glass-ink hover:bg-glass-line border-glass-line rounded-control hud-press border px-2 py-1 font-medium'

/**
 * 深色玻璃 HUD 上的文字輸入框（`FE-X17` §4.2）。跟 `FIELD` 同一個責任（空框也看得見，`FE-X13-S04`）——
 * 但改走 glass-native：半透明填色（`glass-field`）＋明確邊框（`glass-field-edge`，撐起空框的可辨識），不是白底原生框。
 * 焦點環由 `.glass-panel …:focus-visible` 的高亮色接手（globals.css）。用在聊天輸入、狀態輸入。
 */
export const HUD_FIELD = { className: 'bg-glass-field border-glass-field-edge text-glass-ink rounded-control w-full border px-3 py-2' } as const

/**
 * 一個表單的容器。**這不是「順手統一 layout」，是 `FE-X13-S06` 要求的同一份外觀。**
 * `w-full max-w-sm` 讓表單填滿容器（窄面板裡填滿、寬登入頁封頂在 24rem），欄位再靠 `w-full` 填滿表單 ——
 * 沒有這個上限時，欄位在寬頁上會拉太長、在窄面板裡（舊 `items-start`）又縮成固定寬、左半截像被切掉。
 */
export const FORM = 'flex w-full max-w-sm flex-col gap-gutter'

/** 一個「說明文字 ＋ 輸入框」的欄位。**上下排，不是左右排。** */
export const FIELD_LABEL = 'flex flex-col gap-2'
