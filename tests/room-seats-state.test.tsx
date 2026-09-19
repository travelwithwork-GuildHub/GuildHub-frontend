import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProjectOut, SeatOut } from '@/api/contract/rest'
import { HttpError } from '@/api/transport'
import { SEATS_POLL_MS, canClaim, classify409 } from '@/world/seats/seatRules'
import { useSeats } from '@/world/seats/useSeats'

// 規格：openspec/changes/fe-j13-seats/specs/room-seats/spec.md
//   Requirement: 座位以重取為準：進房、坐下後、409 後各一次，每 30 秒一次；不可見時停；晚到作廢 —— S04
//   Requirement: 一鍵入座 —— S02 的狀態半邊（送出中只送一次、201 重取）
//   Requirement: 失敗回饋可恢復、兩種 409 分得開 —— S03 的狀態半邊（畫面在 `room-seats.test.tsx`）
//
// 跟 `rooms-refresh.test.tsx` 同一套替身與假時鐘：三個 operation 被換掉，**不連任何外部服務**。`classify409`／`canClaim` 是純函式，直接驗。

const ops = vi.hoisted(() => ({ listSeats: vi.fn(), claimSeat: vi.fn(), getProject: vi.fn() }))
vi.mock('@/api/operations', () => ops)

const ME = 'a0000000-0000-4000-8000-000000000001'
const OTHER = 'a0000000-0000-4000-8000-000000000002'
const ROOM = 'b0000000-0000-4000-8000-000000000001'
const ROOM2 = 'b0000000-0000-4000-8000-000000000002'
const project = (status: ProjectOut['status'] = 'active', seat_count = 4): ProjectOut => ({ id: ROOM, owner_id: OTHER, title: '房', body: '', needed_skills: [], status, room_template: 0, seat_count, expires_at: '2027-01-01T00:00:00Z', updated_at: '2026-09-01T00:00:00Z' })
const seat = (seat_index: number, user_id: string): SeatOut => ({ seat_index, user_id, desk_template: 0, claimed_at: '2026-09-19T00:00:00Z' })

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
function abortable<T>() {
  const d = deferred<T>()
  const fn = (_id: string, { signal }: { signal?: AbortSignal } = {}) =>
    new Promise<T>((resolve, reject) => {
      signal?.addEventListener('abort', () => reject(new DOMException('The operation was aborted.', 'AbortError')))
      d.promise.then(resolve, reject)
    })
  return { fn, ...d }
}
async function flush() {
  await act(async () => {
    for (let i = 0; i < 6; i += 1) await Promise.resolve()
  })
}
const tick = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms) })
function setVisibility(value: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { value, configurable: true })
  document.dispatchEvent(new Event('visibilitychange'))
}
const http = (status: number, detail: string | null) => new HttpError('claimSeat', status, detail)

beforeEach(() => {
  vi.useFakeTimers()
  ops.listSeats.mockReset()
  ops.claimSeat.mockReset()
  ops.getProject.mockReset()
  ops.getProject.mockResolvedValue(project())
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
})
afterEach(() => {
  vi.useRealTimers()
})

/** 進房：project 與座位都回來。 */
async function enter(seats: SeatOut[] = [], props: { projectId?: string; me?: string; active?: boolean } = {}) {
  ops.listSeats.mockResolvedValueOnce(seats)
  const hook = renderHook((p: { projectId: string; me: string; active: boolean }) => useSeats(p), { initialProps: { projectId: ROOM, me: ME, active: true, ...props } })
  await flush()
  return hook
}
const ready = (hook: { result: { current: ReturnType<typeof useSeats> } }) => {
  const s = hook.result.current.state
  if (s.phase !== 'ready') throw new Error(`不是 ready：${s.phase}`)
  return s
}

describe('純函式', () => {
  it('[FE-J13-S03] classify409：兩種文字各自對，其他是 unknown', () => {
    expect(classify409('這個座位已經有人了')).toBe('seat-taken')
    expect(classify409('你已經在這個房間有座位了')).toBe('already-seated')
    expect(classify409('別的')).toBe('unknown')
    expect(classify409(null)).toBe('unknown')
  })
  it('[FE-J13-S02] canClaim：active、沒鎖、沒在送、自己沒座位才行', () => {
    const base = { status: 'active' as const, locked: false, claiming: null, seats: [seat(0, OTHER)], me: ME }
    expect(canClaim(base)).toBe(true)
    expect(canClaim({ ...base, status: 'closed' })).toBe(false)
    expect(canClaim({ ...base, status: 'recruiting' })).toBe(false)
    expect(canClaim({ ...base, locked: true })).toBe(false)
    expect(canClaim({ ...base, claiming: 2 })).toBe(false)
    expect(canClaim({ ...base, seats: [seat(0, OTHER), seat(3, ME)] })).toBe(false)
  })
})

describe('座位以重取為準；每 30 秒一次；不可見停；晚到作廢', () => {
  it('[FE-J13-S04] 進房 project＋seats 各一次；30 秒一次；不可見停、可見立即；輪詢失敗留舊的', async () => {
    const hook = await enter([seat(0, OTHER)])
    expect(ops.getProject).toHaveBeenCalledTimes(1)
    expect(ops.listSeats).toHaveBeenCalledTimes(1)
    expect(ready(hook).seats.map((s) => s.seat_index)).toEqual([0])
    expect(ready(hook).seatCount).toBe(4)
    expect(SEATS_POLL_MS).toBe(30_000)

    ops.listSeats.mockResolvedValueOnce([seat(0, OTHER), seat(1, OTHER)])
    await tick(30_000)
    expect(ops.listSeats).toHaveBeenCalledTimes(2)
    expect(ready(hook).seats).toHaveLength(2)
    ops.listSeats.mockRejectedValueOnce(http(500, null))
    await tick(30_000)
    expect(ops.listSeats).toHaveBeenCalledTimes(3)
    expect(ready(hook).seats, '輪詢失敗要留舊的').toHaveLength(2)

    act(() => setVisibility('hidden'))
    await tick(60_000)
    expect(ops.listSeats, '不可見時不該輪詢').toHaveBeenCalledTimes(3)
    ops.listSeats.mockResolvedValueOnce([seat(0, OTHER)])
    act(() => setVisibility('visible'))
    await flush()
    expect(ops.listSeats, '回到可見要立即重取').toHaveBeenCalledTimes(4)
    expect(ready(hook).seats).toHaveLength(1)
    // project 只在進房查一次
    expect(ops.getProject).toHaveBeenCalledTimes(1)
  })

  it('[FE-J13-S04] 離開房間停止且中止在飛的；換房間前一間的晚到不混；回 hall 不再送', async () => {
    const first = abortable<SeatOut[]>()
    ops.listSeats.mockImplementationOnce(first.fn)
    const hook = renderHook((p: { projectId: string; me: string; active: boolean }) => useSeats(p), { initialProps: { projectId: ROOM, me: ME, active: true } })
    await flush()
    expect(hook.result.current.state.phase).toBe('loading')
    // 換到另一間房：新的請求；前一間的此時才回
    ops.getProject.mockResolvedValueOnce({ ...project(), id: ROOM2, seat_count: 2 })
    ops.listSeats.mockResolvedValueOnce([])
    hook.rerender({ projectId: ROOM2, me: ME, active: true })
    await flush()
    expect(ready(hook).seatCount).toBe(2)
    expect(ready(hook).seats).toEqual([])
    first.resolve([seat(0, OTHER), seat(1, OTHER)])
    await flush()
    expect(ready(hook).seats, '前一間的回應混進來了').toEqual([])
    // 回 hall：停
    const calls = ops.listSeats.mock.calls.length
    hook.rerender({ projectId: ROOM2, me: ME, active: false })
    await tick(60_000)
    expect(ops.listSeats).toHaveBeenCalledTimes(calls)
    expect(hook.result.current.state.phase).toBe('loading')
  })
})

describe('一鍵入座與失敗回饋（狀態半邊）', () => {
  it('[FE-J13-S02] claim 送對 payload、送出中再按不送、201 之後重取一次、那一格是我的', async () => {
    const hook = await enter([])
    const pending = deferred<SeatOut>()
    ops.claimSeat.mockReturnValueOnce(pending.promise)
    act(() => hook.result.current.claim(1))
    act(() => hook.result.current.claim(2))
    expect(ops.claimSeat).toHaveBeenCalledTimes(1)
    expect(ops.claimSeat).toHaveBeenCalledWith(ROOM, { seat_index: 1, desk_template: 0 }, { signal: expect.any(AbortSignal) })
    expect(ready(hook).claiming).toBe(1)
    ops.listSeats.mockResolvedValueOnce([seat(1, ME)])
    await act(async () => pending.resolve(seat(1, ME)))
    await flush()
    expect(ops.listSeats, '201 之後重取一次').toHaveBeenCalledTimes(2)
    expect(ready(hook).claiming).toBeNull()
    expect(ready(hook).seats).toEqual([seat(1, ME)])
    expect(ready(hook).feedback).toBeNull()
    expect(canClaim({ ...ready(hook), me: ME }), '自己有座位了就不能再坐').toBe(false)
  })

  it('[FE-J13-S03] 409 被搶 → 重取＋seat-taken；409 已有座位 → 重取＋already-seated；403 → ticket 且鎖住；500 → failed 可再按', async () => {
    const hook = await enter([])
    ops.claimSeat.mockRejectedValueOnce(http(409, '這個座位已經有人了'))
    ops.listSeats.mockResolvedValueOnce([seat(1, OTHER)])
    await act(async () => hook.result.current.claim(1))
    await flush()
    expect(ready(hook).feedback?.kind).toBe('seat-taken')
    expect(ready(hook).seats).toEqual([seat(1, OTHER)])
    expect(canClaim({ ...ready(hook), me: ME })).toBe(true)

    ops.claimSeat.mockRejectedValueOnce(http(409, '你已經在這個房間有座位了'))
    ops.listSeats.mockResolvedValueOnce([seat(1, OTHER), seat(3, ME)])
    await act(async () => hook.result.current.claim(2))
    await flush()
    expect(ready(hook).feedback?.kind).toBe('already-seated')
    expect(ready(hook).seats.map((s) => s.seat_index)).toEqual([1, 3])
    expect(canClaim({ ...ready(hook), me: ME })).toBe(false)

    hook.unmount()
    ops.listSeats.mockClear()
    const again = await enter([])
    ops.claimSeat.mockRejectedValueOnce(http(403, '尚未通過房間密碼驗證'))
    await act(async () => again.result.current.claim(0))
    await flush()
    expect(ready(again).feedback?.kind).toBe('ticket')
    expect(ready(again).locked).toBe(true)
    expect(canClaim({ ...ready(again), me: ME })).toBe(false)
    expect(ops.listSeats, '票失效不重取').toHaveBeenCalledTimes(1)

    again.unmount()
    const third = await enter([])
    ops.claimSeat.mockRejectedValueOnce(http(500, null))
    await act(async () => third.result.current.claim(0))
    await flush()
    expect(ready(third).feedback?.kind).toBe('failed')
    expect(ready(third).locked).toBe(false)
    expect(canClaim({ ...ready(third), me: ME }), '服務失敗後要可再按').toBe(true)
    ops.claimSeat.mockResolvedValueOnce(seat(0, ME))
    ops.listSeats.mockResolvedValueOnce([seat(0, ME)])
    await act(async () => third.result.current.claim(0))
    await flush()
    expect(ready(third).seats).toEqual([seat(0, ME)])
    expect(ready(third).feedback).toBeNull()
  })
})

describe('影子審查（codex，2026-09-20）抓到的三個時序洞', () => {
  it('[FE-J13-S02] 201 之後、重取回來之前 claiming 還在（不然「入座」會閃回來、能再送一次）；已有座位的 409 同樣', async () => {
    const hook = await enter([])
    const pending = deferred<SeatOut>()
    const refetch = deferred<SeatOut[]>()
    ops.claimSeat.mockReturnValueOnce(pending.promise)
    ops.listSeats.mockReturnValueOnce(refetch.promise)
    act(() => hook.result.current.claim(1))
    await act(async () => pending.resolve(seat(1, ME)))
    await flush()
    expect(ops.listSeats, '201 之後有重取').toHaveBeenCalledTimes(2)
    expect(ready(hook).claiming, '重取回來之前不能放開 claiming').toBe(1)
    expect(canClaim({ ...ready(hook), me: ME })).toBe(false)
    act(() => hook.result.current.claim(2))
    expect(ops.claimSeat, '這個空窗按別格不能再送').toHaveBeenCalledTimes(1)
    await act(async () => refetch.resolve([seat(1, ME)]))
    await flush()
    expect(ready(hook).claiming).toBeNull()
    expect(ready(hook).seats).toEqual([seat(1, ME)])

    // 已有座位的 409：一樣等重取回來才放
    hook.unmount()
    ops.listSeats.mockClear()
    const again = await enter([])
    const refetch2 = deferred<SeatOut[]>()
    ops.claimSeat.mockRejectedValueOnce(http(409, '你已經在這個房間有座位了'))
    ops.listSeats.mockReturnValueOnce(refetch2.promise)
    await act(async () => again.result.current.claim(0))
    await flush()
    expect(ready(again).claiming, '409 重取回來之前 claiming 還在').toBe(0)
    await act(async () => refetch2.resolve([seat(3, ME)]))
    await flush()
    expect(ready(again).claiming).toBeNull()
    expect(ready(again).feedback?.kind).toBe('already-seated')
  })

  it('[FE-J13-S04] 離開房間要中止在飛的 POST（不只 GET）', async () => {
    const hook = await enter([])
    const pending = abortable<SeatOut>()
    ops.claimSeat.mockImplementationOnce((_id: string, _body: unknown, opts: { signal?: AbortSignal } = {}) => pending.fn(_id, opts))
    act(() => hook.result.current.claim(1))
    const signal = (ops.claimSeat.mock.calls[0]?.[2] as { signal?: AbortSignal } | undefined)?.signal
    expect(signal, 'claimSeat 沒帶房間的 signal').toBeInstanceOf(AbortSignal)
    hook.rerender({ projectId: ROOM, me: ME, active: false })
    expect(signal?.aborted).toBe(true)
  })

  it('[FE-J13-S04] 晚回來的舊輪詢不能蓋掉坐下之後的重取（請求有次序）', async () => {
    const hook = await enter([])
    // 一次輪詢壓住
    const stale = deferred<SeatOut[]>()
    ops.listSeats.mockReturnValueOnce(stale.promise)
    await tick(30_000)
    expect(ops.listSeats).toHaveBeenCalledTimes(2)
    // 坐下：201、重取回 [我的]
    ops.claimSeat.mockResolvedValueOnce(seat(1, ME))
    ops.listSeats.mockResolvedValueOnce([seat(1, ME)])
    await act(async () => hook.result.current.claim(1))
    await flush()
    expect(ready(hook).seats).toEqual([seat(1, ME)])
    // 舊輪詢此時才回、而且是坐下之前的快照
    await act(async () => stale.resolve([]))
    await flush()
    expect(ready(hook).seats, '舊輪詢蓋掉了新座位').toEqual([seat(1, ME)])
    expect(canClaim({ ...ready(hook), me: ME })).toBe(false)
  })
})
