import ReactThreeTestRenderer from '@react-three/test-renderer'
import { act, render, screen } from '@testing-library/react'
import { useEffect, type ReactNode, type RefObject } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RoomDoorOut } from '@/api/contract/rest'
import { ListPanelProvider } from '@/list-panel/ListPanelProvider'
import { InteractionProvider, useInteraction } from '@/world/interaction/InteractionProvider'
import type { InteractableRegistry } from '@/world/interaction/registry'
import { useLabelNodes } from '@/world/rooms/DoorLabels'
import { CORRIDOR_SLOTS } from '@/world/rooms/slots'
import { POLL_INTERVAL_MS } from '@/world/rooms/useRooms'
import { SceneObjects } from '@/world/scenes/SceneObjects'
import { SceneRefProvider } from '@/world/scenes/SceneContext'
import type { SceneRef } from '@/world/scenes/registry'
import WorldCanvas from '@/world/WorldCanvas'

// 只屬於 Guild Hall 的東西在房間裡**不存在**。規格 `FE-V01-S03`。
//
// 兩個殼：`SceneObjects`（Canvas 裡面那一半：門、看板的**註冊**）用 `@react-three/test-renderer` 跑真的互動系統；
// `WorldCanvas`（外面那一半：門標籤的 DOM、`GET /api/rooms` 的輪詢）用 jsdom ＋ 被 mock 的 `Canvas`
// —— 跟 `world-canvas.test.tsx` 同一組第三方邊界的替身。

const listRooms = vi.hoisted(() => vi.fn())
vi.mock('@/api/operations', () => ({ listRooms }))
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
vi.mock('@/world/RemoteWorld', () => ({ RemoteWorld: () => null }))

const uuid = (letter: string) => `${letter}0000000-0000-4000-8000-00000000000${letter}`
const ROOMS: RoomDoorOut[] = [
  { project_id: uuid('a'), title: '星際導航', online_count: 3 },
  { project_id: uuid('b'), title: '深海測繪', online_count: 0 },
]
const HALL: SceneRef = { id: 'hall' }
const ROOM: SceneRef = { id: 'room', projectId: uuid('a') }

function Probe({ sinkRef }: { sinkRef: RefObject<InteractableRegistry | null> }) {
  const { registry } = useInteraction()
  useEffect(() => {
    sinkRef.current = registry
  }, [registry, sinkRef])
  return null
}

function Objects({ scene }: { scene: SceneRef }) {
  const nodesRef = useLabelNodes()
  return (
    <SceneObjects scene={scene} doors={ROOMS} slots={CORRIDOR_SLOTS} anchors={[]} nodesRef={nodesRef} />
  )
}

async function registrations(scene: SceneRef): Promise<string[]> {
  const sinkRef: RefObject<InteractableRegistry | null> = { current: null }
  const renderer = await ReactThreeTestRenderer.create(
    <InteractionProvider>
      <ListPanelProvider>
        <Probe sinkRef={sinkRef} />
        <Objects scene={scene} />
      </ListPanelProvider>
    </InteractionProvider>,
  )
  const ids = [...(sinkRef.current?.entries.keys() ?? [])]
  await renderer.unmount()
  return ids
}

describe('Canvas 裡面：門與看板的註冊', () => {
  it('[FE-V01-S03] 房間裡沒有任何門或看板的註冊；大廳裡兩種都有', async () => {
    const inRoom = await registrations(ROOM)
    expect(inRoom.filter((id) => id.startsWith('door:'))).toEqual([])
    expect(inRoom.filter((id) => id.startsWith('board-'))).toEqual([])

    const inHall = await registrations(HALL)
    expect(inHall.filter((id) => id.startsWith('door:')).length).toBe(ROOMS.length)
    expect(inHall.filter((id) => id.startsWith('board-')).length).toBe(2)
  })
})

describe('Canvas 外面：門標籤與輪詢', () => {
  const realGetContext = HTMLCanvasElement.prototype.getContext
  beforeEach(() => {
    vi.useFakeTimers()
    listRooms.mockReset()
    listRooms.mockResolvedValue(ROOMS)
    HTMLCanvasElement.prototype.getContext = vi.fn((id: string) =>
      id === 'webgl2' ? ({} as RenderingContext) : null,
    ) as typeof realGetContext
  })
  afterEach(() => {
    HTMLCanvasElement.prototype.getContext = realGetContext
    vi.useRealTimers()
  })

  async function mountWorld(scene: SceneRef) {
    const view = render(
      <SceneRefProvider scene={scene}>
        <WorldCanvas />
      </SceneRefProvider>,
    )
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 2 + 100)
    })
    return view
  }

  it('[FE-V01-S03] 房間裡：兩個輪詢週期內沒有打 GET /api/rooms，門標籤的 DOM 不存在', async () => {
    const view = await mountWorld(ROOM)
    expect(listRooms).not.toHaveBeenCalled()
    expect(screen.queryByTestId('door-labels')).toBeNull()
    expect(screen.queryByTestId('rooms-notice')).toBeNull()
    view.unmount()
  })

  it('[FE-V01-S03] 大廳裡：有輪詢、有門標籤（這條防「兩邊都拿掉」也綠）', async () => {
    const view = await mountWorld(HALL)
    expect(listRooms.mock.calls.length).toBeGreaterThanOrEqual(3)
    expect(screen.getByTestId('door-labels')).toBeTruthy()
    expect(screen.getByTestId('rooms-notice')).toBeTruthy()
    view.unmount()
  })
})
