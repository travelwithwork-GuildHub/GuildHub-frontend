import ReactThreeTestRenderer from '@react-three/test-renderer'
import type {} from '@react-three/fiber'
import { useEffect, type RefObject } from 'react'
import { Vector3, type Mesh, type Object3D } from 'three'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ListPanelProvider, useListPanel } from '@/list-panel/ListPanelProvider'
import { FACING } from '@/world/coords'
import { furnitureDefinition, type FurnitureKind } from '@/world/environment/furnitureProps'
import { WorldShell } from '@/world/environment/WorldShell'
import { InteractionProvider, useInteraction } from '@/world/interaction/InteractionProvider'
import type { InteractableRegistry } from '@/world/interaction/registry'
import { SpatialInteraction } from '@/world/interaction/SpatialInteraction'
import { staticBoxFor, staticBoxesFor } from '@/world/layout/geometry'
import { ENTRY, ROOM_LAYOUT, STATIONS, stationAt } from '@/world/layout/projectRoomLayout'
import type { LayoutItem } from '@/world/layout/types'
import { PHYSICS } from '@/world/physics/world'
import { LocalPlayer } from '@/world/player/LocalPlayer'
import type { LocalPose } from '@/world/PositionSync'
import { geometryFor } from '@/world/primitives/geometry'
import { useLabelNodes } from '@/world/rooms/DoorLabels'
import { CORRIDOR_SLOTS } from '@/world/rooms/slots'
import { useSeatAnchorNodes, type SeatAnchorNodes } from '@/world/seats/SeatAnchors'
import { SceneObjects } from '@/world/scenes/SceneObjects'
import type { SceneRef } from '@/world/scenes/registry'

// 房間裡的桌椅：畫出來的＝配置裡的、撞得到、但不是互動物件。規格 `FE-W16-S04`／`S07`。
//
// ⚠️⚠️ **辨識「一張畫出來的桌子」不靠 Three 的物件名，也不靠配置** —— 靠它的部件幾何。
// `geometryFor` 對同一份 spec 回同一個實例（`FE-W09` 的快取），所以「一個 group 底下的 mesh 依序拿著
// desk definition 每一個部件的幾何」就是一張桌子，不管誰畫的、畫在哪。這樣 `SceneObjects` 的 JSX 裡
// 偷畫一張，數量會變 9；而配置少一張、渲染卻沒少，也抓得到。位置再對回配置的識別字。
//
// ⚠️ `S07` 走的是**正式的移動與目標選擇路徑**：真的 `LocalPlayer`（Rapier）從站位朝桌子走到撞上，
// 真的 `SpatialInteraction` 每幀選目標。用 `poseRef` 直接寫座標的話，「撞得到」那一半就沒驗到。

const ROOM: SceneRef = { id: 'room', projectId: 'a0000000-0000-4000-8000-00000000000a' }
const close = (a: number, b: number) => Math.abs(a - b) < 1e-6

function RoomObjects({ scene }: { scene: SceneRef }) {
  const nodesRef = useLabelNodes()
  const seatNodesRef = useSeatAnchorNodes()
  return (
    <SceneObjects scene={scene} doors={[]} slots={CORRIDOR_SLOTS} anchors={[]} nodesRef={nodesRef} seatNodesRef={seatNodesRef} />
  )
}

/** 場景圖裡「長得像這種家具」的物件：直接子節點全是 mesh，且依序拿著 definition 每個部件的幾何實例。 */
function renderedFurniture(scene: Object3D, kind: FurnitureKind): { x: number; z: number }[] {
  const signature = furnitureDefinition(kind).parts.map((part) => geometryFor(part.geometry))
  const found: { x: number; z: number }[] = []
  scene.traverse((o) => {
    if ((o as Mesh).isMesh) return
    const meshes = o.children.filter((c) => (c as Mesh).isMesh) as Mesh[]
    if (meshes.length !== o.children.length || meshes.length !== signature.length) return
    if (!meshes.every((m, i) => m.geometry === signature[i])) return
    const at = o.getWorldPosition(new Vector3())
    found.push({ x: at.x, z: at.z })
  })
  return found
}

/** 渲染房間的正式元件樹（`WorldCanvas` 在 `room` 掛的那些），回每一種家具畫出來的位置。 */
async function renderRoom(layout: readonly LayoutItem[]) {
  const renderer = await ReactThreeTestRenderer.create(
    <InteractionProvider>
      <ListPanelProvider>
        <WorldShell layout={layout} />
        <RoomObjects scene={ROOM} />
      </ListPanelProvider>
    </InteractionProvider>,
  )
  const scene = renderer.scene.instance as Object3D
  scene.updateMatrixWorld(true)
  const out = { desks: renderedFurniture(scene, 'desk'), chairs: renderedFurniture(scene, 'chair') }
  await renderer.unmount()
  return out
}

/** 位置上恰好有一個這種家具的配置項時回它的識別字；沒有或不只一個都拋。 */
function configIdAt(layout: readonly LayoutItem[], kind: FurnitureKind, at: { x: number; z: number }): string {
  const hits = layout.filter((item) => item.kind === kind && close(item.x, at.x) && close(item.z, at.z))
  if (hits.length !== 1) throw new Error(`(${at.x}, ${at.z}) 上有 ${hits.length} 個 ${kind} 的配置項`)
  return hits[0]!.id
}

/** 碰撞盒裡「中心在這個位置、尺寸是這種家具轉過之後的尺寸」的那些。 */
function boxesAt(layout: readonly LayoutItem[], kind: FurnitureKind, at: { x: number; z: number }) {
  const item = layout.find((i) => i.kind === kind && close(i.x, at.x) && close(i.z, at.z))
  const expected = item === undefined ? undefined : staticBoxFor(item)
  if (expected === undefined) return []
  return staticBoxesFor(layout).filter(
    (b) => close(b.x, expected.x) && close(b.z, expected.z) && close(b.halfWidth, expected.halfWidth) && close(b.halfDepth, expected.halfDepth),
  )
}

describe('房間的正式元件樹畫出來的桌椅＝配置裡的桌椅', () => {
  it('[FE-W16-S04] 桌子恰好 8 個、椅子恰好 8 個，每一個由識別字對回配置；碰撞盒各 8 個', async () => {
    const { desks, chairs } = await renderRoom(ROOM_LAYOUT)
    expect(desks.length).toBe(8)
    expect(chairs.length).toBe(8)

    const deskIds = desks.map((at) => configIdAt(ROOM_LAYOUT, 'desk', at))
    const chairIds = chairs.map((at) => configIdAt(ROOM_LAYOUT, 'chair', at))
    expect(new Set(deskIds), '每張畫出來的桌子對回一個不同的工位').toEqual(new Set(STATIONS.map((s) => s.deskId)))
    expect(new Set(chairIds)).toEqual(new Set(STATIONS.map((s) => s.chairId)))

    // 碰撞：每一張畫出來的桌子／椅子，在同一個位置恰好有一個它尺寸的碰撞盒。
    expect(desks.flatMap((at) => boxesAt(ROOM_LAYOUT, 'desk', at)).length).toBe(8)
    expect(chairs.flatMap((at) => boxesAt(ROOM_LAYOUT, 'chair', at)).length).toBe(8)
  })

  it('[FE-W16-S04] 從配置拿掉 seat_index=3 的桌子：渲染物件與碰撞盒都變 7，其餘不變', async () => {
    const removed = stationAt(3).deskId
    const layout = ROOM_LAYOUT.filter((item) => item.id !== removed)
    expect(layout.length, '配置裡本來就沒有那張桌子 —— 這條是空的').toBe(ROOM_LAYOUT.length - 1)

    const { desks, chairs } = await renderRoom(layout)
    expect(desks.length).toBe(7)
    expect(desks.flatMap((at) => boxesAt(layout, 'desk', at)).length).toBe(7)
    expect(desks.map((at) => configIdAt(layout, 'desk', at))).not.toContain(removed)
    // 其餘不變：椅子還是 8，其它 7 張桌子還在原位。
    expect(chairs.length).toBe(8)
    expect(new Set(desks.map((at) => configIdAt(layout, 'desk', at)))).toEqual(
      new Set(STATIONS.filter((s) => s.deskId !== removed).map((s) => s.deskId)),
    )
  })
})

describe('工位錨點的投影器掛在 room 分支', () => {
  /** 一組真的 DOM 節點交給 `SceneObjects` 裡的投影器寫。 */
  function Wired({ scene, nodesRef }: { scene: SceneRef; nodesRef: RefObject<SeatAnchorNodes> }) {
    const labelNodes = useLabelNodes()
    return <SceneObjects scene={scene} doors={[]} slots={CORRIDOR_SLOTS} anchors={[]} nodesRef={labelNodes} seatNodesRef={nodesRef} />
  }
  async function written(scene: SceneRef): Promise<number> {
    const map: SeatAnchorNodes = new Map()
    for (const station of STATIONS) map.set(station.seatIndex, document.createElement('div'))
    const renderer = await ReactThreeTestRenderer.create(
      <InteractionProvider>
        <ListPanelProvider>
          <Wired scene={scene} nodesRef={{ current: map }} />
        </ListPanelProvider>
      </InteractionProvider>,
    )
    await renderer.advanceFrames(2, 16)
    await renderer.unmount()
    return [...map.values()].filter((node) => node.style.transform !== '').length
  }

  it('[FE-W16-S06] 房間裡一幀之後八個節點都被寫了位置；大廳裡一個都沒被寫', async () => {
    expect(await written(ROOM)).toBe(8)
    expect(await written({ id: 'hall' })).toBe(0)
  })
})

function Probe({
  sinkRef,
  seen,
}: {
  sinkRef: RefObject<InteractableRegistry | null>
  seen: (id: string | null, panel: string | null) => void
}) {
  const { registry, target } = useInteraction()
  const { open } = useListPanel()
  useEffect(() => {
    sinkRef.current = registry
  }, [registry, sinkRef])
  seen(target.id, open)
  return null
}

describe('桌子在、撞得到，但不會冒出 E 提示', () => {
  let fetchSpy: ReturnType<typeof vi.fn>
  beforeEach(() => {
    fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
  })
  afterEach(() => vi.unstubAllGlobals())

  it('[FE-W16-S07] 從 seat 0 的站位朝桌子走到撞上：註冊表沒有桌椅或門洞、目標一直是 null、按 E 什麼都沒發生', async () => {
    const station = stationAt(0)
    const desk = ROOM_LAYOUT.find((item) => item.id === station.deskId)
    const deskBox = desk === undefined ? undefined : staticBoxFor(desk)
    // GIVEN：配置裡有那張桌子，而且它有碰撞盒 —— 少了這個，下面「撞上」是恆真的。
    if (desk === undefined || deskBox === undefined) throw new Error('seat 0 的桌子不在配置裡或沒有碰撞盒')
    // 西側：桌子在站位的 -x 方向，面向它就是 `left`。
    expect(desk.x).toBeLessThan(station.x)
    const nearFace = deskBox.x + deskBox.halfWidth

    const sinkRef: RefObject<InteractableRegistry | null> = { current: null }
    const seen: Array<[string | null, string | null]> = []
    const targetRef = { current: new Vector3(station.x, 0, station.z) }
    const poseRef: RefObject<LocalPose> = { current: { x: station.x, z: station.z, f: FACING.left } }
    const renderer = await ReactThreeTestRenderer.create(
      <InteractionProvider>
        <ListPanelProvider>
          <Probe sinkRef={sinkRef} seen={(id, panel) => seen.push([id, panel])} />
          <WorldShell layout={ROOM_LAYOUT} />
          <LocalPlayer targetRef={targetRef} poseRef={poseRef} spawn={{ x: station.x, z: station.z }} layout={ROOM_LAYOUT} />
          <RoomObjects scene={ROOM} />
          <SpatialInteraction poseRef={poseRef} />
        </ListPanelProvider>
      </InteractionProvider>,
    )
    // 等 Rapier 載進來（`local-pose-ref.test.tsx` 的做法）—— 不等的話走的是純位移 fallback，沒有碰撞。
    await ReactThreeTestRenderer.act(async () => {
      for (let i = 0; i < 50; i++) await new Promise((r) => setTimeout(r, 0))
    })

    // 朝桌子走：站位到桌子近側面只有 0.7（扣角色半徑剩 0.45），1.5 秒（速度 4／秒）夠走 6 單位 —— 停下來一定是撞到了。
    await ReactThreeTestRenderer.act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowLeft' }))
      await renderer.advanceFrames(90, 1 / 60)
    })
    const stopped = poseRef.current.x
    await ReactThreeTestRenderer.act(async () => {
      await renderer.advanceFrames(30, 1 / 60)
    })
    await ReactThreeTestRenderer.act(async () => {
      window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ArrowLeft' }))
    })
    expect(poseRef.current.f, '面向桌子').toBe(FACING.left)
    expect(stopped, '沒有朝桌子走').toBeLessThan(station.x - 0.3)
    expect(stopped, '穿過桌子了').toBeGreaterThanOrEqual(nearFace + PHYSICS.playerRadius - 0.05)
    expect(stopped, '沒有走到桌邊').toBeLessThan(nearFace + PHYSICS.playerRadius + 0.15)
    expect(poseRef.current.x, '撞上之後還在動').toBeCloseTo(stopped, 3)

    // 註冊表：沒有任何桌椅、站位或門洞的識別字。
    const ids = [...(sinkRef.current?.entries.keys() ?? [])]
    const banned = new Set([...ROOM_LAYOUT.map((item) => item.id), ...STATIONS.map((s) => s.id), ENTRY.doorId])
    expect(ids.filter((id) => banned.has(id))).toEqual([])
    expect(ids.filter((id) => /desk|chair|seat|door/i.test(id))).toEqual([])
    // 目標從頭到尾是 null；面板沒開。
    expect(seen.length).toBeGreaterThan(0)
    expect(seen.map(([id]) => id).filter((id) => id !== null)).toEqual([])

    const before = window.location.href
    await ReactThreeTestRenderer.act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE' }))
      await renderer.advanceFrames(2, 1 / 60)
    })
    expect(fetchSpy, '按 E 送出了請求').not.toHaveBeenCalled()
    expect(seen.map(([, panel]) => panel).filter((p) => p !== null), '按 E 開了面板').toEqual([])
    expect(seen.map(([id]) => id).filter((id) => id !== null)).toEqual([])
    expect(window.location.href).toBe(before)
    await renderer.unmount()
  }, 60_000)
})

