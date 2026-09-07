import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import WorldPage from '@/app/world/page'

// 這個檔案只測**成功路徑**。失敗路徑在 world-boundary-failure.test.tsx，
// 因為那裡要用 `vi.mock` 讓 WorldPlaceholder 的載入失敗，而 mock 是整檔生效的。

describe('World 區域的 client 邊界（成功路徑）', () => {
  it('[FE-X01-S03] 進入世界頁面：Layout 與 World 佔位內容都在', async () => {
    render(<WorldPage />)

    expect(screen.getByRole('heading', { name: 'GuildHub' })).toBeInTheDocument()
    // World 內容是動態載入的，所以要等
    expect(await screen.findByTestId('world-placeholder')).toBeInTheDocument()
  })
})
