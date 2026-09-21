import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProjectOut } from '@/api/contract/rest'
import { useListPage } from '@/list-panel/useListPage'
import { BOARD_SUMMARY_COUNT, useBoardSummary } from '@/world/rooms/useBoardSummary'

// 看板摘要與面板**最終一致**（`FE-W20-S08`，design D2）：兩邊各自 fetch、都 ready、對同一份 page 0 時，
// 看板的標題是面板 page 0 的前 `min(4,n)` 筆、同順序。這裡兩個 hook 都是**真的**，共用同一個被換掉的 operation。
//
// ⚠️ **`listProjects` 被換掉，不連任何外部服務**。兩個 hook 各打一次（不共享 fetch，D1）——正是要驗「各自來、結果仍一致」。

const listProjects = vi.hoisted(() => vi.fn())
const listProfiles = vi.hoisted(() => vi.fn())
vi.mock('@/api/operations', () => ({ listProjects, listProfiles }))

const proj = (t: string) => ({ title: t }) as unknown as ProjectOut

beforeEach(() => {
  listProjects.mockReset()
  listProfiles.mockReset()
})
afterEach(() => vi.restoreAllMocks())

describe('看板摘要與面板一致（S08）', () => {
  it('[FE-W20-S08] 兩邊都 ready 時，看板標題＝面板 page 0 的前 4 筆、同序', async () => {
    // page 0 有 5 筆：面板全畫、看板只留前 4。
    listProjects.mockResolvedValue([proj('1'), proj('2'), proj('3'), proj('4'), proj('5')])

    const { result } = renderHook(() => ({
      board: useBoardSummary('projects'),
      panel: useListPage('projects'),
    }))

    await waitFor(() => {
      expect(result.current.board.status).toBe('ready')
      expect(result.current.panel.state.shown).not.toBeNull()
    })

    const panelTitles = result.current.panel.state.shown?.items.map((p) => p.title) ?? []
    const boardTitles = result.current.board.items.map((p) => p.title)

    expect(panelTitles).toEqual(['1', '2', '3', '4', '5'])
    expect(boardTitles).toEqual(panelTitles.slice(0, BOARD_SUMMARY_COUNT))
  })
})
