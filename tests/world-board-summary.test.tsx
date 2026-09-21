import { render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRef } from 'react'
import { EMPTY_STATE_COPY } from '@/empty-state/EmptyState'
import { BoardSummary, type BoardSummaryNodes } from '@/world/rooms/BoardSummary'
import type { BoardSummary as BoardSummaryState } from '@/world/rooms/useBoardSummary'

// 看板摘要的**四種狀態**與**兩塊看板的配對**。規格 `FE-W20-S01`（有內容＋配對）、`S02`（前 4 筆＋空槽）、
// `S04`（空的）、`S05`（讀不到不奪焦、stale）、`S06`（載入中骨架）。
//
// ⚠️ **`useBoardSummary` 被換掉** —— 它有自己的一組測試（`world-board-summary-data`），這裡驗的是「拿到某個狀態時看板畫什麼」。
// 種類（projects／profiles）決定畫標題還是名字，所以 mock 要能對兩種各回不同的東西（`S01` 只驗一種會恆真）。

const useBoardSummary = vi.hoisted(() => vi.fn())
vi.mock('@/world/rooms/useBoardSummary', () => ({ useBoardSummary, BOARD_SUMMARY_COUNT: 4 }))

type View = { status: BoardSummaryState<'projects'>['status']; items: unknown[]; error: unknown }
const view = (status: View['status'], items: unknown[] = [], error: unknown = null): View => ({ status, items, error })
const proj = (t: string) => ({ title: t })
const person = (n: string) => ({ display_name: n })

/** 對 projects／profiles 各給一個 view。 */
function setBoards(projects: View, profiles: View) {
  useBoardSummary.mockImplementation((kind: 'projects' | 'profiles') => (kind === 'projects' ? projects : profiles))
}

function mount() {
  const nodesRef = createRef<BoardSummaryNodes>()
  ;(nodesRef as { current: BoardSummaryNodes }).current = new Map()
  render(<BoardSummary nodesRef={nodesRef as React.RefObject<BoardSummaryNodes>} enabled />)
}

const board = (id: 'board-project' | 'board-talent') => {
  const anchor = document.querySelector(`[data-testid="board-summary-anchor"][data-board-id="${id}"]`) as HTMLElement
  return within(anchor).getByTestId('board-summary')
}

beforeEach(() => useBoardSummary.mockReset())
afterEach(() => vi.restoreAllMocks())

describe('兩塊看板的配對（S01）', () => {
  it('[FE-W20-S01] 專案看板畫標題、人才看板畫名字 —— 兩塊都在、各畫各的欄位', () => {
    setBoards(view('ready', [proj('晨光工作室'), proj('噪音地圖小隊')]), view('ready', [person('鐵砧公會長')]))
    mount()

    expect(screen.getAllByTestId('board-summary-anchor')).toHaveLength(2)
    const project = board('board-project')
    expect(within(project).getByText('晨光工作室')).toBeTruthy()
    expect(within(project).getByText('噪音地圖小隊')).toBeTruthy()
    const talent = board('board-talent')
    expect(within(talent).getByText('鐵砧公會長')).toBeTruthy()
  })
})

describe('四種狀態', () => {
  it('[FE-W20-S02] 有內容：填了字的卡 ＋ 其餘空槽（少於 4 筆）', () => {
    setBoards(view('ready', [proj('A'), proj('B')]), view('ready', []))
    mount()
    const project = board('board-project')
    expect(project.dataset.state).toBe('ready')
    expect(within(project).getAllByTestId('board-summary-item')).toHaveLength(2)
    // 4 個槽，填 2、其餘 2 個空槽
    expect(within(project).getAllByTestId('board-summary-slot')).toHaveLength(2)
  })

  it('[FE-W20-S02] 剛好 4 筆：4 張填字卡、沒有空槽', () => {
    setBoards(view('ready', [proj('1'), proj('2'), proj('3'), proj('4')]), view('ready', []))
    mount()
    const project = board('board-project')
    expect(within(project).getAllByTestId('board-summary-item')).toHaveLength(4)
    expect(within(project).queryAllByTestId('board-summary-slot')).toHaveLength(0)
  })

  it('[FE-W20-S06] 載入中：骨架卡（不先畫空位、不先畫「這裡還沒有東西」）', () => {
    setBoards(view('loading'), view('loading'))
    mount()
    const project = board('board-project')
    expect(project.dataset.state).toBe('loading')
    expect(project.getAttribute('role')).toBe('status')
    // 骨架填住卡槽（4 個），沒有「空的」文案
    expect(within(project).queryByText(EMPTY_STATE_COPY['first-empty'])).toBeNull()
    expect(within(project).queryByTestId('board-summary-item')).toBeNull()
  })

  it('[FE-W20-S04] 空的：畫「這裡還沒有東西。」、role=status，不是骨架、沒有卡', () => {
    setBoards(view('ready', []), view('ready', []))
    mount()
    const project = board('board-project')
    expect(project.dataset.state).toBe('empty')
    expect(project.getAttribute('role')).toBe('status')
    expect(within(project).getByText(EMPTY_STATE_COPY['first-empty'])).toBeTruthy()
    expect(within(project).queryByTestId('board-summary-item')).toBeNull()
  })

  it('[FE-W20-S05] 讀不到：role=status、沒有 retry 按鈕（環境資訊不奪焦）', () => {
    setBoards(view('failed', [], new Error('連不上')), view('ready', []))
    mount()
    const project = board('board-project')
    expect(project.dataset.state).toBe('failed')
    expect(project.getAttribute('role')).toBe('status')
    // **看板一律沒有 retry** —— 重試留給按 E 開出來的面板（對 FE-X04 面板行為的刻意降級）
    expect(within(project).queryByRole('button')).toBeNull()
    // 有一段可辨識的文字（語彙走 FE-X03，不在這裡斷字）
    expect(project.textContent?.length ?? 0).toBeGreaterThan(0)
  })

  it('[FE-W20-S05] stale：曾有資料後輪詢失敗，畫舊資料、不閃空白/錯誤', () => {
    setBoards(view('stale', [proj('舊的但還在')]), view('ready', []))
    mount()
    const project = board('board-project')
    expect(project.dataset.state).toBe('stale')
    expect(within(project).getByText('舊的但還在')).toBeTruthy()
    expect(within(project).queryByRole('button')).toBeNull()
  })
})
