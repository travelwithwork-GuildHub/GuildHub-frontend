import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { useEffect, type ReactNode, type RefObject } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Identity } from '@/identity/types'
import { useRequestEntry } from '@/world/scenes/EntryGate'
import { RoomEntryGateProvider } from '@/world/scenes/RoomEntryGate'
import { ROOM_ENTRY_LABELS } from '@/world/scenes/RoomPasswordDialog'
import { DROP_FAILED_TEXT, REENTER_LABEL, SceneNotices } from '@/world/scenes/SceneNotices'
import { SceneProvider, useScene, type SceneValue } from '@/world/scenes/SceneProvider'
import { holdRoomToken } from '@/world/scenes/roomTokens'
import WorldCanvas from '@/world/WorldCanvas'

// 規格：openspec/changes/fe-n08-room-entry-gate/specs/room-entry-gate/spec.md
//   Requirement: 握手失敗後，使用者可以選擇重新輸入密碼；系統仍不丟票 —— S11
//
// 整條鏈是正式碼（同 `world-scenes-transition-ui.test.tsx`）：`SceneProvider` → `WorldCanvas` → `RemoteWorld` → `new WebSocket(url)`；
// 通知在 Canvas 外（`page.tsx` 的形狀）、視窗在 `WorldCanvas` 裡；`RoomEntryGateProvider` 包住兩者。換掉的只有第三方邊界與 `LocalPlayer`。

const identity = vi.hoisted(() => ({ current: { state: 'unknown' } as Identity }))
vi.mock('@/identity/IdentityProvider', () => ({ useIdentity: () => identity.current, useAdoptIdentity: () => vi.fn() }))
vi.mock('@react-three/fiber', () => ({
  useThree: (selector?: (s: unknown) => unknown) => {
    const state = { set: () => {}, size: { width: 800, height: 600 } }
    return selector ? selector(state) : state
  },
  useFrame: () => {},
  Canvas: ({ children, onCreated }: { children?: ReactNode; onCreated?: () => void }) => {
    onCreated?.()
    return <canvas data-testid="r3f-canvas-stub">{children}</canvas>
  },
}))
vi.mock('@/world/player/LocalPlayer', () => ({ LocalPlayer: () => null }))
vi.mock('@/world/RemotePlayers', () => ({ RemotePlayers: () => null }))
vi.mock('@/world/PositionSync', () => ({ PositionSync: () => null }))
const listRooms = vi.hoisted(() => vi.fn())
const enterProject = vi.hoisted(() => vi.fn())
vi.mock('@/api/operations', () => ({
  listRooms,
  enterProject,
  listProfiles: vi.fn(async () => []),
  listProjects: vi.fn(async () => []),
  getProfile: vi.fn(async () => null),
}))

type Listener = (e: unknown) => void
class FakeSocket {
  static instances: FakeSocket[] = []
  readonly listeners = new Map<string, Set<Listener>>()
  closeCalls = 0
  constructor(readonly url: string) {
    FakeSocket.instances.push(this)
  }
  get token() {
    return new URL(this.url).searchParams.get('token')
  }
  addEventListener(type: string, l: Listener) {
    this.listeners.set(type, (this.listeners.get(type) ?? new Set()).add(l))
  }
  removeEventListener(type: string, l: Listener) {
    this.listeners.get(type)?.delete(l)
  }
  send() {}
  close() {
    this.closeCalls += 1
  }
  emit(type: string, payload: unknown) {
    for (const l of [...(this.listeners.get(type) ?? [])]) l(payload)
  }
  closeEvent(code: number) {
    this.emit('close', { code, reason: '', wasClean: code === 1000 })
  }
  ready() {
    this.emit('open', null)
    this.emit('message', { data: JSON.stringify({ t: 'hello', you: 'u-self', hz: 10 }) })
    this.emit('message', { data: JSON.stringify({ t: 'snapshot', players: [] }) })
  }
}

const ROOM = 'a0000000-0000-4000-8000-00000000000a'
const TITLE = '星際導航'
const PROFILE = { id: 'p0000000-0000-4000-8000-00000000000p', display_name: 'P', avatar_id: 0, skills: [], hours_per_week: null, bio: null, updated_at: '2026-09-14T00:00:00Z' }
const KEY = `guildhub.roomToken.${PROFILE.id}.${ROOM}`

type Probe = { scene: SceneValue; requestEntry: (projectId: string, title: string) => void }
function ProbeSink({ sinkRef }: { sinkRef: RefObject<Probe | null> }) {
  const scene = useScene()
  const requestEntry = useRequestEntry()
  useEffect(() => {
    sinkRef.current = { scene, requestEntry }
  })
  return null
}

const realGetContext = HTMLCanvasElement.prototype.getContext
beforeEach(() => {
  FakeSocket.instances = []
  vi.useFakeTimers()
  vi.stubGlobal('WebSocket', FakeSocket)
  vi.stubEnv('NEXT_PUBLIC_REALTIME_ADAPTER', 'guildhub')
  HTMLCanvasElement.prototype.getContext = vi.fn((id: string) => (id === 'webgl2' ? ({} as RenderingContext) : null)) as typeof realGetContext
  window.sessionStorage.clear()
  identity.current = { state: 'signed-in', profile: PROFILE }
  listRooms.mockReset()
  listRooms.mockResolvedValue([{ project_id: ROOM, title: TITLE, online_count: 1 }])
  enterProject.mockReset()
})
afterEach(() => {
  cleanup()
  HTMLCanvasElement.prototype.getContext = realGetContext
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.useRealTimers()
  window.history.replaceState(null, '', '/')
})

const flush = () =>
  act(async () => {
    for (let i = 0; i < 4; i += 1) await Promise.resolve()
  })
function arriveAt(url: string) {
  window.history.replaceState(window.history.state, '', url)
  const sinkRef: RefObject<Probe | null> = { current: null }
  render(
    <SceneProvider>
      <RoomEntryGateProvider>
        <ProbeSink sinkRef={sinkRef} />
        <SceneNotices />
        <WorldCanvas />
      </RoomEntryGateProvider>
    </SceneProvider>,
  )
  return { probe: () => sinkRef.current!, last: () => FakeSocket.instances.at(-1)! }
}
const alert = () => screen.queryByRole('alert')
const reenterButton = () => within(screen.getByRole('alert')).getByRole('button', { name: REENTER_LABEL })
const dialogs = () => screen.queryAllByRole('dialog')
const field = () => screen.getByLabelText(ROOM_ENTRY_LABELS.password) as HTMLInputElement

/** 站在大廳、持有票；對 R 的門按 E → 新 socket 在 open 前就關（1006）→ 回大廳、通知。 */
async function refusedOnce(w: ReturnType<typeof arriveAt>, pressE = () => w.probe().requestEntry(ROOM, TITLE)) {
  const old = w.last()
  act(pressE)
  await flush()
  await act(async () => old.closeEvent(1000))
  await flush()
  const fresh = w.last()
  await act(async () => fresh.closeEvent(1006))
  await flush()
  expect(w.probe().scene.scene).toEqual({ id: 'hall' })
  return fresh
}
async function inHall() {
  holdRoomToken(PROFILE.id, ROOM, 'T')
  const w = arriveAt('/world')
  await flush()
  await act(async () => w.last().ready())
  await flush()
  return w
}

describe('被拒之後', () => {
  it('[FE-N08-S11] 票還在、通知有「重新輸入密碼」；不按就同票再試；按了才丟票、關通知、開含房名的空視窗；之前沒有 /enter', async () => {
    const w = await inHall()
    const first = await refusedOnce(w)
    expect(first.token).toBe('T')
    expect(alert()).not.toBeNull()
    expect(window.sessionStorage.getItem(KEY), '系統不丟票').toBe('T')
    expect(reenterButton()).toBeTruthy()
    expect(dialogs()).toHaveLength(0)
    // 不按：再按 E 用同一張票。
    const second = await refusedOnce(w)
    expect(second.token, '沒按就用舊票再試').toBe('T')
    expect(window.sessionStorage.getItem(KEY)).toBe('T')
    expect(enterProject, '啟動之前不得呼叫 /enter').not.toHaveBeenCalled()
    expect(screen.getAllByRole('alert')).toHaveLength(1)
    act(() => reenterButton().click())
    expect(window.sessionStorage.getItem(KEY), '按了才丟').toBeNull()
    expect(alert(), '通知關閉').toBeNull()
    expect(dialogs()).toHaveLength(1)
    expect(screen.getByRole('dialog', { name: new RegExp(TITLE) })).toBeTruthy()
    expect(field().value).toBe('')
    expect(enterProject).not.toHaveBeenCalled()
  })

  it.each<[string, () => void, string | null]>([
    ['removeItem 拋', () => void vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('SecurityError') }), 'T'],
    ['removeItem 靜默沒刪', () => void vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {}), 'T'],
    ['刪完 getItem 拋', () => void vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('SecurityError') }), null],
  ])('[FE-N08-S11] %s：不開視窗、通知還在、多一句受控說明', async (_name, sabotage, keyAfter) => {
    const w = await inHall()
    await refusedOnce(w)
    sabotage()
    act(() => reenterButton().click())
    expect(dialogs()).toHaveLength(0)
    expect(alert()).not.toBeNull()
    expect(alert()?.textContent).toContain(DROP_FAILED_TEXT)
    vi.restoreAllMocks()
    if (keyAfter !== null) expect(window.sessionStorage.getItem(KEY), '鍵仍是 T').toBe(keyAfter)
    expect(enterProject).not.toHaveBeenCalled()
  })

  it('[FE-N08-S11] 深連結失敗、清單還沒回來：視窗沒房名但可辨識；清單回來後同一個節點的名稱更新、欄位不變', async () => {
    let giveRooms: (rooms: unknown) => void = () => {}
    listRooms.mockImplementation(() => new Promise((resolve) => (giveRooms = resolve)))
    holdRoomToken(PROFILE.id, ROOM, 'T')
    const w = arriveAt(`/world?room=${ROOM}`)
    await flush()
    const fresh = w.last()
    expect(fresh.token).toBe('T')
    await act(async () => fresh.closeEvent(1006))
    await flush()
    await act(async () => w.last().ready())
    await flush()
    expect(alert()).not.toBeNull()
    act(() => reenterButton().click())
    expect(dialogs()).toHaveLength(1)
    const dialog = screen.getByRole('dialog')
    expect(dialog.getAttribute('aria-labelledby')).toBeTruthy()
    expect(screen.getByRole('dialog', { name: ROOM_ENTRY_LABELS.title(null) })).toBe(dialog)
    expect(dialog.textContent).not.toContain(TITLE)
    fireEvent.change(field(), { target: { value: 'abc' } })
    await act(async () => giveRooms([{ project_id: ROOM, title: TITLE, online_count: 1 }]))
    await flush()
    expect(screen.getByRole('dialog')).toBe(dialog)
    expect(screen.getByRole('dialog', { name: new RegExp(TITLE) })).toBe(dialog)
    expect(field().value).toBe('abc')
  })
})
