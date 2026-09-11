// focus trap 的計算。規格 `FE-X06-S11`：持有鎖的面板開啟期間，Tab／Shift+Tab 只在面板內循環。
//
// ⚠️ **「符合 selector」不等於「瀏覽器會 Tab 到」**（審查抓到的）：被 CSS 藏起來的、disabled 的、
// `inert` 裡的、`hidden` 的都不在瀏覽器的 Tab 序列裡；`contenteditable`、`summary`、有 controls 的
// 媒體、`iframe` 則在。算錯的話，程式以為的「最後一個」不是真的最後一個，焦點在真的最後一個上按 Tab
// 就跑出面板了。
//
// jsdom 沒有排版引擎，`checkVisibility` 也沒有 —— 有的時候才用（瀏覽器都有）。

const CANDIDATES = [
  'a[href]',
  'area[href]',
  'button',
  'input',
  'select',
  'textarea',
  'summary',
  'iframe',
  'audio[controls]',
  'video[controls]',
  '[contenteditable]:not([contenteditable="false"])',
  '[tabindex]',
].join(',')

function isDisabled(el: HTMLElement): boolean {
  if ((el as HTMLButtonElement).disabled) return true
  return el.closest('fieldset[disabled]') !== null
}

/** 在 `root` 裡、瀏覽器會 Tab 到的元素，DOM 順序。 */
export function tabbablesIn(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(CANDIDATES)).filter((el) => {
    // `contenteditable` 在瀏覽器裡預設 tabIndex 是 0，jsdom 回 -1 —— 看屬性，沒寫就當 0。
    const attr = el.getAttribute('tabindex')
    const tabIndex = attr !== null ? Number(attr) : el.matches('[contenteditable]') ? 0 : el.tabIndex
    if (Number.isNaN(tabIndex) || tabIndex < 0) return false
    if (isDisabled(el)) return false
    if (el.hidden || el.closest('[inert]') !== null || el.closest('[hidden]') !== null) return false
    if (el instanceof HTMLInputElement && el.type === 'hidden') return false
    if (typeof el.checkVisibility === 'function' && !el.checkVisibility()) return false
    return true
  })
}

/**
 * Tab 的 keydown 要不要攔、攔了焦點要去哪。回 `null` 就交給瀏覽器。
 *
 * 焦點在清單裡：只在邊界攔（最後一個往前 → 第一個；第一個往後 → 最後一個）。
 * 焦點在容器上（列表本身、詳情本身，`tabIndex=-1`）：往前 → 容器之後的第一個，沒有就繞到第一個；
 * 往後 → 容器之前的最後一個，沒有就繞到最後一個。**沒有任何可 Tab 的元素時攔下來留在原地** ——
 * 交給瀏覽器的話它會跑出面板（審查抓到的：詳情裡只有預覽、沒有按鈕的那一格）。
 */
export function nextTabStop(root: HTMLElement, active: Element | null, backwards: boolean): HTMLElement | 'stay' | null {
  const tabbables = tabbablesIn(root)
  if (tabbables.length === 0) return 'stay'
  const first = tabbables[0] as HTMLElement
  const last = tabbables[tabbables.length - 1] as HTMLElement
  const index = active === null ? -1 : tabbables.indexOf(active as HTMLElement)
  if (index !== -1) {
    if (backwards && index === 0) return last
    if (!backwards && index === tabbables.length - 1) return first
    return null
  }
  if (active === null || !root.contains(active)) return backwards ? last : first
  if (backwards) {
    const before = tabbables.filter((el) => Boolean(active.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_PRECEDING))
    return before[before.length - 1] ?? last
  }
  const after = tabbables.find((el) => Boolean(active.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING))
  return after ?? first
}
