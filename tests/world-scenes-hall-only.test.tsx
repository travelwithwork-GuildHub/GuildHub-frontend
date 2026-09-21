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
import { useSeatAnchorNodes } from '@/world/seats/SeatAnchors'
import { POLL_INTERVAL_MS } from '@/world/rooms/useRooms'
import { SceneObjects } from '@/world/scenes/SceneObjects'
import { SceneRefProvider } from '@/world/scenes/SceneContext'
import { sceneOf, type SceneRef } from '@/world/scenes/registry'
import WorldCanvas from '@/world/WorldCanvas'

// 只屬於 Guild Hall 的東西在房間裡**不存在**。規格 `FE-V01-S03`。
//
// 兩個殼：`SceneObjects`（Canvas 裡面那一半：門、看板的**註冊**）用 `@react-three/test-renderer` 跑真的互動系統；
// `WorldCanvas`（外面那一半：門標籤的 DOM、`GET /api/rooms` 的輪詢）用 jsdom ＋ 被 mock 的 `Canvas`
// —— 跟 `world-canvas.test.tsx` 同一組第三方邊界的替身。

const listRooms = vi.hoisted(() => vi.fn())
vi.mock('@/api/operations', () => ({ listRooms, listProjects: () => Promise.resolve([]), listProfiles: () => Promise.resolve([]) }))
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
// 這兩個在 jsdom 裡掛不起來（three 的場景圖、真的 socket），換成**會記錄自己怎麼被掛的**殼：
// 每次掛載拿一個新的序號（`useState` 的 lazy initializer 只在掛載時跑一次），
// 所以「換場景有沒有重掛」看序號有沒有變；`spawn`／`scene` 看最後一次收到的 prop。
const mounts = vi.hoisted(() => ({ player: [] as { seq: number; spawn: unknown }[], remote: [] as { seq: number; scene: unknown }[], seq: 0 }))
vi.mock('@/world/player/LocalPlayer', async () => {
  const { useState } = await import('react')
  return {
    LocalPlayer: ({ spawn }: { spawn: unknown }) => {
      const [seq] = useState(() => (mounts.seq += 1))
      mounts.player.push({ seq, spawn })
      return null
    },
  }
})
vi.mock('@/world/RemoteWorld', async () => {
  const { useState } = await import('react')
  return {
    RemoteWorld: ({ scene }: { scene: unknown }) => {
      const [seq] = useState(() => (mounts.seq += 1))
      mounts.remote.push({ seq, scene })
      return null
    },
  }
})

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
  const seatNodesRef = useSeatAnchorNodes()
  return (
    <SceneObjects scene={scene} doors={ROOMS} slots={CORRIDOR_SLOTS} anchors={[]} nodesRef={nodesRef} seatNodesRef={seatNodesRef} />
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
    // 讓它失敗：大廳那時會顯示「暫時拿不到專案清單」的提示（`FE-W12-S03`），
    // 房間裡連那個提示都不該有 —— 因為根本沒打。
    listRooms.mockRejectedValue(new Error('offline'))
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

  it('[FE-V01-S01] 換場景：子樹重掛、出生點與 scene 參數都換成註冊表給的', async () => {
    mounts.player.length = 0
    mounts.remote.length = 0
    const view = render(
      <SceneRefProvider scene={HALL}>
        <WorldCanvas />
      </SceneRefProvider>,
    )
    const hallPlayer = mounts.player.at(-1)!
    const hallRemote = mounts.remote.at(-1)!
    expect(hallRemote.scene).toBe('lobby')
    expect(hallPlayer.spawn).toEqual(sceneOf(HALL).spawn)

    view.rerender(
      <SceneRefProvider scene={ROOM}>
        <WorldCanvas />
      </SceneRefProvider>,
    )
    const roomPlayer = mounts.player.at(-1)!
    const roomRemote = mounts.remote.at(-1)!
    // 序號變了＝卸載再掛（design D3 的 `key`）。少了 key 的話畫面換成房間、玩家卻還撞著大廳的牆。
    expect(roomPlayer.seq).not.toBe(hallPlayer.seq)
    expect(roomRemote.seq).not.toBe(hallRemote.seq)
    expect(roomPlayer.spawn).toEqual(sceneOf(ROOM).spawn)
    expect(roomRemote.scene).toBe(`room:${uuid('a')}`)
    // Canvas 本身沒重掛（`FE-B09-S12`）：同一個 DOM 節點。
    view.unmount()
  })

  it('[FE-V01-S03] 大廳裡：有輪詢、有門標籤、有走廊提示（這條防「兩邊都拿掉」也綠）', async () => {
    const view = await mountWorld(HALL)
    expect(listRooms.mock.calls.length).toBeGreaterThanOrEqual(3)
    expect(screen.getByTestId('door-labels')).toBeTruthy()
    expect(screen.getByTestId('rooms-failed')).toBeTruthy()
    view.unmount()
  })
})

describe('useRooms 的 enabled 來回切', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    listRooms.mockReset()
    listRooms.mockResolvedValue(ROOMS)
  })
  afterEach(() => vi.useRealTimers())

  it('[FE-V01-S03] true→false 停下來並交出空的 loading；false→true 立刻再請求、先交出上一次的門', async () => {
    const { renderHook } = await import('@testing-library/react')
    const { useRooms } = await import('@/world/rooms/useRooms')
    const hook = renderHook(({ enabled }: { enabled: boolean }) => useRooms(4, enabled), {
      initialProps: { enabled: true },
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10)
    })
    expect(hook.result.current.doors.length).toBe(ROOMS.length)
    const before = listRooms.mock.calls.length

    hook.rerender({ enabled: false })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 2 + 10)
    })
    expect(listRooms.mock.calls.length, '停用後還在輪詢').toBe(before)
    // `refresh` 是穩定的函式（`FE-J04`），停用時也在；這裡比的是資料那四個欄位
    expect(hook.result.current).toEqual({ status: 'loading', doors: [], hidden: 0, all: [], refresh: expect.any(Function) })

    listRooms.mockReturnValue(new Promise(() => {})) // 這次永遠不回 —— 看回應到之前交出什麼
    hook.rerender({ enabled: true })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10)
    })
    expect(listRooms.mock.calls.length, '重新啟用沒有立刻請求').toBe(before + 1)
    expect(hook.result.current.doors.length, '回應到之前應該交出上一次的門（FE-W12-S22 同一個理由）').toBe(ROOMS.length)
    hook.unmount()
  })
})
