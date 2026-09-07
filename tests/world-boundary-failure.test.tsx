import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { WorldErrorBoundary } from '@/app/world/WorldBoundary'

// ⚠️ 這裡 import 的是 **src/app/world/WorldBoundary.tsx 匯出的那一個**邊界。
//
// 第一版的 S04 測試在測試檔裡自己重刻了一個 `catchError(...)`，斷言的是
// 那個假元件 —— 那等於在測 Next 的 API，不是在測我們的程式碼。
// **把正式碼裡的重試按鈕整個拔掉，那個測試照樣是綠的。**
//
// 為什麼不用「讓 next/dynamic 真的載入失敗」來觸發它：實測過，
// jsdom 裡的 next/dynamic 載入失敗**渲染空的、不拋錯**，邊界不會被觸發
// （瀏覽器的 dev 模式也一樣）。所以這裡直接給邊界一個會拋錯的 child，
// 「真的 chunk 失敗會走到這個邊界」由 design.md 的 V4／V5 在 production build 上驗。

function Boom(): React.ReactNode {
  throw new Error('chunk load failed')
}

describe('World 區域的 client 邊界（失敗路徑）', () => {
  it('[FE-X01-S04] 載入失敗：顯示可辨識的訊息與重試，頁面其餘部分還在', () => {
    render(
      <main>
        <h1>GuildHub</h1>
        <WorldErrorBoundary>
          <Boom />
        </WorldErrorBoundary>
      </main>,
    )

    expect(screen.getByRole('alert')).toHaveTextContent('世界載入失敗')
    expect(screen.getByRole('button', { name: '重試' })).toBeInTheDocument()
    // 規格的字面要求：MUST NOT 整頁空白
    expect(screen.getByRole('heading', { name: 'GuildHub' })).toBeInTheDocument()
  })

  it('[FE-X01-S04] 重試真的會做事 —— 不是一顆什麼都不做的按鈕', () => {
    // 防的是「按鈕還在但沒有行為」。React.lazy 會快取 rejected 的 promise，
    // 所以正式碼選的是整頁重載（理由寫在 WorldBoundary.tsx）。
    const reload = vi.fn()
    Object.defineProperty(window, 'location', {
      value: { ...window.location, reload },
      writable: true,
      configurable: true,
    })

    render(
      <WorldErrorBoundary>
        <Boom />
      </WorldErrorBoundary>,
    )
    screen.getByRole('button', { name: '重試' }).click()

    expect(reload).toHaveBeenCalledOnce()
  })
})
