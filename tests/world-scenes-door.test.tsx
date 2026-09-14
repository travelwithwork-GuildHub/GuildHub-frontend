import ReactThreeTestRenderer from '@react-three/test-renderer'
import { act, render, screen } from '@testing-library/react'
import { useEffect, type RefObject } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RoomDoorOut } from '@/api/contract/rest'
import type { Identity } from '@/identity/types'
import { ListPanelProvider } from '@/list-panel/ListPanelProvider'
import { FACING } from '@/world/coords'
import type { LocalPose } from '@/world/PositionSync'
import { InteractionProvider, useInteraction } from '@/world/interaction/InteractionProvider'
import { SpatialInteraction } from '@/world/interaction/SpatialInteraction'
import { doorTargetId } from '@/world/rooms/labels'
import { CORRIDOR_SLOTS } from '@/world/rooms/slots'
import { useLabelNodes } from '@/world/rooms/DoorLabels'
import { EntryGateProvider, useRequestEntry } from '@/world/scenes/EntryGate'
import { holdRoomToken } from '@/world/scenes/roomTokens'
import { SceneNotices, GATE_TEXT } from '@/world/scenes/SceneNotices'
import { SceneObjects } from '@/world/scenes/SceneObjects'
import { SceneProvider, useScene, type SceneValue } from '@/world/scenes/SceneProvider'

// 對著門按 E。規格 `FE-V01-S10`（有票就進）、`S11`（沒票交給門禁；預設門禁是一句說明）。
//
// 跟 `world-rooms-press-e.test.tsx` 同一套：`@react-three/test-renderer` 跑真的互動系統（`SpatialInteraction` 的
// 目標判定在 `useFrame` 裡）；門的動作經 `useRequestEntry()` → `SceneObjects` → `ProjectDoors` → `Interactable`，
// 全部是正式碼。不掛 `WorldUrlSync`／`RemoteWorld`：這裡驗的是「按 E 之後願望有沒有變」，網址與連線各有自己的判準。

const identity = vi.hoisted(() => ({ current: { state: 'unknown' } as Identity }))
vi.mock('@/identity/IdentityProvider', () => ({ useIdentity: () => identity.current, useAdoptIdentity: () => vi.fn() }))

const ROOM: RoomDoorOut = { project_id: 'a0000000-0000-4000-8000-00000000000a', title: '星際導航', online_count: 3 }
const PROFILE = { id: 'p0000000-0000-4000-8000-00000000000p', display_name: 'P', avatar_id: 0, skills: [], hours_per_week: null, bio: null, updated_at: '2026-09-14T00:00:00Z' }

function Spy({ seen, sink }: { seen: (id: string | null) => void; sink: (scene: SceneValue) => void }) {
  const { target } = useInteraction()
  const scene = useScene()
  useEffect(() => {
    seen(target?.id ?? null)
  }, [target, seen])
  useEffect(() => {
    sink(scene)
  })
  return null
}

/** `WorldCanvas` 的接法：`useRequestEntry()` 在 Canvas 外面拿到動作，當 prop 交給 Canvas 裡的 `SceneObjects`。 */
function Objects() {
  const requestEntry = useRequestEntry()
  const nodesRef = useLabelNodes()
  return (
    <SceneObjects scene={{ id: 'hall' }} doors={[ROOM]} slots={CORRIDOR_SLOTS} anchors={[]} nodesRef={nodesRef} requestEntry={requestEntry} />
  )
}

async function atTheDoor(gate?: (projectId: string, title: string) => void) {
  const slot = CORRIDOR_SLOTS[0]!
  const seen: Array<string | null> = []
  let latest: SceneValue | null = null
  const poseRef: RefObject<LocalPose> = { current: { x: slot.x + 0.6, z: slot.z, f: FACING.left } }
  const inner = (
    <InteractionProvider>
      <ListPanelProvider>
        <Spy seen={(id) => seen.push(id)} sink={(scene) => (latest = scene)} />
        <SpatialInteraction poseRef={poseRef} />
        <Objects />
      </ListPanelProvider>
    </InteractionProvider>
  )
  const renderer = await ReactThreeTestRenderer.create(
    <SceneProvider>{gate ? <EntryGateProvider needsToken={gate}>{inner}</EntryGateProvider> : inner}</SceneProvider>,
  )
  await ReactThreeTestRenderer.act(async () => {
    await renderer.advanceFrames(3, 1 / 60)
  })
  // GIVEN：提示正指著那扇門（真實路徑走到了，不是假設）
  expect(seen.at(-1)).toBe(doorTargetId(ROOM.project_id))
  const pressE = async (repeat = false) => {
    await ReactThreeTestRenderer.act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE', repeat }))
      await renderer.advanceFrames(1, 1 / 60)
    })
  }
  return { scene: () => latest!, pressE, renderer }
}

beforeEach(() => {
  window.sessionStorage.clear()
  identity.current = { state: 'signed-in', profile: PROFILE }
  window.history.replaceState(null, '', '/world')
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('對著門按 E', () => {
  it('[FE-V01-S10] 持有票：開始過場、帶著房間名；鍵盤重複不觸發第二次', async () => {
    holdRoomToken(PROFILE.id, ROOM.project_id, 'T')
    const { scene, pressE } = await atTheDoor()
    expect(scene().transition).toBeNull()
    await pressE()
    expect(scene().desiredRoom).toBe(ROOM.project_id)
    expect(scene().transition?.to).toEqual({ id: 'room', projectId: ROOM.project_id })
    expect(scene().destinationTitle).toBe('星際導航')
    const seq = scene().transitionSeq
    await pressE(true)
    await pressE(true)
    expect(scene().transitionSeq, '鍵盤重複的 keydown 不得再開始一次').toBe(seq)
  })

  it('[FE-V01-S11] 沒有票：預設門禁是一句說明；沒有願望、沒有過場', async () => {
    const { scene, pressE } = await atTheDoor()
    await pressE()
    expect(scene().desiredRoom).toBeNull()
    expect(scene().transition).toBeNull()
    expect(scene().gateNotice).toBe(ROOM.project_id)
  })

  it('[FE-V01-S11] 掛了門禁 provider：替身收到 project_id，預設說明不出現', async () => {
    const gate = vi.fn()
    const { scene, pressE } = await atTheDoor(gate)
    await pressE()
    expect(gate).toHaveBeenCalledWith(ROOM.project_id, '星際導航')
    expect(scene().gateNotice).toBeNull()
    expect(scene().transition).toBeNull()
  })
})

describe('預設門禁的說明（DOM）', () => {
  it('[FE-V01-S11] role=status、文字是規格那一句', () => {
    function Trigger() {
      const scene = useScene()
      return <button type="button" onClick={() => scene.showGateNotice(ROOM.project_id)}>trigger</button>
    }
    render(
      <SceneProvider>
        <Trigger />
        <SceneNotices />
      </SceneProvider>,
    )
    expect(screen.queryByRole('status')).toBeNull()
    act(() => screen.getByRole('button', { name: 'trigger' }).click())
    const status = screen.getByRole('status', { name: GATE_TEXT })
    expect(status.textContent).toContain('這間房需要房間密碼。輸入密碼的功能還沒開放。')
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
