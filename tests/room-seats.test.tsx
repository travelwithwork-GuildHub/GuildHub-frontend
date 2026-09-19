import { act, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProfileOut, ProjectOut, SeatOut } from '@/api/contract/rest'
import { HttpError } from '@/api/transport'
import { VOCABULARY } from '@/errors/uiError'
import type { Identity } from '@/identity/types'
import { SceneRefProvider } from '@/world/scenes/SceneContext'
import type { SceneRef } from '@/world/scenes/registry'
import { SEAT_FEEDBACK_MS } from '@/world/seats/SeatMarkers'
import WorldCanvas from '@/world/WorldCanvas'

// 座位標籤的**畫面半邊**。規格：openspec/changes/fe-j13-seats/specs/room-seats/spec.md
//   Requirement: 房間裡每個座位有一個標籤 —— S01（名字／自己的／空位／seat_count 以外沒有／載到之前沒有／404 →「有人」／回 hall 沒有）
//   Requirement: 一鍵入座 —— S02 的畫面半邊（按鈕 payload、停用、成功後沒有「入座」、closed 沒有）
//   Requirement: 失敗回饋可恢復 —— S03 的畫面半邊（四種回饋的 role 與文案；狀態半邊在 `room-seats-state.test.tsx`）
//
// 殼跟 `world-project-room-anchors.test.tsx` 同一組：`WorldCanvas` 在 jsdom 掛（`Canvas` stub），驗的是「標籤真的長在錨點裡、真的掛進世界」——
// 直接掛 `RoomSeats` 的話「回 hall 沒有」與「錨點的 aria-hidden 隨內容變」都驗不到。身分用 `useIdentity` 的替身（同 `world-scenes-door.test.tsx`）。

const ops = vi.hoisted(() => ({ listRooms: vi.fn(), listSeats: vi.fn(), claimSeat: vi.fn(), getProject: vi.fn(), getProfile: vi.fn() }))
vi.mock('@/api/operations', () => ops)
const identity = vi.hoisted(() => ({ current: { state: 'unknown' } as Identity }))
vi.mock('@/identity/IdentityProvider', () => ({ useIdentity: () => identity.current, useAdoptIdentity: () => vi.fn() }))
vi.mock('@react-three/fiber', async () => {
  const actual = await vi.importActual<typeof import('@react-three/fiber')>('@react-three/fiber')
  return {
    ...actual,
    Canvas: ({ children, onCreated }: { children?: ReactNode; onCreated?: () => void }) => {
      onCreated?.()
      return <div data-testid="r3f-canvas-stub">{children}</div>
    },
  }
})
vi.mock('@/world/player/LocalPlayer', () => ({ LocalPlayer: () => null }))
vi.mock('@/world/RemoteWorld', () => ({ RemoteWorld: () => null }))
vi.mock('@/world/environment/WorldShell', () => ({ WorldShell: () => null }))
vi.mock('@/world/WorldCamera', () => ({ WorldCamera: () => null }))
vi.mock('@/world/interaction/SpatialInteraction', () => ({ SpatialInteraction: () => null }))
vi.mock('@/world/scenes/SceneObjects', () => ({ SceneObjects: () => null }))

const ME = 'a0000000-0000-4000-8000-000000000001'
const JIA = 'a0000000-0000-4000-8000-000000000002'
const YI = 'a0000000-0000-4000-8000-000000000003'
const ROOM_ID = 'b0000000-0000-4000-8000-000000000001'
const ROOM: SceneRef = { id: 'room', projectId: ROOM_ID }
const HALL: SceneRef = { id: 'hall' }
const profile = (id: string, display_name: string): ProfileOut => ({ id, display_name, avatar_id: 0, skills: [], hours_per_week: null, bio: null, updated_at: '2026-09-01T00:00:00Z' })
const project = (status: ProjectOut['status'] = 'active', seat_count = 4): ProjectOut => ({ id: ROOM_ID, owner_id: JIA, title: '房', body: '', needed_skills: [], status, room_template: 0, seat_count, expires_at: '2027-01-01T00:00:00Z', updated_at: '2026-09-01T00:00:00Z' })
const seat = (seat_index: number, user_id: string): SeatOut => ({ seat_index, user_id, desk_template: 0, claimed_at: '2026-09-19T00:00:00Z' })
const http = (op: string, status: number, detail: string | null) => new HttpError(op, status, detail)

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
    for (let i = 0; i < 8; i += 1) await Promise.resolve()
  })
}
const tick = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms) })

const marker = (i: number) => document.querySelector<HTMLElement>(`[data-testid="seat-marker"][data-seat-index="${i}"]`)
const markers = () => screen.queryAllByTestId('seat-marker')
const anchor = (i: number) => document.querySelector<HTMLElement>(`[data-testid="seat-anchor"][data-seat-index="${i}"]`)!
// ⚠️ 不用 `getAllByRole`：錨點在被投影之前 `visibility: hidden`（這個殼沒有投影器），role 查詢會把裡面的按鈕全部當成不存在 —— 「沒有入座」會恆真
const claimButtons = () => [...document.querySelectorAll<HTMLButtonElement>('[data-testid="seat-marker"] button')].filter((b) => b.textContent === '入座')
const claimIn = (i: number) => {
  const m = marker(i)
  if (m === null) throw new Error(`座位 ${i} 沒有標籤`)
  const button = m.querySelector('button')
  if (button === null) throw new Error(`座位 ${i} 沒有「入座」`)
  return button
}
const feedback = () => screen.queryByTestId('seat-feedback')

const realGetContext = HTMLCanvasElement.prototype.getContext
beforeEach(() => {
  vi.useFakeTimers()
  for (const fn of Object.values(ops)) fn.mockReset()
  ops.listRooms.mockResolvedValue([])
  ops.getProject.mockResolvedValue(project())
  ops.getProfile.mockImplementation(async (id: string) => {
    if (id === JIA) return profile(JIA, '阿甲')
    if (id === YI) return profile(YI, '小乙')
    throw http('getProfile', 404, '找不到')
  })
  identity.current = { state: 'signed-in', profile: profile(ME, '我自己') }
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
  HTMLCanvasElement.prototype.getContext = vi.fn((id: string) => (id === 'webgl2' ? ({} as RenderingContext) : null)) as typeof realGetContext
})
afterEach(() => {
  HTMLCanvasElement.prototype.getContext = realGetContext
  vi.useRealTimers()
})

/** 掛世界（房間）。`seats` 沒給就讓座位一直在飛。 */
async function mount(seats?: SeatOut[]) {
  if (seats !== undefined) ops.listSeats.mockResolvedValueOnce(seats)
  const view = render(
    <SceneRefProvider scene={ROOM}>
      <WorldCanvas />
    </SceneRefProvider>,
  )
  await flush()
  return view
}

describe('每個座位一個標籤', () => {
  it('[FE-J13-S01] 四個座位兩個有人：阿甲、自己（標成自己的）、兩個空位、4～7 沒有；載到之前沒有；有內容的錨點不 aria-hidden、標籤在錨點裡；名字只查別人、各一次', async () => {
    const pending = deferred<SeatOut[]>()
    ops.listSeats.mockReturnValueOnce(pending.promise)
    await mount()
    expect(markers(), '座位回來之前不該有標籤（「空位」會是謊言）').toEqual([])
    expect(anchor(0).getAttribute('aria-hidden')).toBe('true')

    await act(async () => pending.resolve([seat(0, JIA), seat(2, ME)]))
    await flush()
    expect(marker(0)?.textContent).toContain('阿甲')
    expect(marker(0)?.dataset.mine).not.toBe('true')
    expect(marker(2)?.textContent).toContain('我自己')
    expect(marker(2)?.dataset.mine).toBe('true')
    expect(marker(1)?.textContent).toContain('空位')
    expect(marker(3)?.textContent).toContain('空位')
    for (const i of [4, 5, 6, 7]) expect(marker(i), `座位 ${i} 在 seat_count 以外，不該有標籤`).toBeNull()
    expect(markers()).toHaveLength(4)
    // 標籤住在錨點裡（design D1）：位置跟著錨點走、錨點 hidden 一起 hidden；有內容的錨點進無障礙樹、接指標事件，沒內容的照舊
    for (const i of [0, 1, 2, 3]) {
      expect(anchor(i).contains(marker(i)), `座位 ${i} 的標籤不在錨點裡`).toBe(true)
      expect(anchor(i).getAttribute('aria-hidden'), `有內容的錨點 ${i} 仍 aria-hidden`).not.toBe('true')
      expect(anchor(i).className).not.toMatch(/pointer-events-none/)
    }
    for (const i of [4, 5, 6, 7]) expect(anchor(i).getAttribute('aria-hidden')).toBe('true')
    expect(screen.getByTestId('seat-anchors').getAttribute('aria-hidden'), '容器 aria-hidden 會把裡面全部藏掉').not.toBe('true')
    // 名字：只查別人（自己的在身分裡），每個占用者一次
    expect(ops.getProfile).toHaveBeenCalledTimes(1)
    expect(ops.getProfile.mock.calls[0]?.[0]).toBe(JIA)
    // 標籤是 DOM、在 Canvas 外面
    expect(screen.getByTestId('r3f-canvas-stub').contains(marker(0))).toBe(false)
  })

  it('[FE-J13-S01] 名字查不到（404）→「有人」，不是空白、不是 id；回到 hall → 一個標籤都沒有、在飛的請求被中止', async () => {
    const view = await mount([seat(0, YI), seat(1, 'a0000000-0000-4000-8000-0000000000ff')])
    expect(marker(0)?.textContent).toContain('小乙')
    const unknown = marker(1)?.textContent ?? ''
    expect(unknown).toContain('有人')
    expect(unknown).not.toContain('0000000000ff')
    expect(unknown).not.toContain('空位')

    // 一個輪詢在飛時回大廳
    const inflight = deferred<SeatOut[]>()
    ops.listSeats.mockImplementationOnce((_id: string, { signal }: { signal?: AbortSignal } = {}) => {
      signal?.addEventListener('abort', () => inflight.reject(new DOMException('aborted', 'AbortError')))
      return inflight.promise
    })
    await tick(30_000)
    expect(ops.listSeats).toHaveBeenCalledTimes(2)
    const signal = (ops.listSeats.mock.calls[1]?.[1] as { signal?: AbortSignal } | undefined)?.signal
    expect(signal).toBeInstanceOf(AbortSignal)
    view.rerender(
      <SceneRefProvider scene={HALL}>
        <WorldCanvas />
      </SceneRefProvider>,
    )
    await flush()
    expect(markers()).toEqual([])
    expect(screen.queryAllByTestId('seat-anchor')).toEqual([])
    expect(signal?.aborted, '回 hall 沒有中止在飛的座位請求').toBe(true)
    await tick(60_000)
    expect(ops.listSeats, '大廳裡不該再輪詢座位').toHaveBeenCalledTimes(2)
  })

  it('[FE-J13-S01] 載入失敗：一則可辨識的回饋＋重試；重試成功後標籤出來', async () => {
    ops.getProject.mockRejectedValueOnce(http('getProject', 500, null))
    await mount([])
    expect(markers()).toEqual([])
    const fb = feedback()
    expect(fb?.getAttribute('role')).toBe('alert')
    expect(fb?.textContent).toContain(VOCABULARY['server-error'])
    ops.listSeats.mockResolvedValueOnce([seat(0, JIA)])
    fireEvent.click(screen.getByRole('button', { name: /重試/ }))
    await flush()
    expect(marker(0)?.textContent).toContain('阿甲')
    expect(feedback()).toBeNull()
  })
})

describe('一鍵入座（畫面半邊）', () => {
  it('[FE-J13-S02] 按兩次只送一個、payload 對、送出中四個都停用；201 後那格是我的、其他是空位但沒有「入座」；closed 沒有「入座」', async () => {
    await mount([])
    expect(claimButtons()).toHaveLength(4)
    const pending = deferred<SeatOut>()
    ops.claimSeat.mockReturnValueOnce(pending.promise)
    fireEvent.click(claimIn(1))
    fireEvent.click(claimIn(1))
    await flush()
    expect(ops.claimSeat).toHaveBeenCalledTimes(1)
    expect(ops.claimSeat).toHaveBeenCalledWith(ROOM_ID, { seat_index: 1, desk_template: 0 }, { signal: expect.any(AbortSignal) })
    const buttons = claimButtons()
    expect(buttons).toHaveLength(4)
    for (const b of buttons) expect((b as HTMLButtonElement).disabled, '送出中每個「入座」都要停用').toBe(true)
    expect(claimIn(1).getAttribute('aria-busy')).toBe('true')

    ops.listSeats.mockResolvedValueOnce([seat(1, ME)])
    await act(async () => pending.resolve(seat(1, ME)))
    await flush()
    expect(ops.listSeats, '201 之後重取一次').toHaveBeenCalledTimes(2)
    expect(marker(1)?.dataset.mine).toBe('true')
    expect(marker(1)?.textContent).toContain('我自己')
    for (const i of [0, 2, 3]) expect(marker(i)?.textContent).toContain('空位')
    expect(claimButtons(), '自己有座位了就不該再有「入座」').toEqual([])
  })

  it('[FE-J13-S02] closed 的房間：有人的照顯示名字，空位沒有「入座」', async () => {
    ops.getProject.mockResolvedValue(project('closed'))
    await mount([seat(0, JIA)])
    expect(marker(0)?.textContent).toContain('阿甲')
    expect(marker(1)?.textContent).toContain('空位')
    expect(claimButtons()).toEqual([])
  })
})

describe('失敗回饋（畫面半邊）', () => {
  it('[FE-J13-S03] 被搶：status、那格變成占用者、其他可按；已有座位：status、自己的標出、沒有「入座」；4 秒後回饋消失', async () => {
    await mount([])
    ops.claimSeat.mockRejectedValueOnce(http('claimSeat', 409, '這個座位已經有人了'))
    ops.listSeats.mockResolvedValueOnce([seat(1, YI)])
    fireEvent.click(claimIn(1))
    await flush()
    let fb = feedback()
    expect(fb?.getAttribute('role')).toBe('status')
    expect(fb?.dataset.kind).toBe('seat-taken')
    expect(fb?.textContent).not.toContain('這個座位已經有人了') // 不回顯後端字串
    expect(marker(1)?.textContent).toContain('小乙')
    const enabled = claimButtons()
    expect(enabled.map((b) => b.closest<HTMLElement>('[data-seat-index]')?.dataset.seatIndex)).toEqual(['0', '2', '3'])
    for (const b of enabled) expect((b as HTMLButtonElement).disabled).toBe(false)

    ops.claimSeat.mockRejectedValueOnce(http('claimSeat', 409, '你已經在這個房間有座位了'))
    ops.listSeats.mockResolvedValueOnce([seat(1, YI), seat(3, ME)])
    fireEvent.click(claimIn(2))
    await flush()
    fb = feedback()
    expect(fb?.getAttribute('role')).toBe('status')
    expect(fb?.dataset.kind).toBe('already-seated')
    expect(marker(3)?.dataset.mine).toBe('true')
    expect(claimButtons()).toEqual([])
    await tick(SEAT_FEEDBACK_MS + 50)
    expect(feedback(), '回饋要自動消失').toBeNull()
  })

  it('[FE-J13-S03] 票失效：alert、說要回大廳重新進房、不說密碼錯、全部「入座」停用（但還在）', async () => {
    await mount([])
    ops.claimSeat.mockRejectedValueOnce(http('claimSeat', 403, '尚未通過房間密碼驗證'))
    fireEvent.click(claimIn(0))
    await flush()
    const fb = feedback()
    expect(fb?.getAttribute('role')).toBe('alert')
    expect(fb?.dataset.kind).toBe('ticket')
    expect(fb?.textContent).toMatch(/回大廳/)
    expect(fb?.textContent).toMatch(/重新進房/)
    expect(fb?.textContent).not.toMatch(/密碼/)
    const buttons = claimButtons()
    expect(buttons).toHaveLength(4)
    for (const b of buttons) expect((b as HTMLButtonElement).disabled).toBe(true)
  })

  it('[FE-J13-S03] 伺服器壞了：alert、FE-X03 的語彙、那格可再按；再按回 201 正常坐下', async () => {
    await mount([])
    ops.claimSeat.mockRejectedValueOnce(http('claimSeat', 500, null))
    fireEvent.click(claimIn(0))
    await flush()
    const fb = feedback()
    expect(fb?.getAttribute('role')).toBe('alert')
    expect(fb?.dataset.kind).toBe('failed')
    expect(fb?.textContent).toContain(VOCABULARY['server-error'])
    expect((claimIn(0) as HTMLButtonElement).disabled).toBe(false)
    ops.claimSeat.mockResolvedValueOnce(seat(0, ME))
    ops.listSeats.mockResolvedValueOnce([seat(0, ME)])
    fireEvent.click(claimIn(0))
    await flush()
    expect(marker(0)?.dataset.mine).toBe('true')
    expect(claimButtons()).toEqual([])
    expect(feedback(), '成功後上一則回饋要換掉').toBeNull()
  })
})
