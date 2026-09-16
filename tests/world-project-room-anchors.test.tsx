import ReactThreeTestRenderer from '@react-three/test-renderer'
import { render, screen } from '@testing-library/react'
import { useThree } from '@react-three/fiber'
import { useEffect, type ReactNode, type RefObject } from 'react'
import type { Camera } from 'three'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cameraOffset } from '@/world/camera'
import { visualBoundsOf } from '@/world/environment/definition'
import { furnitureDefinition } from '@/world/environment/furnitureProps'
import { isOnScreen } from '@/world/layout/framing'
import { ROOM_LAYOUT, ROOM_POINTS, SEAT_INDICES, STATIONS } from '@/world/layout/projectRoomLayout'
import { DESK_TOP, SEAT_ANCHORS, seatAnchorsFor } from '@/world/seats/anchors'
import { SeatAnchorProjector } from '@/world/seats/SeatAnchorProjector'
import type { SeatAnchorNodes } from '@/world/seats/SeatAnchors'
import { SceneRefProvider } from '@/world/scenes/SceneContext'
import type { SceneRef } from '@/world/scenes/registry'
import WorldCanvas from '@/world/WorldCanvas'

// 每個工位一個投影到螢幕的 DOM 錨點。規格 `FE-W16-S06`；`S07` 的 DOM 那一半。
//
// 兩個殼（跟 `world-scenes-hall-only.test.tsx` 同一組替身）：
// - `WorldCanvas` 在 jsdom 裡掛（`Canvas` 換成 stub、`LocalPlayer`／`RemoteWorld` 換成 null）：驗**有哪些錨點**、在哪個場景有。
// - `SeatAnchorProjector` 用 `@react-three/test-renderer` 跑真的 `useFrame`：驗**位置真的被寫進 DOM**、畫面外真的藏起來。
//
// ⚠️ 畫面內／外的期望值用 `framing.ts` 的 `isOnScreen`（構圖判準那把尺）算，不用投影器自己那條路 ——
// 兩邊同源的話「藏錯邊」測不到。兩邊都要有（至少一個藏、至少一個不藏），判準才不空。

const listRooms = vi.hoisted(() => vi.fn())
vi.mock('@/api/operations', () => ({ listRooms }))
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
// Canvas 是 stub，裡面的 `useThree`／`useFrame` 沒有 R3F 的 root：3D 那一半在 jsdom 裡換成不畫的殼；
// 錨點的 DOM 在 Canvas 外面，是這裡要驗的。
vi.mock('@/world/environment/WorldShell', () => ({ WorldShell: () => null }))
vi.mock('@/world/WorldCamera', () => ({ WorldCamera: () => null }))
vi.mock('@/world/interaction/SpatialInteraction', () => ({ SpatialInteraction: () => null }))
vi.mock('@/world/scenes/SceneObjects', () => ({ SceneObjects: () => null }))

const uuid = 'a0000000-0000-4000-8000-00000000000a'
const HALL: SceneRef = { id: 'hall' }
const ROOM: SceneRef = { id: 'room', projectId: uuid }
const VIEWPORT = { width: 1280, height: 720 }

describe('Canvas 外面：錨點的 DOM', () => {
  const realGetContext = HTMLCanvasElement.prototype.getContext
  beforeEach(() => {
    listRooms.mockReset()
    listRooms.mockResolvedValue([])
    HTMLCanvasElement.prototype.getContext = vi.fn((id: string) =>
      id === 'webgl2' ? ({} as RenderingContext) : null,
    ) as typeof realGetContext
  })
  afterEach(() => {
    HTMLCanvasElement.prototype.getContext = realGetContext
  })

  it('[FE-W16-S06] 房間裡恰好八個錨點，data-seat-index 0–7 各一，全部 aria-hidden、沒有文字', () => {
    const view = render(
      <SceneRefProvider scene={ROOM}>
        <WorldCanvas />
      </SceneRefProvider>,
    )
    const anchors = screen.getAllByTestId('seat-anchor')
    expect(anchors.length).toBe(8)
    const indices = anchors.map((a) => Number(a.dataset.seatIndex)).sort((a, b) => a - b)
    expect(indices).toEqual([...SEAT_INDICES])
    for (const anchor of anchors) {
      expect(anchor.getAttribute('aria-hidden')).toBe('true')
      expect(anchor.textContent).toBe('')
    }
    // 錨點在 Canvas 外面（DOM，不是 Canvas 的子節點）。
    const stub = screen.getByTestId('r3f-canvas-stub')
    for (const anchor of anchors) expect(stub.contains(anchor)).toBe(false)
    view.unmount()
  })

  it('[FE-W16-S06] 大廳裡一個都沒有', () => {
    const view = render(
      <SceneRefProvider scene={HALL}>
        <WorldCanvas />
      </SceneRefProvider>,
    )
    expect(screen.queryAllByTestId('seat-anchor')).toEqual([])
    view.unmount()
  })

  it('[FE-W16-S07] 房間裡的 DOM 沒有互動提示', () => {
    // 目標是 null 那一半在 `world-project-room-furniture.test.tsx`（真的移動與目標選擇）；
    // 這裡是同一棵正式 DOM 樹：房間掛起來，提示不存在。
    const view = render(
      <SceneRefProvider scene={ROOM}>
        <WorldCanvas />
      </SceneRefProvider>,
    )
    expect(screen.queryByTestId('interaction-prompt')).toBeNull()
    view.unmount()
  })
})

describe('錨點的世界座標', () => {
  it('[FE-W16-S06] 每個工位一個，x／z 是配置裡那張桌子的中心，y 是桌面高度（從 definition 讀）', () => {
    expect(SEAT_ANCHORS.length).toBe(8)
    const top = (visualBoundsOf(furnitureDefinition('desk'))?.halfHeight ?? NaN) * 2
    expect(DESK_TOP).toBeCloseTo(top, 9)
    expect(DESK_TOP).toBeGreaterThan(0.5)
    for (const anchor of SEAT_ANCHORS) {
      const station = STATIONS.find((s) => s.seatIndex === anchor.seatIndex)
      const desk = ROOM_LAYOUT.find((item) => item.id === station?.deskId)
      if (desk === undefined) throw new Error(`seat ${anchor.seatIndex} 的桌子不在配置裡`)
      expect(anchor.x).toBeCloseTo(desk.x, 9)
      expect(anchor.z).toBeCloseTo(desk.z, 9)
      expect(anchor.y).toBeCloseTo(DESK_TOP, 9)
    }
    // 配置裡少了某張桌子是配置錯誤，不是「少一個錨點」。
    const missing = ROOM_LAYOUT.filter((item) => item.id !== STATIONS[3]?.deskId)
    expect(() => seatAnchorsFor(missing)).toThrow()
  })
})

function CameraProbe({ sinkRef }: { sinkRef: RefObject<Camera | null> }) {
  const camera = useThree((state) => state.camera)
  useEffect(() => {
    sinkRef.current = camera
  }, [camera, sinkRef])
  return null
}

describe('投影元件真的寫進 DOM', () => {
  function nodesFor(): { nodesRef: RefObject<SeatAnchorNodes>; nodes: HTMLElement[] } {
    const map: SeatAnchorNodes = new Map()
    const nodes: HTMLElement[] = []
    for (const anchor of SEAT_ANCHORS) {
      const node = document.createElement('div')
      node.style.visibility = 'hidden'
      map.set(anchor.seatIndex, node)
      nodes.push(node)
    }
    return { nodesRef: { current: map }, nodes }
  }

  const TRANSLATE = /translate3d\((-?[\d.]+)px, (-?[\d.]+)px, 0\)/

  it('[FE-W16-S06] 相機目標在門廊代表點、1280×720：一幀之後每個座標是有限數；畫面外 hidden、畫面內不是，兩邊都有', async () => {
    const target = ROOM_POINTS.porch
    const offset = cameraOffset()
    const { nodesRef, nodes } = nodesFor()

    const renderer = await ReactThreeTestRenderer.create(
      <SeatAnchorProjector anchors={SEAT_ANCHORS} nodesRef={nodesRef} />,
      { width: VIEWPORT.width, height: VIEWPORT.height, camera: { position: [target.x + offset.x, offset.y, target.z + offset.z] } },
    )
    await renderer.advanceFrames(2, 16)

    let hidden = 0
    let shown = 0
    for (const [i, anchor] of SEAT_ANCHORS.entries()) {
      const node = nodes[i]!
      const m = TRANSLATE.exec(node.style.transform)
      expect(m, `seat ${anchor.seatIndex} 的位置沒被寫進 DOM：${JSON.stringify(node.style.transform)}`).not.toBeNull()
      const x = Number(m![1])
      const y = Number(m![2])
      expect(Number.isFinite(x) && Number.isFinite(y), `seat ${anchor.seatIndex} 的座標不是有限數`).toBe(true)
      // 期望用構圖判準那把尺算，不用投影器自己的判斷。
      const expected = isOnScreen(anchor, target, VIEWPORT.width / VIEWPORT.height)
      expect(node.style.visibility, `seat ${anchor.seatIndex} 藏錯邊`).toBe(expected ? 'visible' : 'hidden')
      if (expected) shown += 1
      else hidden += 1
      // 畫面內的：像素位置落在 viewport 裡。
      if (expected) {
        expect(x).toBeGreaterThanOrEqual(0)
        expect(x).toBeLessThanOrEqual(VIEWPORT.width)
        expect(y).toBeGreaterThanOrEqual(0)
        expect(y).toBeLessThanOrEqual(VIEWPORT.height)
      }
    }
    expect(hidden, '沒有任何錨點在畫面外 —— 這條的「藏起來」沒驗到').toBeGreaterThan(0)
    expect(shown, '沒有任何錨點在畫面內 —— 這條的「不藏」沒驗到').toBeGreaterThan(0)
    await renderer.unmount()
  })

  it('[FE-W16-S06] 相機跟拍時位置每幀更新，而且不經過 React（投影器一次都沒重繪）', async () => {
    // 邊界（ADR 0010）：render loop → DOM 直接寫，**不進 React state**。走 state 的話這條會數到每幀一次重繪。
    const { nodesRef, nodes } = nodesFor()
    const counted = vi.fn((props: Parameters<typeof SeatAnchorProjector>[0]) => SeatAnchorProjector(props))
    const Counted = counted as unknown as typeof SeatAnchorProjector
    const offset = cameraOffset()
    const start = ROOM_POINTS.aisleEntry
    const cameraRef: RefObject<Camera | null> = { current: null }
    const renderer = await ReactThreeTestRenderer.create(
      <>
        <CameraProbe sinkRef={cameraRef} />
        <Counted anchors={SEAT_ANCHORS} nodesRef={nodesRef} />
      </>,
      { width: VIEWPORT.width, height: VIEWPORT.height, camera: { position: [start.x + offset.x, offset.y, start.z + offset.z] } },
    )
    await renderer.advanceFrames(1, 16)
    const renders = counted.mock.calls.length
    const before = nodes.map((n) => Number(TRANSLATE.exec(n.style.transform)?.[2]))
    expect(before.every(Number.isFinite)).toBe(true)

    // 相機往北跟拍 2 單位（跟 `WorldCamera` 一樣直接寫 camera.position）：每個錨點在畫面上往下移（螢幕 y 變大）。
    const camera = cameraRef.current
    if (camera === null) throw new Error('沒拿到相機')
    camera.position.z -= 2
    await renderer.advanceFrames(2, 16)
    const after = nodes.map((n) => Number(TRANSLATE.exec(n.style.transform)?.[2]))
    for (const [i, y] of after.entries()) expect(y, `seat ${i} 沒跟著相機動`).toBeGreaterThan(before[i]! + 1)
    expect(counted.mock.calls.length, '投影器在 frame 之間重繪了 —— 位置走了 React').toBe(renders)
    await renderer.unmount()
  })

  it('[FE-W16-S06] 錨點座標是 NaN 時不寫進 DOM、標成 hidden（不是寫出 translate3d(NaNpx…)）', async () => {
    const target = ROOM_POINTS.porch
    const offset = cameraOffset()
    const { nodesRef, nodes } = nodesFor()
    const broken = SEAT_ANCHORS.map((a, i) => (i === 0 ? { ...a, y: Number.NaN } : a))

    const renderer = await ReactThreeTestRenderer.create(
      <SeatAnchorProjector anchors={broken} nodesRef={nodesRef} />,
      { width: VIEWPORT.width, height: VIEWPORT.height, camera: { position: [target.x + offset.x, offset.y, target.z + offset.z] } },
    )
    await renderer.advanceFrames(2, 16)
    expect(nodes[0]!.style.transform).not.toMatch(/NaN/)
    expect(nodes[0]!.style.visibility).toBe('hidden')
    // 其他的照常。
    expect(nodes[1]!.style.transform).toMatch(TRANSLATE)
    await renderer.unmount()
  })
})
