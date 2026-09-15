import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useEffect, type ReactNode, type RefObject } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Identity } from '@/identity/types'
import { InteractionProvider, useInteraction } from '@/world/interaction/InteractionProvider'
import { escapeLayerCount } from '@/world/interaction/escapeLayers'
import { useRequestEntry } from '@/world/scenes/EntryGate'
import { RoomEntryGateProvider } from '@/world/scenes/RoomEntryGate'
import { ROOM_ENTRY_LABELS, RoomPasswordDialog } from '@/world/scenes/RoomPasswordDialog'
import { SceneNotices } from '@/world/scenes/SceneNotices'
import { SceneProvider } from '@/world/scenes/SceneProvider'
import WorldCanvas from '@/world/WorldCanvas'

// 規格：openspec/changes/fe-n08-room-entry-gate/specs/room-entry-gate/spec.md
//   Requirement: 沒有票時，門前按 E 開的是這間房的 DOM 密碼視窗 —— S01
//   Requirement: 視窗開著就鎖住世界命令；Esc、關閉、Tab 照全站鍵盤規則 —— S02、S03
//
// 「對著門按 E」到 `useRequestEntry()` 那一段是 `FE-V01-S10`／`S11` 的（`world-scenes-door.test.tsx`，真的互動系統）；
// 這裡從 `useRequestEntry()` 開始：正式的 provider（`RoomEntryGateProvider`）掛上去，視窗渲染在 `WorldCanvas` 的位置
// （`InteractionProvider` 底下、`data-focus-anchor` 那個 div 裡）。**沒有票**（`sessionStorage` 空）。
// 送出的行為（`S04`～`S10`）在 `room-entry-submit.test.tsx`；這裡不送出。

const identity = vi.hoisted(() => ({ current: { state: 'unknown' } as Identity }))
vi.mock('@/identity/IdentityProvider', () => ({ useIdentity: () => identity.current, useAdoptIdentity: () => vi.fn() }))
const enterProject = vi.hoisted(() => vi.fn())
vi.mock('@/api/operations', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/api/operations')>()), enterProject }))
// `enterRoom` 包一層記錄呼叫、底下仍是正式碼：S01 的「沒有新 socket」在這一層就是「沒有人請求進房」。
const enterRoom = vi.hoisted(() => vi.fn())
vi.mock('@/world/scenes/SceneProvider', async (importOriginal) => {
  const orig = await importOriginal<typeof import('@/world/scenes/SceneProvider')>()
  const useScene = () => {
    const scene = orig.useScene()
    return { ...scene, enterRoom: (...a: Parameters<typeof scene.enterRoom>) => (enterRoom(...a), scene.enterRoom(...a)) }
  }
  return { ...orig, useScene }
})
// 正式 `WorldCanvas` 的接線那一條要掛真的 `WorldCanvas`：jsdom 沒有 WebGL，`Canvas` 與 `LocalPlayer` 是第三方／場景圖的邊界（同 `world-canvas.test.tsx`）。
vi.mock('@react-three/fiber', () => ({
  useThree: (selector?: (s: unknown) => unknown) => {
    const state = { set: () => {}, size: { width: 800, height: 600 } }
    return selector ? selector(state) : state
  },
  useFrame: () => {},
  Canvas: ({ children, onCreated }: { children?: ReactNode; onCreated?: () => void }) => {
    onCreated?.()
    return <div data-testid="r3f-canvas-stub">{children}</div>
  },
}))
vi.mock('@/world/player/LocalPlayer', () => ({ LocalPlayer: () => null }))

const ROOM = { projectId: 'a0000000-0000-4000-8000-00000000000a', title: '晨光工作室' }
const OTHER = { projectId: 'b0000000-0000-4000-8000-00000000000b', title: '噪音地圖小隊' }
const PROFILE = { id: 'p0000000-0000-4000-8000-00000000000p', display_name: 'P', avatar_id: 0, skills: [], hours_per_week: null, bio: null, updated_at: '2026-09-14T00:00:00Z' }

type Grabbed = { lock: RefObject<boolean>; hold: (reason: string) => () => void; requestEntry: (projectId: string, title: string) => void }
function Grab({ sinkRef }: { sinkRef: RefObject<Grabbed | null> }) {
  const { inputLockRef, holdInputLock } = useInteraction()
  const requestEntry = useRequestEntry()
  useEffect(() => {
    sinkRef.current = { lock: inputLockRef, hold: holdInputLock, requestEntry }
  }, [sinkRef, inputLockRef, holdInputLock, requestEntry])
  return null
}

/** `page.tsx` ＋ `WorldCanvas` 的接法：provider 在 `SceneProvider` 底下、`InteractionProvider` 外面；視窗在錨那個 div 裡。 */
function mountWorld() {
  const sinkRef: RefObject<Grabbed | null> = { current: null }
  render(
    <SceneProvider>
      <RoomEntryGateProvider>
        <SceneNotices />
        <InteractionProvider>
          <Grab sinkRef={sinkRef} />
          <div data-testid="world-canvas-container" data-focus-anchor="world" tabIndex={-1}>
            <RoomPasswordDialog />
          </div>
        </InteractionProvider>
      </RoomEntryGateProvider>
    </SceneProvider>,
  )
  const world = () => {
    if (sinkRef.current === null) throw new Error('provider 還沒掛好')
    return sinkRef.current
  }
  const pressE = (room = ROOM) =>
    act(() => {
      world().requestEntry(room.projectId, room.title)
    })
  return { world, pressE }
}
const dialogs = () => screen.queryAllByRole('dialog')
const dialog = () => screen.getByRole('dialog')
const passwordField = () => screen.getByLabelText(ROOM_ENTRY_LABELS.password) as HTMLInputElement
const escape = () =>
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' }))
  })
const anchor = () => screen.getByTestId('world-canvas-container')

beforeEach(() => {
  window.sessionStorage.clear()
  identity.current = { state: 'signed-in', profile: PROFILE }
  window.history.replaceState(null, '', '/world')
})
afterEach(() => {
  cleanup()
  expect(escapeLayerCount(), 'Escape 層沒清乾淨').toBe(0)
  enterProject.mockReset()
  enterRoom.mockReset()
})

describe('對著門按 E（沒有票）', () => {
  it('[FE-N08-S01] 恰好一個 dialog、aria-modal、可及名稱含房名；沒有請求、網址不變；預設說明不出現', () => {
    const { pressE } = mountWorld()
    expect(dialogs()).toHaveLength(0)
    pressE()
    expect(dialogs()).toHaveLength(1)
    expect(dialog().getAttribute('aria-modal')).toBe('true')
    expect(screen.getByRole('dialog', { name: /晨光工作室/ })).toBe(dialog())
    expect(enterProject).not.toHaveBeenCalled()
    expect(enterRoom, '沒有票不能請求進房（沒有新 socket）').not.toHaveBeenCalled()
    expect(window.location.pathname + window.location.search).toBe('/world')
    expect(screen.queryByRole('status'), '正式門禁掛上之後，預設那句說明不得出現').toBeNull()
    expect(screen.queryByText(/還沒開放/)).toBeNull()
    expect(passwordField().type).toBe('password')
  })

  it('[FE-N08-S01] 正式 WorldCanvas 的接線：視窗渲染在世界焦點錨那個容器裡、不在 r3f Canvas 裡', () => {
    HTMLCanvasElement.prototype.getContext = vi.fn((id: string) => (id === 'webgl2' ? ({} as RenderingContext) : null)) as typeof HTMLCanvasElement.prototype.getContext
    const sinkRef: RefObject<((projectId: string, title: string) => void) | null> = { current: null }
    const GrabEntry = () => {
      const requestEntry = useRequestEntry()
      useEffect(() => {
        sinkRef.current = requestEntry
      }, [requestEntry])
      return null
    }
    render(
      <SceneProvider>
        <RoomEntryGateProvider>
          <GrabEntry />
          <WorldCanvas />
        </RoomEntryGateProvider>
      </SceneProvider>,
    )
    const container = screen.getByTestId('world-canvas-container')
    expect(container.getAttribute('data-focus-anchor')).toBe('world')
    act(() => {
      sinkRef.current?.(ROOM.projectId, ROOM.title)
    })
    expect(dialogs()).toHaveLength(1)
    expect(container.contains(dialog()), '視窗要在 WorldCanvas 的焦點錨容器裡（鎖與錨在那邊）').toBe(true)
    expect(screen.getByTestId('r3f-canvas-stub').contains(passwordField()), '密碼欄不能在 Canvas 裡').toBe(false)
    expect(document.activeElement).toBe(passwordField())
    escape()
    expect(dialogs()).toHaveLength(0)
    expect(document.activeElement).toBe(container)
  })

  it('[FE-N08-S01] 視窗開著、欄位已輸入「ab」，再收到一次 needsToken（同一扇門）：仍是一個視窗、欄位仍是 ab', () => {
    const { pressE } = mountWorld()
    pressE()
    const fieldBefore = passwordField()
    fireEvent.change(fieldBefore, { target: { value: 'ab' } })
    expect(fieldBefore.value).toBe('ab')
    pressE()
    pressE()
    expect(dialogs()).toHaveLength(1)
    expect(passwordField()).toBe(fieldBefore)
    expect(passwordField().value, '第二次 needsToken 重建了視窗或重置了表單').toBe('ab')
    expect(enterProject).not.toHaveBeenCalled()
  })
})

describe('Esc、焦點、世界命令鎖', () => {
  it('[FE-N08-S02] 焦點一開始在密碼欄；Esc 關視窗、清密碼、焦點回世界錨（不是 body）；再按 E 是空白的', () => {
    const { pressE } = mountWorld()
    pressE()
    expect(document.activeElement, '焦點要一開始就在密碼欄').toBe(passwordField())
    fireEvent.change(passwordField(), { target: { value: 'secret' } })
    escape()
    expect(dialogs()).toHaveLength(0)
    expect(document.activeElement).toBe(anchor())
    expect(document.activeElement).not.toBe(document.body)
    expect(window.location.pathname + window.location.search, '同一次 Esc 不得導覽').toBe('/world')
    expect(enterProject).not.toHaveBeenCalled()
    pressE()
    expect(dialogs()).toHaveLength(1)
    expect(passwordField().value, '關閉沒有清掉上次的密碼').toBe('')
    expect(document.activeElement).toBe(passwordField())
  })

  it('[FE-N08-S02] 關閉控制跟 Esc 一樣：關視窗、焦點回錨', () => {
    const { pressE } = mountWorld()
    pressE()
    fireEvent.click(screen.getByRole('button', { name: ROOM_ENTRY_LABELS.cancel }))
    expect(dialogs()).toHaveLength(0)
    expect(document.activeElement).toBe(anchor())
  })

  it('[FE-N08-S03] 視窗開著就持鎖（焦點在送出鈕上也是）；Tab 在視窗內循環；關閉只放自己的鎖', () => {
    const { world, pressE } = mountWorld()
    expect(world().lock.current).toBe(false)
    pressE()
    expect(world().lock.current, '視窗開著世界命令要鎖').toBe(true)
    const submit = screen.getByRole('button', { name: ROOM_ENTRY_LABELS.submit })
    act(() => submit.focus())
    expect(document.activeElement).toBe(submit)
    expect(world().lock.current, '焦點在按鈕上（不是輸入框）也要鎖 —— 只靠輸入框焦點的鎖在這裡會放開').toBe(true)
    // 「鎖著按 W 人不動、放開會動」是 e2e 的（tasks 6）：這裡的樹沒有世界的按鍵消費者，打 W 什麼都不會發生，斷言了也是恆真。
    // Tab：最後一個可聚焦控制 → 第一個；Shift+Tab：第一個 → 最後一個。
    const cancel = screen.getByRole('button', { name: ROOM_ENTRY_LABELS.cancel })
    const controls = [passwordField(), submit, cancel]
    const last = controls[controls.length - 1] as HTMLElement
    act(() => last.focus())
    fireEvent.keyDown(last, { key: 'Tab' })
    expect(document.activeElement, 'Tab 從最後一個要回到第一個').toBe(passwordField())
    fireEvent.keyDown(passwordField(), { key: 'Tab', shiftKey: true })
    expect(document.activeElement, 'Shift+Tab 從第一個要到最後一個').toBe(last)
    // 另一個持有者在：關掉視窗，鎖仍在；那個持有者放掉，鎖才開。
    const release = world().hold('another-panel')
    fireEvent.click(cancel)
    expect(dialogs()).toHaveLength(0)
    expect(world().lock.current, '另一個持有者還在，鎖不能開').toBe(true)
    act(() => release())
    expect(world().lock.current, '視窗把自己的鎖漏在那裡了').toBe(false)
  })

  it('[FE-N08-S03] 換另一扇門：同一個視窗換成那間房、欄位重來；再回第一扇門也是空的', () => {
    const { pressE } = mountWorld()
    pressE()
    fireEvent.change(passwordField(), { target: { value: 'ab' } })
    pressE(OTHER)
    expect(dialogs()).toHaveLength(1)
    expect(screen.getByRole('dialog', { name: /噪音地圖小隊/ })).toBeTruthy()
    expect(passwordField().value, '換了房間，上一間的密碼不能留在欄位裡').toBe('')
    expect(document.activeElement).toBe(passwordField())
  })
})
