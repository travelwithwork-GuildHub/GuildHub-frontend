import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import type { ComponentType } from 'react'
import { PanelHost } from '@/panel/PanelHost'

// PanelHost：通用「開啟意圖 → 立即殼＋鎖＋焦點 → lazy 換內容」的機制（FE-X15-S04／S06；design D3）。
//
// 被注入的是 `load`（＝ production 的 `() => import(...)`，這裡換成可控的 promise）與 `lock`（＝世界輸入鎖，
// 這裡換成計數 spy）。斷言的是 host 自己的次序與釋放語意，不碰真的 chunk。
function SyntheticPanel() {
  return <div data-testid="synthetic-content">面板內容</div>
}

describe('PanelHost：開啟意圖才載、載入殼立即接管、失敗釋放（FE-X15-S04／S06）', () => {
  let loadCalls: number
  let controllers: Array<{ resolve: (m: { default: ComponentType }) => void; reject: (e: unknown) => void }>
  let makeLoad: () => Promise<{ default: ComponentType }>
  let acquireCalls: number
  let releaseCalls: number
  let lock: { acquire: () => () => void }
  let onExit: Mock<() => void>

  beforeEach(() => {
    loadCalls = 0
    controllers = []
    makeLoad = () => {
      loadCalls += 1
      return new Promise((resolve, reject) => controllers.push({ resolve, reject }))
    }
    acquireCalls = 0
    releaseCalls = 0
    lock = {
      acquire: () => {
        acquireCalls += 1
        return () => {
          releaseCalls += 1
        }
      },
    }
    onExit = vi.fn<() => void>()
  })
  afterEach(() => vi.clearAllMocks())

  /** 最近一次 `load` 的控制器（沒有就直接爆，不讓 undefined 靜默過）。 */
  const ctl = (i = 0) => {
    const c = controllers[i]
    if (c === undefined) throw new Error(`load[${i}] 還沒被呼叫`)
    return c
  }

  it('[FE-X15-S04] open=false：不呼叫 load、沒有載入殼、沒有鎖', () => {
    render(<PanelHost open={false} panelId="demo" title="示範" load={makeLoad} lock={lock} onExit={onExit} />)
    expect(loadCalls).toBe(0)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(acquireCalls).toBe(0)
  })

  it('[FE-X15-S04] open=true：立即呼叫 load，chunk 抵達前已鎖、已出現 role=status 載入殼並取得焦點', () => {
    render(<PanelHost open panelId="demo" title="示範" load={makeLoad} lock={lock} onExit={onExit} />)
    // chunk 還沒 resolve（controllers[0] 尚未 resolve）
    expect(loadCalls).toBe(1)
    expect(acquireCalls).toBe(1)
    const shell = screen.getByRole('status')
    expect(shell).toHaveAttribute('aria-busy', 'true')
    // 焦點在載入殼裡（不是掉在 body）
    expect(shell).toContainElement(document.activeElement as HTMLElement)
    expect(screen.queryByTestId('synthetic-content')).not.toBeInTheDocument()
  })

  it('[FE-X15-S04] chunk resolve 後原位換成內容、載入殼消失', async () => {
    render(<PanelHost open panelId="demo" title="示範" load={makeLoad} lock={lock} onExit={onExit} />)
    await act(async () => {
      ctl().resolve({ default: SyntheticPanel })
    })
    expect(await screen.findByTestId('synthetic-content')).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('[FE-X15-S06] chunk 抓取失敗：role=alert、釋放鎖、焦點在錯誤殼、可回世界', async () => {
    render(<PanelHost open panelId="demo" title="示範" load={makeLoad} lock={lock} onExit={onExit} />)
    await act(async () => {
      ctl().reject(new Error('chunk load failed'))
    })
    const alert = await screen.findByRole('alert')
    expect(alert).toBeInTheDocument()
    expect(releaseCalls).toBe(1) // 鎖被釋放（人不再被困在世界輸入被鎖的狀態）
    expect(alert).toContainElement(document.activeElement as HTMLElement) // 焦點落在錯誤殼
    expect(screen.queryByRole('status')).not.toBeInTheDocument() // 不與載入殼並存
    screen.getByRole('button', { name: '回到世界' }).click()
    expect(onExit).toHaveBeenCalledOnce()
  })

  it('[FE-X15-S06] 重試建立新的 loader：重新呼叫 load、回到載入殼並重新鎖', async () => {
    render(<PanelHost open panelId="demo" title="示範" load={makeLoad} lock={lock} onExit={onExit} />)
    await act(async () => {
      ctl().reject(new Error('x'))
    })
    await screen.findByRole('alert')
    expect(loadCalls).toBe(1)
    await act(async () => {
      screen.getByRole('button', { name: '重試' }).click()
    })
    await waitFor(() => expect(loadCalls).toBe(2)) // 新 loader、重新請求（不是重用被快取的失敗）
    expect(screen.getByRole('status')).toBeInTheDocument() // 回到載入殼
    expect(acquireCalls).toBe(2) // 重試重新鎖
  })

  it('[FE-X15-S04] 只有 open 的那個 host 呼叫 load，另外兩個關著的不順帶載入', () => {
    const loads: [number, number, number] = [0, 0, 0]
    const mk = (i: 0 | 1 | 2) => () => {
      loads[i] += 1
      return new Promise<{ default: ComponentType }>(() => {})
    }
    render(
      <>
        <PanelHost open panelId="a" title="A" load={mk(0)} lock={lock} onExit={onExit} />
        <PanelHost open={false} panelId="b" title="B" load={mk(1)} onExit={onExit} />
        <PanelHost open={false} panelId="c" title="C" load={mk(2)} onExit={onExit} />
      </>,
    )
    expect(loads).toEqual([1, 0, 0])
  })
})
