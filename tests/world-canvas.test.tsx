import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { isWebGL2Available } from '@/world/webgl'
import WorldCanvas from '@/world/WorldCanvas'

// ⚠️ 測試 import 的是**正式碼**（`@/world/webgl`、`@/world/WorldCanvas`），
// 不在測試檔裡重刻一份 —— 那樣的話把正式碼的偵測拔掉，測試照樣是綠的。
//
// 被 mock 的只有 `@react-three/fiber` 的 `Canvas`：jsdom 沒有 WebGL，
// 真的 Canvas 一掛就報 `Not implemented: HTMLCanvasElement's getContext()`。
// **那是第三方的邊界，不是我們的元件。**
// 這個 mock 換來的是「分支與輸出正確」，不是「畫面上真的有東西」——
// 後者由 design.md〈驗證方式〉的 V1–V3 在 production build 上驗。
vi.mock('@react-three/fiber', () => ({
  Canvas: ({ children, onCreated }: { children?: ReactNode; onCreated?: () => void }) => {
    onCreated?.() // 真的 Canvas 建好 renderer 之後會呼叫它；殼也要，否則 S05 測不到
    return <div data-testid="r3f-canvas-stub">{children}</div>
  },
}))

const realGetContext = HTMLCanvasElement.prototype.getContext

function stubWebGL2(available: boolean) {
  HTMLCanvasElement.prototype.getContext = vi.fn((id: string) =>
    id === 'webgl2' && available ? ({} as RenderingContext) : null,
  ) as typeof realGetContext
}

afterEach(() => {
  HTMLCanvasElement.prototype.getContext = realGetContext
  vi.restoreAllMocks()
})

describe('WebGL2 偵測（純函式）', () => {
  it('取不到 webgl2 context 時回 false', () => {
    stubWebGL2(false)
    expect(isWebGL2Available()).toBe(false)
  })

  it('取得 webgl2 context 時回 true', () => {
    stubWebGL2(true)
    expect(isWebGL2Available()).toBe(true)
  })

  it('getContext 拋錯時算作不可用', () => {
    // 有些瀏覽器停用 WebGL 時是**拋錯**不是回 null。兩種都要算不可用。
    HTMLCanvasElement.prototype.getContext = vi.fn(() => {
      throw new Error('WebGL is disabled')
    }) as typeof realGetContext
    expect(isWebGL2Available()).toBe(false)
  })
})

describe('WebGL2 不可用時不留白畫面', () => {
  it('[FE-W01-S06] 顯示可辨識說明，且畫面上沒有重試操作', () => {
    stubWebGL2(false)

    render(
      <main>
        <h1>GuildHub</h1>
        <WorldCanvas />
      </main>,
    )

    expect(screen.getByTestId('world-webgl-unavailable')).toHaveTextContent('無法顯示 3D 世界')
    // 規格的字面要求：MUST NOT 出現重試操作。
    // WebGL2 不可用不是暫時性失敗，重試永遠不會成功。
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    // 頁面其餘部分仍然可用
    expect(screen.getByRole('heading', { name: 'GuildHub' })).toBeInTheDocument()
  })

  it('[FE-W01-S07] WebGL2 可用時不顯示那段說明，改為渲染 World', () => {
    stubWebGL2(true)

    render(<WorldCanvas />)

    expect(screen.queryByTestId('world-webgl-unavailable')).not.toBeInTheDocument()
    expect(screen.getByTestId('world-canvas-container')).toBeInTheDocument()
  })
})

describe('3D 內容載入中的呈現', () => {
  it('[FE-W01-S05] renderer 建好之後等待狀態消失', () => {
    stubWebGL2(true)

    render(<WorldCanvas />)

    // mock 的 Canvas 會同步呼叫 onCreated，所以這裡看到的是 ready 之後的狀態
    expect(screen.queryByTestId('world-loading')).not.toBeInTheDocument()
    expect(screen.getByTestId('world-canvas-container')).toBeInTheDocument()
  })
})
