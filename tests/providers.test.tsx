import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { Providers } from '@/app/providers'

const Content = () => (
  <section>
    <h2>標題</h2>
    <p>第一段</p>
    <p>第二段</p>
  </section>
)

describe('全域 Provider 的單一組合位置', () => {
  it('[FE-X01-S05] 內容被完整渲染，順序與未經組合位置時相同', () => {
    const { container } = render(
      <Providers>
        <Content />
      </Providers>,
    )
    const texts = [...container.querySelectorAll('h2, p')].map((n) => n.textContent)
    expect(texts).toEqual(['標題', '第一段', '第二段'])
  })

  it('[FE-X01-S13] 不得多包一層元素：DOM 結構與未經組合位置時完全相同', () => {
    const withProviders = render(
      <Providers>
        <Content />
      </Providers>,
    ).container.innerHTML
    const without = render(<Content />).container.innerHTML

    // 逐字比對 innerHTML。多包一層 <div> 在畫面上常常看不出來，
    // 但會讓依賴父子關係的版面規則（flex/grid 的直接子元素選擇器）靜默失效。
    expect(withProviders).toBe(without)
  })
})
