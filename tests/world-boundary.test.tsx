import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import WorldPage from '@/app/world/page'

// jsdom 沒有 WebGL，真的 `<Canvas>` 一掛就報
// `Not implemented: HTMLCanvasElement's getContext()`。
// 被 mock 的是第三方的邊界，斷言的仍然是我們的路由與邊界輸出。
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

// LocalPlayer 會操作 three 的 Object3D（getObjectByName、transform）。
// jsdom 裡沒有真的場景圖，所以這裡把它換成殼 ——
// **它的邏輯全部是純函式，由 tests/player.test.ts 直接測正式碼**，
// 不靠這裡的渲染。
vi.mock('@/world/player/LocalPlayer', () => ({
  LocalPlayer: () => null,
}))

describe('World 區域的 client 邊界（成功路徑）', () => {
  it('[FE-X01-S03] 進入世界頁面：Layout 與 World 區域的內容都在', async () => {
    // fe-w01-worldcanvas 之前這裡斷言的是「佔位內容」。佔位被 3D 取代之後
    // 那句話不再成立，所以那條 Scenario 被 MODIFIED —— **ID 沒有變**。
    HTMLCanvasElement.prototype.getContext = vi.fn((id: string) =>
      id === 'webgl2' ? ({} as RenderingContext) : null,
    ) as typeof HTMLCanvasElement.prototype.getContext

    render(<WorldPage />)

    expect(screen.getByRole('heading', { name: 'GuildHub' })).toBeInTheDocument()
    // World 內容是動態載入的，所以要等
    expect(await screen.findByTestId('world-canvas-container')).toBeInTheDocument()
  })
})
