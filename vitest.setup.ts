import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// **沒有這一行，每個測試都會看到前一個測試留下的 DOM。**
// Testing Library 的自動 cleanup 只在 `globals: true` 時才會註冊，
// 而這個專案沒有開 globals。實測症狀是
// `Found multiple elements with the role "heading"` ——
// 但更危險的是反過來的那一種：**測試因為看到別人的 DOM 而假性通過。**
afterEach(cleanup)

// jsdom 沒有 ResizeObserver，而 R3F 的 `<Canvas>` 透過 react-use-measure 用它 ——
// 沒有這個 polyfill 的話 Canvas 一掛就報
// "This browser does not support ResizeObserver out of the box"。
//
// **補它不是為了讓測試變綠，是為了讓測試量得到真的東西**：沒有它，
// R3F 從來沒機會掛任何全域監聽，於是 FE-W01-S08 的「卸載前後相等」
// 會變成 0 == 0 的恆真斷言。
class ResizeObserverPolyfill {
  constructor(private readonly callback: ResizeObserverCallback) {}
  observe(target: Element) {
    this.callback(
      [{ target, contentRect: { width: 800, height: 600 } } as unknown as ResizeObserverEntry],
      this as unknown as ResizeObserver,
    )
  }
  unobserve() {}
  disconnect() {}
}

if (!('ResizeObserver' in globalThis)) {
  globalThis.ResizeObserver = ResizeObserverPolyfill as unknown as typeof ResizeObserver
}
