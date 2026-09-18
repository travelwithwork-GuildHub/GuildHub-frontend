import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RoomDoorOut } from '@/api/contract/rest'
import { useRooms } from '@/world/rooms/useRooms'

// 規格：openspec/changes/fe-j04-form-team/specs/world-interactive-objects/spec.md
//   Requirement: 成軍／結案之後立即重取走廊的門 —— S10
//
// 跟 `world-rooms-polling.test.tsx` 同一套替身與假時鐘：`listRooms` 被換掉，**不連任何外部服務**。

const listRooms = vi.hoisted(() => vi.fn())
vi.mock('@/api/operations', () => ({ listRooms }))

const ROOM: RoomDoorOut = { project_id: 'a0000000-0000-4000-8000-000000000001', title: '星際導航', online_count: 3 }
const NEW_ROOM: RoomDoorOut = { project_id: 'a0000000-0000-4000-8000-000000000002', title: '剛成軍的', online_count: 0 }

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}
/** 像真的 fetch：被中止時 reject AbortError；沒中止就等測試決定。 */
function abortable() {
  const d = deferred<RoomDoorOut[]>()
  const fn = ({ signal }: { signal?: AbortSignal }) =>
    new Promise<RoomDoorOut[]>((resolve, reject) => {
      signal?.addEventListener('abort', () => reject(new DOMException('The operation was aborted.', 'AbortError')))
      d.promise.then(resolve, reject)
    })
  return { fn, ...d }
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
  listRooms.mockReset()
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
})
afterEach(() => {
  vi.useRealTimers()
})

describe('成軍／結案之後立即重取走廊的門', () => {
  it('[FE-J04-S10] 沒在飛就馬上打，回應更新門', async () => {
    listRooms.mockResolvedValueOnce([ROOM]).mockResolvedValueOnce([ROOM, NEW_ROOM])
    const { result } = renderHook(() => useRooms(6))
    await flush()
    expect(result.current.doors).toHaveLength(1)
    act(() => result.current.refresh())
    expect(listRooms).toHaveBeenCalledTimes(2)
    await flush()
    expect(result.current.doors.map((d) => d.title)).toContain('剛成軍的')
  })

  it('[FE-J04-S10] 在飛時呼叫兩次：不疊加，結束後恰好再打一次', async () => {
    const first = abortable()
    listRooms.mockImplementationOnce(first.fn).mockResolvedValue([ROOM, NEW_ROOM])
    const { result } = renderHook(() => useRooms(6))
    await flush()
    expect(listRooms).toHaveBeenCalledTimes(1)
    act(() => {
      result.current.refresh()
      result.current.refresh()
    })
    expect(listRooms, '在飛時疊加了第二個請求').toHaveBeenCalledTimes(1)
    first.resolve([ROOM])
    await flush()
    expect(listRooms, '在飛的結束後要再打一次（不是零次、不是兩次）').toHaveBeenCalledTimes(2)
    await flush()
    expect(result.current.doors).toHaveLength(2)
  })

  it('[FE-J04-S10] 不在大廳、分頁不可見：refresh 是 no-op', async () => {
    listRooms.mockResolvedValue([ROOM])
    const disabled = renderHook(() => useRooms(6, false))
    act(() => disabled.result.current.refresh())
    expect(listRooms).toHaveBeenCalledTimes(0)
    disabled.unmount()

    const { result } = renderHook(() => useRooms(6))
    await flush()
    expect(listRooms).toHaveBeenCalledTimes(1)
    act(() => setVisibility('hidden'))
    act(() => result.current.refresh())
    expect(listRooms, '分頁不可見還打了').toHaveBeenCalledTimes(1)
    await act(async () => {
      setVisibility('visible')
      await Promise.resolve()
    })
    expect(listRooms, '回到前景只該有既有的那一次立即更新').toHaveBeenCalledTimes(2)
  })

  it('[FE-J04-S10] 在飛時 refresh 隨即切到背景：待辦清掉、中止的 finally 不消費；回前景恰好一次', async () => {
    const first = abortable()
    listRooms.mockImplementationOnce(first.fn).mockResolvedValue([ROOM])
    const { result } = renderHook(() => useRooms(6))
    await flush()
    act(() => result.current.refresh())
    act(() => setVisibility('hidden'))
    await flush()
    expect(listRooms, '中止的 finally 消費了待辦 —— 背景分頁多打了一次').toHaveBeenCalledTimes(1)
    await act(async () => {
      setVisibility('visible')
      await Promise.resolve()
    })
    expect(listRooms).toHaveBeenCalledTimes(2)
    await flush()
    expect(listRooms).toHaveBeenCalledTimes(2)
  })

  it('[FE-J04-S10] 在飛時 refresh 隨即卸載：不再打、不寫狀態；重掛恰好一次', async () => {
    const first = abortable()
    listRooms.mockImplementationOnce(first.fn).mockResolvedValue([ROOM])
    const { result, unmount } = renderHook(() => useRooms(6))
    await flush()
    act(() => result.current.refresh())
    unmount()
    await flush()
    expect(listRooms, '卸載後還打了').toHaveBeenCalledTimes(1)
    // 卸載之後有人（例如收在 ref 裡的舊把手）再呼叫 refresh：也不能打
    act(() => result.current.refresh())
    await flush()
    expect(listRooms, '卸載後的 refresh 還打了').toHaveBeenCalledTimes(1)
    renderHook(() => useRooms(6))
    await flush()
    expect(listRooms).toHaveBeenCalledTimes(2)
  })

  it('[FE-J04-S10] 在飛時 refresh 隨即 enabled=false：不再打；變回 true 恰好一次', async () => {
    const first = abortable()
    listRooms.mockImplementationOnce(first.fn).mockResolvedValue([ROOM])
    const { result, rerender } = renderHook((enabled: boolean) => useRooms(6, enabled), { initialProps: true })
    await flush()
    act(() => result.current.refresh())
    rerender(false)
    await flush()
    expect(listRooms, '離開大廳後還打了').toHaveBeenCalledTimes(1)
    rerender(true)
    await flush()
    expect(listRooms, '回到大廳要恰好一次，不是兩次').toHaveBeenCalledTimes(2)
  })

  it('[FE-J04-S10] 中止的 finally 不得吃掉新一次在飛的待辦（微任務交錯）', async () => {
    // 背景 → 瞬間回前景（第二次請求起飛）→ 瞬間 refresh（待辦記在第二次上）→ 這時第一次（被中止）的 finally 才跑：
    // 它若不看 aborted 就會把待辦吃掉（load() 因為第二次在飛而直接 return），第二次回來後就不會再補那一次。
    const first = abortable()
    const second = abortable()
    listRooms.mockImplementationOnce(first.fn).mockImplementationOnce(second.fn).mockResolvedValue([ROOM, NEW_ROOM])
    const { result } = renderHook(() => useRooms(6))
    await flush()
    expect(listRooms).toHaveBeenCalledTimes(1)
    act(() => setVisibility('hidden'))
    act(() => setVisibility('visible'))
    act(() => result.current.refresh())
    expect(listRooms).toHaveBeenCalledTimes(2)
    await flush()
    second.resolve([ROOM])
    await flush()
    expect(listRooms, '第二次回來後沒有補打 —— 待辦被中止的 finally 吃掉了').toHaveBeenCalledTimes(3)
  })

  it('[FE-J04-S10] 立即重取回 500：門留在原地、stale', async () => {
    listRooms.mockResolvedValueOnce([ROOM]).mockRejectedValueOnce(new Error('壞了'))
    const { result } = renderHook(() => useRooms(6))
    await flush()
    act(() => result.current.refresh())
    await flush()
    expect(result.current.status).toBe('stale')
    expect(result.current.doors).toHaveLength(1)
  })
})
