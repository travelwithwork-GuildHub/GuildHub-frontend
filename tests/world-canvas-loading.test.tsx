import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import WorldCanvas from '@/world/WorldCanvas'

// 這個檔案的 mock **刻意不呼叫 `onCreated`** —— 模擬 renderer 還沒建好。
// 跟 world-canvas.test.tsx 分開是因為 `vi.mock` 是整檔生效的。
vi.mock('@react-three/fiber', () => ({
    // WorldCamera 會用 useThree／useFrame。jsdom 裡沒有 render loop，
    // 所以這裡給最小的替身 —— 被 mock 的仍然是**第三方的邊界**。
    useThree: (selector?: (s: unknown) => unknown) => {
      const state = { set: () => {}, size: { width: 800, height: 600 } }
      return selector ? selector(state) : state
    },
    useFrame: () => {},
  Canvas: ({ children }: { children?: ReactNode }) => (
    <div data-testid="r3f-canvas-stub">{children}</div>
  ),
}))

const realGetContext = HTMLCanvasElement.prototype.getContext
afterEach(() => {
  HTMLCanvasElement.prototype.getContext = realGetContext
  vi.restoreAllMocks()
})

describe('3D 內容載入中的呈現', () => {
  it('[FE-W01-S04] 內容尚未可渲染時顯示可辨識的等待狀態，而且它是 DOM', () => {
    HTMLCanvasElement.prototype.getContext = vi.fn((id: string) =>
      id === 'webgl2' ? ({} as RenderingContext) : null,
    ) as typeof realGetContext

    render(<WorldCanvas />)

    const loading = screen.getByTestId('world-loading')
    expect(loading).toHaveTextContent('世界載入中')
    // 規格的字面要求：等待狀態 SHALL 是 DOM 元素，不是 3D 物件 ——
    // WebGL 還沒起來的時候畫不出 3D 的等待畫面。
    expect(loading.tagName).toBe('DIV')
    expect(loading).toHaveAttribute('role', 'status')
  })
})
