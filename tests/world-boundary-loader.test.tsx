import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { useEffect } from 'react'
import type { Identity } from '@/identity/types'
import { WorldBoundary } from '@/app/world/WorldBoundary'

// 這個檔案控制兩件事：目前身分、以及被動態載入的 `WorldCanvas` 何時回報 ready。
// 被 mock 的是**身分來源**與**第三方 3D 元件的邊界**，斷言的仍然是 `WorldBoundary`
// 自己的 gate 與連續載入層（FE-X15-S01／S02）。
let currentIdentity: Identity = { state: 'unknown' }
// `false` 時：`WorldContent` 有掛載（`world-canvas-container` 出現）但**不回報 ready** ——
// 模擬「chunk 到了、WebGL 還沒建好」那一段空窗（phase B）。
let autoReady = true

vi.mock('@/identity/IdentityProvider', () => ({
  useIdentity: () => currentIdentity,
}))

vi.mock('@/world/WorldCanvas', () => ({
  // 大寫名字：讓 eslint 認得這是 React 元件，`useEffect` 才合法（rules-of-hooks）。
  default: function MockWorldCanvas({ onReady }: { onReady?: () => void }) {
    useEffect(() => {
      if (autoReady) onReady?.()
    }, [onReady])
    return <div data-testid="world-canvas-container" />
  },
}))

beforeEach(() => {
  currentIdentity = { state: 'unknown' }
  autoReady = true
})
afterEach(() => vi.clearAllMocks())

const tick = () => new Promise((r) => setTimeout(r, 0))

describe('WorldBoundary：身分 gate 與連續載入層', () => {
  it('[FE-X15-S02] 身分 unknown 時不建立 WorldContent，但載入層仍在', async () => {
    currentIdentity = { state: 'unknown' }
    render(<WorldBoundary />)

    expect(screen.getByTestId('world-load-sequence')).toBeInTheDocument()
    // 給動態載入一個 tick 的機會 —— unknown 時它不該被觸發。
    await tick()
    expect(screen.queryByTestId('world-canvas-container')).not.toBeInTheDocument()
  })

  it.each([
    ['guest', { state: 'guest', reason: 'no-session' } as Identity],
    ['unavailable', { state: 'unavailable', cause: new Error('x') } as Identity],
  ])('[FE-X15-S02] 身分 settled（%s）才建立 WorldContent、ready 後載入層消失', async (_label, id) => {
    currentIdentity = id
    render(<WorldBoundary />)

    expect(
      await screen.findByTestId('world-canvas-container', undefined, { timeout: 10_000 }),
    ).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.queryByTestId('world-load-sequence')).not.toBeInTheDocument(),
    )
  }, 20_000)

  it('[FE-X15-S01] 載入層是帶 role=status／aria-busy 的 DIV，且有一個持續運作的動畫', () => {
    currentIdentity = { state: 'unknown' }
    render(<WorldBoundary />)

    const loader = screen.getByTestId('world-load-sequence')
    expect(loader.tagName).toBe('DIV')
    expect(loader).toHaveAttribute('role', 'status')
    expect(loader).toHaveAttribute('aria-busy', 'true')
    // 「看得出在動」：至少一個 motion-safe 的脈動元素（不是純靜態文字）。
    expect(loader.querySelector('.motion-safe\\:animate-pulse')).not.toBeNull()
  })

  it('[FE-X15-S01] chunk 到了但還沒 ready（phase B）時，同一個載入層仍在覆蓋', async () => {
    autoReady = false
    currentIdentity = { state: 'guest', reason: 'no-session' }
    render(<WorldBoundary />)

    // WorldContent 已掛載（chunk 到了）
    expect(
      await screen.findByTestId('world-canvas-container', undefined, { timeout: 10_000 }),
    ).toBeInTheDocument()
    // 但 Canvas 還沒 ready → 載入層必須還在（不是「chunk 一到就撤掉」）
    expect(screen.getByTestId('world-load-sequence')).toBeInTheDocument()
  }, 20_000)
})
