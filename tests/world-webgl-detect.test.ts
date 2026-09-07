import { afterEach, describe, expect, it, vi } from 'vitest'
import { isWebGL2Available } from '@/world/webgl'

// ⚠️ import 的是**正式碼**。在測試檔裡重刻一份偵測邏輯再斷言它，
// 等於把正式碼的偵測拔掉之後測試照樣是綠的。

const realGetContext = HTMLCanvasElement.prototype.getContext

afterEach(() => {
  HTMLCanvasElement.prototype.getContext = realGetContext
  vi.restoreAllMocks()
})

function stubGetContext(fn: (id: string) => RenderingContext | null) {
  HTMLCanvasElement.prototype.getContext = vi.fn(fn) as typeof realGetContext
}

describe('WebGL2 偵測', () => {
  it('取得 webgl2 context 時回 true', () => {
    stubGetContext((id) => (id === 'webgl2' ? ({} as RenderingContext) : null))
    expect(isWebGL2Available()).toBe(true)
  })

  it('取不到 webgl2 context 時回 false', () => {
    stubGetContext(() => null)
    expect(isWebGL2Available()).toBe(false)
  })

  it('getContext 拋錯時算作不可用', () => {
    // 有些瀏覽器停用 WebGL 時是**拋錯**而不是回 null。兩種都要算不可用 ——
    // 只處理 null 的話，那些瀏覽器會直接白畫面。
    stubGetContext(() => {
      throw new Error('WebGL is disabled')
    })
    expect(isWebGL2Available()).toBe(false)
  })
})
