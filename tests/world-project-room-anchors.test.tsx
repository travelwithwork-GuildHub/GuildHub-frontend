import ReactThreeTestRenderer from '@react-three/test-renderer'
import { render, screen } from '@testing-library/react'
import { useThree } from '@react-three/fiber'
import { useEffect, type ReactNode, type RefObject } from 'react'
import type { Camera } from 'three'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cameraOffset } from '@/world/camera'
import { visualBoundsOf } from '@/world/environment/definition'
import { furnitureDefinition } from '@/world/environment/furnitureProps'
import { ROOM_LAYOUT, ROOM_POINTS, SEAT_INDICES, STATIONS } from '@/world/layout/projectRoomLayout'
import { DESK_TOP, SEAT_ANCHORS, seatAnchorsFor } from '@/world/seats/anchors'
import { SeatAnchorProjector } from '@/world/seats/SeatAnchorProjector'
import { SeatAnchors, type SeatAnchorNodes } from '@/world/seats/SeatAnchors'
import { SceneRefProvider } from '@/world/scenes/SceneContext'
import type { SceneRef } from '@/world/scenes/registry'
import WorldCanvas from '@/world/WorldCanvas'

// 每個工位一個投影到螢幕的 DOM 錨點。規格 `FE-W16-S06`。
// 兩個殼（跟 `world-scenes-hall-only.test.tsx` 同一組替身）：`WorldCanvas` 在 jsdom 掛（`Canvas` stub、R3F hook 的使用者換成 null）驗**有哪些錨點**、在哪個場景有；
// `SeatAnchorProjector` 用 `@react-three/test-renderer` 跑真的 `useFrame`，驗**位置真的被寫進 DOM**、畫面外真的藏。
// ⚠️ 像素位置與畫面內／外的期望值是**手算的常數**（`PORCH_EXPECTED`），不呼叫 `toScreen`／`isOnScreen` —— 那些跟投影器同源，投影寫偏 10 px 或藏錯邊會一起錯
// （第一版用 `isOnScreen`，兩位審查者都指出）。`S07` 的「DOM 沒有提示」不在這裡驗：這個殼把 `SpatialInteraction` 換掉了，在這裡斷言「沒有提示」恆真（審查抓到）；
// 那一句由 `world-project-room-furniture.test.tsx` 的目標恆為 null ＋ `interaction-prompt.test.tsx`（`FE-W06-S13`：目標 null 就沒有提示）合起來守。

const listRooms = vi.hoisted(() => vi.fn())
vi.mock('@/api/operations', () => ({ listRooms, listProjects: () => Promise.resolve([]), listProfiles: () => Promise.resolve([]) }))
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
// Canvas 是 stub、沒有 R3F root：裡面用 `useThree`／`useFrame` 的元件換成不畫的殼；錨點的 DOM 在 Canvas 外面，是這裡要驗的。
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

  it('[FE-W16-S06] 房間裡恰好八個錨點，data-seat-index 0–7 各一；沒人給內容（沒登入就沒有座位標籤）→ 全部 aria-hidden、沒有文字', () => {
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

  it('[FE-W16-S06] 給了內容的錨點：不 aria-hidden、接指標事件、內容在錨點裡；沒給的照舊；容器不 aria-hidden（否則裡面全藏掉）', () => {
    const nodesRef: RefObject<SeatAnchorNodes> = { current: new Map() }
    const view = render(<SeatAnchors anchors={SEAT_ANCHORS} nodesRef={nodesRef} render={(i) => (i === 2 ? <span data-testid="probe">二號</span> : null)} />)
    const anchors = screen.getAllByTestId('seat-anchor')
    expect(anchors).toHaveLength(8)
    const two = anchors.find((a) => a.dataset.seatIndex === '2')!
    expect(two.contains(screen.getByTestId('probe'))).toBe(true)
    expect(two.getAttribute('aria-hidden')).not.toBe('true')
    expect(two.className).not.toMatch(/pointer-events-none/)
    expect(screen.getByTestId('seat-anchors').getAttribute('aria-hidden')).not.toBe('true')
    for (const a of anchors.filter((a) => a !== two)) {
      expect(a.getAttribute('aria-hidden')).toBe('true')
      expect(a.textContent).toBe('')
    }
    expect(nodesRef.current.size).toBe(8)
    view.unmount()
    // 全部沒內容：容器也 aria-hidden（跟今天一樣）
    render(<SeatAnchors anchors={SEAT_ANCHORS} nodesRef={nodesRef} render={() => null} />)
    expect(screen.getByTestId('seat-anchors').getAttribute('aria-hidden')).toBe('true')
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

  // 手算的期望值（`framing.ts` 檔頭的公式，數字自己算、不呼叫 `toScreen`）：相機目標＝門廊 (0, 10.875)、viewHeight 12 → 半高 6、半寬 6·16/9 = 10.667；
  //   x：桌子中心 ±3.6 → 640 ∓ 3.6/10.667·640 = 424／856（西／東）
  //   y：sy = (0.76 − z + 10.875)·√½，像素 y = 360 − sy/6·360 → z = 5：78.5；z = 1：−91.2；z = −3：−260.9；z = −7：−430.6
  //   所以**恰好 seat 0／4（z = 5）在畫面內**，其餘六個在畫面上緣之外。八個全部都要對到 ±1 px（審查：只對兩個的話另外六個偏 10 px 照樣綠）。
  const PORCH_Y = new Map([[5, 78.5], [1, -91.2], [-3, -260.9], [-7, -430.6]])
  const porchExpected = (anchor: { seatIndex: number; z: number }) => {
    const y = PORCH_Y.get(anchor.z)
    if (y === undefined) throw new Error(`沒有 z = ${anchor.z} 的手算值 —— 模板改了，手算要跟著改`)
    return { x: anchor.seatIndex < 4 ? 424 : 856, y, inside: y >= 0 }
  }

  it('[FE-W16-S06] 相機目標在門廊代表點、1280×720：八個錨點都在手算位置 ±1 px；恰好 0／4 在畫面內且不藏，其餘六個 hidden', async () => {
    const target = ROOM_POINTS.porch
    const offset = cameraOffset()
    const { nodesRef, nodes } = nodesFor()

    const renderer = await ReactThreeTestRenderer.create(
      <SeatAnchorProjector anchors={SEAT_ANCHORS} nodesRef={nodesRef} />,
      { width: VIEWPORT.width, height: VIEWPORT.height, camera: { position: [target.x + offset.x, offset.y, target.z + offset.z] } },
    )
    await renderer.advanceFrames(2, 16)

    const shown: number[] = []
    for (const [i, anchor] of SEAT_ANCHORS.entries()) {
      const node = nodes[i]!
      const m = TRANSLATE.exec(node.style.transform)
      expect(m, `seat ${anchor.seatIndex} 的位置沒被寫進 DOM：${JSON.stringify(node.style.transform)}`).not.toBeNull()
      const x = Number(m![1])
      const y = Number(m![2])
      expect(Number.isFinite(x) && Number.isFinite(y), `seat ${anchor.seatIndex} 的座標不是有限數`).toBe(true)
      const expected = porchExpected(anchor)
      expect(Math.abs(x - expected.x), `seat ${anchor.seatIndex} 的 x 偏了：${x}`).toBeLessThanOrEqual(1)
      expect(Math.abs(y - expected.y), `seat ${anchor.seatIndex} 的 y 偏了：${y}`).toBeLessThanOrEqual(1)
      expect(node.style.visibility, `seat ${anchor.seatIndex} 藏錯邊`).toBe(expected.inside ? 'visible' : 'hidden')
      if (expected.inside) shown.push(anchor.seatIndex)
    }
    expect(shown).toEqual([0, 4])
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
    // ⚠️ frame 要包在 `act` 裡：不包的話 `useFrame` 裡的 setState 只排隊不 flush，重繪數不到 —— 突變「每幀 setState」照樣綠（實測）。
    await ReactThreeTestRenderer.act(async () => {
      await renderer.advanceFrames(1, 16)
    })
    const renders = counted.mock.calls.length
    const before = nodes.map((n) => Number(TRANSLATE.exec(n.style.transform)?.[2]))
    expect(before.every(Number.isFinite)).toBe(true)

    // 相機往北跟拍 2 單位（跟 `WorldCamera` 一樣直接寫 camera.position）：每個錨點在畫面上往下移（螢幕 y 變大）。
    const camera = cameraRef.current
    if (camera === null) throw new Error('沒拿到相機')
    camera.position.z -= 2
    await ReactThreeTestRenderer.act(async () => {
      await renderer.advanceFrames(2, 16)
    })
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
