import { describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import WorldCanvas from '@/world/WorldCanvas'

// 規格 FE-W01-S08。**這條測試差一點是恆真的**，過程值得留著：
//
// 1. 第一版直接數 `window` 上的監聽，卸載前後比較。但 jsdom 沒有
//    `ResizeObserver`，R3F 的 `<Canvas>` 根本掛不起來 —— 它從來沒機會掛任何
//    監聽，於是「前後相等」變成 `0 == 0` 恆真，**拿掉清理邏輯也不會紅**。
//    修法是在 vitest.setup 補 ResizeObserver（補它不是為了讓測試變綠，
//    是為了讓它量得到真的東西）。
//
// 2. 補完之後測試紅了，說有 9 個殘留。抓 stack trace 之後發現那 9 個是
//    **`@asamuzakjp/dom-selector`（jsdom 自己的選擇器引擎）** 一次性註冊的
//    `click` / `keydown` / `focus`⋯⋯ —— 不是我們的，而且一個 jsdom window
//    只會掛一次。量錯對象了。
//    修法是**量第二次進出的差額**：一次性的環境監聽在第一輪就掛完。
//    這也正好是 V4 真正在乎的性質 —— 不是「有沒有殘留」，是「會不會逐次疊加」。
//
// 所以下面那句 `expect(peak).toBeGreaterThan(0)` 不是裝飾 ——
// **它是這條測試唯一能證明自己不是空的的地方。**

function instrumentWindowListeners() {
  let live = 0
  let peak = 0
  const realAdd = window.addEventListener
  const realRemove = window.removeEventListener

  window.addEventListener = function (...args: Parameters<typeof realAdd>) {
    live++
    peak = Math.max(peak, live)
    return realAdd.apply(this, args)
  }
  window.removeEventListener = function (...args: Parameters<typeof realRemove>) {
    live--
    return realRemove.apply(this, args)
  }

  return {
    get live() {
      return live
    },
    get peak() {
      return peak
    },
    resetPeak() {
      peak = live
    },
    restore() {
      window.addEventListener = realAdd
      window.removeEventListener = realRemove
    },
  }
}

describe('卸載時釋放資源', () => {
  it('[FE-W01-S08] 卸載後沒有殘留的全域監聽', () => {
    HTMLCanvasElement.prototype.getContext = vi.fn((id: string) =>
      id === 'webgl2' ? ({} as RenderingContext) : null,
    ) as typeof HTMLCanvasElement.prototype.getContext

    const listeners = instrumentWindowListeners()

    // 暖機：第一次進出會把環境層的一次性監聽掛完（jsdom 的選擇器引擎、
    // React 的委派）。那些不屬於這個元件，而且不會被卸載拿掉。
    render(<WorldCanvas />).unmount()
    const baseline = listeners.live
    listeners.resetPeak()

    const { unmount } = render(<WorldCanvas />)
    const peakDuringMount = listeners.peak
    unmount()

    const after = listeners.live
    listeners.restore()

    // 防恆真：掛載期間必須真的掛上東西，否則這條驗證什麼都沒證明
    expect(
      peakDuringMount,
      '掛載期間沒有掛上任何全域監聽 —— 這條驗證是空的，不是通過',
    ).toBeGreaterThan(baseline)

    // 第二輪之後應該回到第一輪之後的水準 —— 也就是**沒有逐次疊加**
    expect(after, `第二次進出之後多了 ${after - baseline} 個殘留監聽（會逐次疊加）`).toBe(baseline)
  })
})
