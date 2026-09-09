import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RoomDoorOut } from '@/api/contract/rest'
import { POLL_INTERVAL_MS, useRooms } from '@/world/rooms/useRooms'

// 輪詢的生命週期。規格 `FE-W12-S03`／`S04`／`S19`–`S24`。
//
// ⚠️ **`listRooms` 被換掉，測試不連任何外部服務**（delta 的 Applicability 明文）。

const listRooms = vi.hoisted(() => vi.fn())
vi.mock('@/api/operations', () => ({ listRooms }))

const ROOM: RoomDoorOut = {
  project_id: 'a0000000-0000-4000-8000-000000000001',
  title: '星際導航',
  online_count: 3,
}

/** 一個可以由測試決定什麼時候結束的請求。 */
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  // 沒有人接的 rejection 會讓 Node 印警告 —— 這裡本來就會有人接。
  return { promise, resolve, reject }
}

/**
 * 把微任務排乾。
 *
 * ⚠️ **不能用 `waitFor`。** 它在假時鐘底下會等一個永遠不會到的真實計時器 ——
 * 症狀是「測試逾時」，不是「斷言失敗」（第一版整組 9 條紅在這裡）。
 */
async function flush() {
  await act(async () => {
    for (let i = 0; i < 5; i += 1) await Promise.resolve()
  })
}

/**
 * 一個**像真的 `fetch` 一樣**在被中止時 reject 的假請求。
 *
 * ⚠️ 第一版的假 `listRooms` 完全忽略 `signal`，於是「中止」在測試裡
 * **永遠不會產生 rejection** —— 「把中止當成失敗」那條突變因此是綠的。
 */
function abortable(): (options: { signal?: AbortSignal }) => Promise<RoomDoorOut[]> {
  return ({ signal }) =>
    new Promise<RoomDoorOut[]>((_resolve, reject) => {
      signal?.addEventListener('abort', () => {
        reject(new DOMException('The operation was aborted.', 'AbortError'))
      })
    })
}

function setVisibility(value: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { value, configurable: true })
  document.dispatchEvent(new Event('visibilitychange'))
}

beforeEach(() => {
  vi.useFakeTimers()
  listRooms.mockReset()
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('四種狀態', () => {
  it('[FE-W12-S03] 第一次請求還沒回來時是 loading，走廊上沒有門', () => {
    listRooms.mockReturnValue(deferred<RoomDoorOut[]>().promise)
    const { result } = renderHook(() => useRooms(6))

    expect(result.current.status).toBe('loading')
    expect(result.current.doors).toEqual([])
  })

  it('[FE-W12-S04] 第一次請求失敗是 failed，不是「沒有專案」', async () => {
    listRooms.mockRejectedValue(new Error('連不上'))
    const { result } = renderHook(() => useRooms(6))

    await flush()
    expect(result.current.status).toBe('failed')
    // ⚠️ **`failed` 與「空清單」必須分得開**（規格 `FE-W12-S02`）——
    // 兩者都是「沒有門」，長得一樣的話玩家會一直重新整理。
    expect(result.current.doors).toEqual([])
  })

  it('[FE-W12-S02] 空陣列是 ready，不是 failed', async () => {
    listRooms.mockResolvedValue([])
    const { result } = renderHook(() => useRooms(6))

    await flush()
    expect(result.current.status).toBe('ready')
    expect(result.current.doors).toEqual([])
  })

  it('[FE-W12-S22] 輪詢失敗時門留在原地，狀態變成 stale', async () => {
    listRooms.mockResolvedValueOnce([ROOM]).mockRejectedValueOnce(new Error('抖了一下'))
    const { result } = renderHook(() => useRooms(6))

    await flush()
    expect(result.current.status).toBe('ready')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS)
    })

    expect(result.current.status).toBe('stale')
    // **一次網路抖動不該讓走廊變成空的。**
    expect(result.current.doors).toHaveLength(1)
  })
})

describe('輪詢的生命週期', () => {
  it('[FE-W12-S19] 頁籤不可見時，三個週期內都沒有送出請求', async () => {
    listRooms.mockResolvedValue([ROOM])
    renderHook(() => useRooms(6))
    await flush()
    expect(listRooms).toHaveBeenCalledTimes(1)

    act(() => setVisibility('hidden'))
    const before = listRooms.mock.calls.length

    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 3)
    })
    expect(listRooms).toHaveBeenCalledTimes(before)
  })

  it('[FE-W12-S20] 回到可見時立即請求，不等下一個週期', async () => {
    listRooms.mockResolvedValue([ROOM])
    renderHook(() => useRooms(6))
    await flush()
    expect(listRooms).toHaveBeenCalledTimes(1)

    act(() => setVisibility('hidden'))
    const before = listRooms.mock.calls.length

    await act(async () => {
      setVisibility('visible')
      await Promise.resolve()
    })
    // **沒有推進任何時間。**
    expect(listRooms).toHaveBeenCalledTimes(before + 1)
  })

  it('[FE-W12-S21] 前一次還沒回來時，週期到了也不送第二個', async () => {
    listRooms.mockReturnValue(deferred<RoomDoorOut[]>().promise)
    renderHook(() => useRooms(6))
    await flush()
    expect(listRooms).toHaveBeenCalledTimes(1)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 2)
    })
    expect(listRooms).toHaveBeenCalledTimes(1)
  })

  it('[FE-W12-S24] 切走又切回來時，進行中那一次被中止', async () => {
    const first = deferred<RoomDoorOut[]>()
    listRooms.mockReturnValueOnce(first.promise).mockResolvedValue([ROOM])
    renderHook(() => useRooms(6))
    await flush()
    expect(listRooms).toHaveBeenCalledTimes(1)

    const signal = listRooms.mock.calls[0]?.[0]?.signal as AbortSignal
    expect(signal.aborted).toBe(false)

    act(() => setVisibility('hidden'))
    // ⚠️ **是中止，不是「捨棄結果」。** 只標記不採用的話那個請求仍然在飛，
    // 下面那次「回到可見立即請求」會讓兩個同時存在。
    expect(signal.aborted).toBe(true)

    await act(async () => {
      setVisibility('visible')
      await Promise.resolve()
    })
    expect(listRooms).toHaveBeenCalledTimes(2)
  })

  it('[FE-W12-S24] 晚到的舊回應不寫任何狀態', async () => {
    const first = deferred<RoomDoorOut[]>()
    listRooms.mockReturnValueOnce(first.promise).mockResolvedValue([ROOM])
    const { result } = renderHook(() => useRooms(6))
    await flush()
    expect(listRooms).toHaveBeenCalledTimes(1)

    act(() => setVisibility('hidden'))
    await act(async () => {
      setVisibility('visible')
      await Promise.resolve()
    })

    // 舊的那一次現在才回來，而且帶著**不一樣**的資料。
    const stale: RoomDoorOut = { ...ROOM, project_id: 'ffffffff-0000-4000-8000-00000000000f' }
    await act(async () => {
      first.resolve([stale])
      await Promise.resolve()
    })

    await flush()
    expect(result.current.status).toBe('ready')
    expect(result.current.doors.map((d) => d.project_id)).toEqual([ROOM.project_id])
  })

  it('[FE-W12-S23] 卸載會中止進行中的請求，晚到的回應不寫狀態也不拋錯', async () => {
    const pending = deferred<RoomDoorOut[]>()
    listRooms.mockReturnValue(pending.promise)
    const { unmount } = renderHook(() => useRooms(6))
    await flush()
    expect(listRooms).toHaveBeenCalledTimes(1)

    const signal = listRooms.mock.calls[0]?.[0]?.signal as AbortSignal
    expect(signal.aborted).toBe(false)

    const errors: unknown[] = []
    const onError = (event: ErrorEvent) => errors.push(event.error)
    window.addEventListener('error', onError)

    unmount()
    // ⚠️ **「卸載之後不寫狀態」在 React 19 裡沒有任何可觀察的後果** ——
    // 對已卸載的元件 setState 是靜默的 no-op，所以那件事驗不到。
    // 可觀察的是**中止**：`/world` 是會被離開的路由，而週期是 30 秒。
    expect(signal.aborted).toBe(true)

    await act(async () => {
      pending.resolve([ROOM])
      await Promise.resolve()
    })

    window.removeEventListener('error', onError)
    expect(errors).toEqual([])
  })

  it('[FE-W12-S24] 中止造成的 rejection 不得被畫成「資料拿不到」', async () => {
    listRooms.mockResolvedValueOnce([ROOM]).mockImplementation(abortable())
    const { result } = renderHook(() => useRooms(6))
    await flush()
    expect(result.current.status).toBe('ready')

    // 第二次請求（輪詢）發出去，還沒回來。
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS)
    })

    // 切到背景 → 中止 → 假的請求會像真的 `fetch` 一樣 reject 一個 AbortError。
    await act(async () => {
      setVisibility('hidden')
      await Promise.resolve()
    })
    await flush()

    // **狀態不得變成 stale 或 failed。** 那是我們自己要求的中止，不是後端出事。
    expect(result.current.status).toBe('ready')
    expect(result.current.doors).toHaveLength(1)
  })

  it('[FE-W12-S19] 卸載之後不再輪詢', async () => {
    listRooms.mockResolvedValue([ROOM])
    const { unmount } = renderHook(() => useRooms(6))
    await flush()
    expect(listRooms).toHaveBeenCalledTimes(1)

    unmount()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 3)
    })
    expect(listRooms).toHaveBeenCalledTimes(1)
  })
})
