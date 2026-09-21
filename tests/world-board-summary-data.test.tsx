import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProfileOut, ProjectOut } from '@/api/contract/rest'
import { POLL_INTERVAL_MS } from '@/world/rooms/useRooms'
import { BOARD_SUMMARY_COUNT, useBoardSummary } from '@/world/rooms/useBoardSummary'

// 看板摘要的常駐資料。規格 `FE-W20-S02`（N=4 上限）、`S04`（空 vs 讀不到）、`S05`（stale）、`S07`（進場／輪詢／隱藏／離場）。
//
// ⚠️ **`listProjects`／`listProfiles` 被換掉，測試不連任何外部服務**（delta 的 Applicability 明文）。
// 種類→端點的對應在 `useListPage` 的 `fetchListPage`，這裡換掉底層的 operation 就好。

const listProjects = vi.hoisted(() => vi.fn())
const listProfiles = vi.hoisted(() => vi.fn())
vi.mock('@/api/operations', () => ({ listProjects, listProfiles }))

const proj = (t: string) => ({ title: t }) as unknown as ProjectOut
const person = (n: string) => ({ display_name: n }) as unknown as ProfileOut
const titles = (items: readonly ProjectOut[]) => items.map((p) => p.title)

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

async function flush() {
  await act(async () => {
    for (let i = 0; i < 5; i += 1) await Promise.resolve()
  })
}

function setVisibility(value: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { value, configurable: true })
  document.dispatchEvent(new Event('visibilitychange'))
}

beforeEach(() => {
  vi.useFakeTimers()
  listProjects.mockReset()
  listProfiles.mockReset()
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('四種狀態', () => {
  it('[FE-W20-S06] 第一次請求還沒回來時是 loading、沒有 items（看板畫骨架）', () => {
    listProjects.mockReturnValue(deferred<ProjectOut[]>().promise)
    const { result } = renderHook(() => useBoardSummary('projects'))
    expect(result.current.status).toBe('loading')
    expect(result.current.items).toEqual([])
  })

  it('[FE-W20-S04] 空陣列是 ready（空的），不是 failed —— 兩者要分得開', async () => {
    listProjects.mockResolvedValue([])
    const { result } = renderHook(() => useBoardSummary('projects'))
    await flush()
    expect(result.current.status).toBe('ready')
    expect(result.current.items).toEqual([])
  })

  it('[FE-W20-S05] 第一次請求失敗是 failed、items 空、帶 error（看板畫讀不到）', async () => {
    const cause = new Error('連不上')
    listProjects.mockRejectedValue(cause)
    const { result } = renderHook(() => useBoardSummary('projects'))
    await flush()
    expect(result.current.status).toBe('failed')
    expect(result.current.items).toEqual([])
    expect(result.current.error).toBe(cause)
  })

  it('[FE-W20-S05] 曾有資料後輪詢失敗 → stale，舊 items 留著、不閃空白', async () => {
    listProjects.mockResolvedValueOnce([proj('晨光工作室')]).mockRejectedValueOnce(new Error('抖了一下'))
    const { result } = renderHook(() => useBoardSummary('projects'))
    await flush()
    expect(result.current.status).toBe('ready')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS)
    })
    expect(result.current.status).toBe('stale')
    expect(titles(result.current.items)).toEqual(['晨光工作室'])
  })
})

describe('N=4 上限、種類對應', () => {
  it('[FE-W20-S02] page 0 超過 4 筆只留前 4 筆', async () => {
    listProjects.mockResolvedValue([proj('1'), proj('2'), proj('3'), proj('4'), proj('5'), proj('6')])
    const { result } = renderHook(() => useBoardSummary('projects'))
    await flush()
    expect(result.current.items).toHaveLength(BOARD_SUMMARY_COUNT)
    expect(titles(result.current.items)).toEqual(['1', '2', '3', '4'])
  })

  it('[FE-W20-S01] projects 打 listProjects、profiles 打 listProfiles，各自 page 0', async () => {
    listProfiles.mockResolvedValue([person('鐵砧公會長')])
    const { result } = renderHook(() => useBoardSummary('profiles'))
    await flush()
    expect(listProfiles).toHaveBeenCalledTimes(1)
    expect(listProfiles.mock.calls[0]?.[0]?.page).toBe(0)
    expect(listProjects).not.toHaveBeenCalled()
    expect((result.current.items[0] as ProfileOut).display_name).toBe('鐵砧公會長')
  })
})

describe('訂閱的生命週期（跟走廊門同一套）', () => {
  it('[FE-W20-S07] 進場抓一次、30 秒後再輪詢一次', async () => {
    listProjects.mockResolvedValue([proj('a')])
    renderHook(() => useBoardSummary('projects'))
    await flush()
    expect(listProjects).toHaveBeenCalledTimes(1)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS)
    })
    expect(listProjects).toHaveBeenCalledTimes(2)
  })

  it('[FE-W20-S07] 頁籤隱藏時不輪詢，回到可見立即重取（不等週期）', async () => {
    listProjects.mockResolvedValue([proj('a')])
    renderHook(() => useBoardSummary('projects'))
    await flush()
    expect(listProjects).toHaveBeenCalledTimes(1)

    act(() => setVisibility('hidden'))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 3)
    })
    expect(listProjects).toHaveBeenCalledTimes(1)

    await act(async () => {
      setVisibility('visible')
      await Promise.resolve()
    })
    expect(listProjects).toHaveBeenCalledTimes(2)
  })

  it('[FE-W20-S07] 前一次還沒回來時，週期到了也不送第二個（單一在飛）', async () => {
    listProjects.mockReturnValue(deferred<ProjectOut[]>().promise)
    renderHook(() => useBoardSummary('projects'))
    await flush()
    expect(listProjects).toHaveBeenCalledTimes(1)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 2)
    })
    expect(listProjects).toHaveBeenCalledTimes(1)
  })

  it('[FE-W20-S07] 離場（卸載）中止在飛的請求、之後不再輪詢', async () => {
    const pending = deferred<ProjectOut[]>()
    listProjects.mockReturnValue(pending.promise)
    const { unmount } = renderHook(() => useBoardSummary('projects'))
    await flush()
    const signal = listProjects.mock.calls[0]?.[0]?.signal as AbortSignal
    expect(signal.aborted).toBe(false)

    unmount()
    expect(signal.aborted).toBe(true)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 3)
    })
    expect(listProjects).toHaveBeenCalledTimes(1)
  })

  it('[FE-W20-S07] 晚到的舊回應不寫任何狀態（中止後）', async () => {
    const first = deferred<ProjectOut[]>()
    listProjects.mockReturnValueOnce(first.promise).mockResolvedValue([proj('新的')])
    const { result } = renderHook(() => useBoardSummary('projects'))
    await flush()

    act(() => setVisibility('hidden'))
    await act(async () => {
      setVisibility('visible')
      await Promise.resolve()
    })
    // 舊的那一次現在才回來，帶著不一樣的資料 —— 已被中止，不得寫回。
    await act(async () => {
      first.resolve([proj('舊的')])
      await Promise.resolve()
    })
    await flush()
    expect(result.current.status).toBe('ready')
    expect(titles(result.current.items)).toEqual(['新的'])
  })

  it('[FE-W20-S07] enabled=false 不打、不輪詢，回 loading／空', async () => {
    listProjects.mockResolvedValue([proj('a')])
    const { result } = renderHook(() => useBoardSummary('projects', false))
    await flush()
    expect(listProjects).not.toHaveBeenCalled()
    expect(result.current.status).toBe('loading')
    expect(result.current.items).toEqual([])
  })
})
