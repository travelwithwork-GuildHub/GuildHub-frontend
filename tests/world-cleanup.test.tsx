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

// **這個檔案用 fake timer，理由不是速度。**
//
// R3F 的 <Canvas> 用 react-use-measure，而 R3F 給它的設定是
// `debounce: { scroll: 50, resize: 0 }`。react-use-measure 的 debounce 是
// `setTimeout(fn, 0)`，而且**沒有在卸載時取消它**（那個 helper 沒有
// 對外暴露 cancel）。實測：掛載時排 1 個 timer，卸載後仍未清除。
//
// 那個孤兒 timer 會在 jsdom 被拆掉之後才觸發，然後炸
// `ReferenceError: HTMLElement is not defined`，並且算成 **unhandled error**
// —— 34 個測試全過、整個 run 卻非零結束。CI 上實際發生過一次
// （run 34120594174），本機幾乎重現不了，因為它是時序相依的。
//
// 用 fake timer 之後那個真的 timer 根本不會存在，所以不是跟它賽跑，
// 而是讓它不可能發生。**這是測試環境的問題，不是產品問題** ——
// 瀏覽器裡頁面不會被拆掉，那個 timer 觸發只是個 no-op。
describe('卸載時釋放資源', () => {
  it('[FE-W01-S08] 卸載後沒有殘留的全域監聽', () => {
    vi.useFakeTimers()
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

    // 證明這個檔案沒有留下任何真的 timer 給 jsdom 拆掉之後去踩
    const pendingFakeTimers = vi.getTimerCount()
    vi.useRealTimers()

    // 防恆真：掛載期間必須真的掛上東西，否則這條驗證什麼都沒證明
    expect(
      peakDuringMount,
      '掛載期間沒有掛上任何全域監聽 —— 這條驗證是空的，不是通過',
    ).toBeGreaterThan(baseline)

    // 第二輪之後應該回到第一輪之後的水準 —— 也就是**沒有逐次疊加**
    expect(after, `第二次進出之後多了 ${after - baseline} 個殘留監聽（會逐次疊加）`).toBe(baseline)

    // 這一行不是在測產品，是在**證明上面那段註解講的事真的發生了**：
    // react-use-measure 確實排了 timer 而且沒有清掉它。
    // 數字變成 0 的話，代表這個 fake timer 的防護已經沒有保護對象了 ——
    // 那時應該回來把它拿掉，而不是留一個沒有意義的機制。
    expect(pendingFakeTimers, 'react-use-measure 已經不再留下未清除的 timer 了嗎？').toBeGreaterThan(0)
  })
})
