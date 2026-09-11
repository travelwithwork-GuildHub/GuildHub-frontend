import ReactThreeTestRenderer from '@react-three/test-renderer'
import { useEffect, type ReactNode, type RefObject } from 'react'
import { describe, expect, it } from 'vitest'
import type { RoomDoorOut } from '@/api/contract/rest'
import { FACING } from '@/world/coords'
import type { LocalPose } from '@/world/PositionSync'
import { InteractionProvider, useInteraction } from '@/world/interaction/InteractionProvider'
import { ListPanelProvider } from '@/list-panel/ListPanelProvider'
import type { InteractableRegistry } from '@/world/interaction/registry'
import { SpatialInteraction } from '@/world/interaction/SpatialInteraction'
import { BoardTargets, boardItems } from '@/world/rooms/BoardTargets'
import { BOARD_LABELS, doorLabel, doorTargetId } from '@/world/rooms/labels'
import { ProjectDoors } from '@/world/rooms/ProjectDoors'
import { CORRIDOR_SLOTS } from '@/world/rooms/slots'

// 門與看板接上互動系統。規格 `FE-W12-S01`／`S14`／`S16`／`S17`／`S18`。
//
// ⚠️ **用 `@react-three/test-renderer`，不 mock `@react-three/fiber`** ——
// `SpatialInteraction` 的行為全部在 `useFrame` 裡，mock 掉的話測到的是 mock 的形狀。

const room = (id: string, title: string, online = 0): RoomDoorOut => ({
  project_id: id,
  title,
  online_count: online,
})

const uuid = (letter: string) => `${letter}0000000-0000-4000-8000-00000000000${letter}`

const A = room(uuid('a'), '星際導航', 3)
const B = room(uuid('b'), '深海測繪', 0)
const C = room(uuid('c'), '沙丘物流', 12)

/** 把註冊表交出來 —— 它是**正式碼**的那一份，不是測試自己造的。 */
function Probe({ sinkRef }: { sinkRef: RefObject<InteractableRegistry | null> }) {
  const { registry } = useInteraction()
  useEffect(() => {
    sinkRef.current = registry
  }, [registry, sinkRef])
  return null
}

function Harness({
  sinkRef,
  poseRef,
  children,
}: {
  sinkRef: RefObject<InteractableRegistry | null>
  poseRef?: RefObject<LocalPose>
  children: ReactNode
}) {
  return (
    <InteractionProvider>
      {/* `BoardTargets` 按 E 會開清單面板（`FE-B01`），所以要有那一層 provider。 */}
      <ListPanelProvider>
        <Probe sinkRef={sinkRef} />
        {poseRef !== undefined && <SpatialInteraction poseRef={poseRef} />}
        {children}
      </ListPanelProvider>
    </InteractionProvider>
  )
}

const takeRef = (): RefObject<InteractableRegistry | null> => ({ current: null })

function registryOf(sinkRef: RefObject<InteractableRegistry | null>): InteractableRegistry {
  const registry = sinkRef.current
  if (registry === null) throw new Error('沒有拿到註冊表 —— provider 沒掛起來')
  return registry
}

describe('走廊的門', () => {
  it('[FE-W12-S01] 每一筆房間註冊一扇門，識別字帶著 project_id', async () => {
    const sinkRef = takeRef()
    await ReactThreeTestRenderer.create(
      <Harness sinkRef={sinkRef}>
        <ProjectDoors rooms={[A, B, C]} slots={CORRIDOR_SLOTS} />
      </Harness>,
    )

    const registry = registryOf(sinkRef)
    expect([...registry.entries.keys()].sort()).toEqual(
      [A, B, C].map((r) => doorTargetId(r.project_id)).sort(),
    )
  })

  it('[FE-W12-S01] 第 i 個房間站在第 i 個槽位上', async () => {
    const sinkRef = takeRef()
    await ReactThreeTestRenderer.create(
      <Harness sinkRef={sinkRef}>
        <ProjectDoors rooms={[A, B, C]} slots={CORRIDOR_SLOTS} />
      </Harness>,
    )

    const registry = registryOf(sinkRef)
    for (const [index, r] of [A, B, C].entries()) {
      const slot = CORRIDOR_SLOTS[index]
      const entry = registry.entries.get(doorTargetId(r.project_id))
      if (slot === undefined || entry === undefined) throw new Error('槽位或登記不見了')
      expect(entry.x).toBeCloseTo(slot.x, 10)
      expect(entry.z).toBeCloseTo(slot.z, 10)
    }
  })

  it('[FE-W12-S09] 門的名字同時帶著專案名稱與在線數', async () => {
    const sinkRef = takeRef()
    await ReactThreeTestRenderer.create(
      <Harness sinkRef={sinkRef}>
        <ProjectDoors rooms={[A]} slots={CORRIDOR_SLOTS} />
      </Harness>,
    )

    const label = registryOf(sinkRef).entries.get(doorTargetId(A.project_id))?.label ?? ''
    expect(label).toContain('星際導航')
    expect(label).toContain('3')
  })

  it('[FE-W12-S16] 門沒有互動動作 —— 場景切換是別的工作項目', async () => {
    const sinkRef = takeRef()
    await ReactThreeTestRenderer.create(
      <Harness sinkRef={sinkRef}>
        <ProjectDoors rooms={[A]} slots={CORRIDOR_SLOTS} />
      </Harness>,
    )

    // ⚠️ 這一條**不是**規格裡的 `S16`（那一條要走真實的按鍵路徑，在下一刀）。
    // 這裡驗的是註冊的形狀：**沒有人偷渡一個開面板的 callback 進來**。
    expect(registryOf(sinkRef).entries.get(doorTargetId(A.project_id))?.onInteract).toBeUndefined()
  })
})

describe('身分不錯位', () => {
  it('[FE-W12-S17] 清單重排之後，每一扇門的名字與識別字仍然對應同一筆房間', async () => {
    const sinkRef = takeRef()
    const renderer = await ReactThreeTestRenderer.create(
      <Harness sinkRef={sinkRef}>
        <ProjectDoors rooms={[A, B, C]} slots={CORRIDOR_SLOTS} />
      </Harness>,
    )

    // 刪掉 B、加入 G —— 順序也跟著變。
    const G = room(uuid('9'), '極地補給', 7)
    const next = [G, A, C]
    await renderer.update(
      <Harness sinkRef={sinkRef}>
        <ProjectDoors rooms={next} slots={CORRIDOR_SLOTS} />
      </Harness>,
    )

    const registry = registryOf(sinkRef)
    // 數目、集合、以及每一筆的內容 —— 三層都要。
    expect(registry.entries.size).toBe(next.length)
    expect([...registry.entries.keys()].sort()).toEqual(
      next.map((r) => doorTargetId(r.project_id)).sort(),
    )
    // ⚠️ **只驗「名字與識別字指向同一個 id」不夠** ——
    // 兩邊一起綁到同一個**錯的** id 也會通過。所以一路釘回那一筆房間。
    for (const r of next) {
      expect(registry.entries.get(doorTargetId(r.project_id))?.label).toBe(doorLabel(r))
    }
    expect(registry.entries.has(doorTargetId(B.project_id))).toBe(false)
  })

  it('[FE-W12-S18] 正對著的門消失時，登記與提示都跟著消失', async () => {
    const sinkRef = takeRef()
    const slot = CORRIDOR_SLOTS[0]
    if (slot === undefined) throw new Error('沒有槽位')
    // 站在第一扇門前面（東側一步），面向西。
    const poseRef: RefObject<LocalPose> = { current: { x: slot.x + 1, z: slot.z, f: FACING.left } }

    const renderer = await ReactThreeTestRenderer.create(
      <Harness sinkRef={sinkRef} poseRef={poseRef}>
        <ProjectDoors rooms={[A, B]} slots={CORRIDOR_SLOTS} />
      </Harness>,
    )
    await renderer.advanceFrames(2, 16)

    const registry = registryOf(sinkRef)
    expect(registry.entries.has(doorTargetId(A.project_id))).toBe(true)

    await renderer.update(
      <Harness sinkRef={sinkRef} poseRef={poseRef}>
        <ProjectDoors rooms={[B]} slots={CORRIDOR_SLOTS} />
      </Harness>,
    )
    // 卸載之後登記**立即**不見。
    expect(registry.entries.has(doorTargetId(A.project_id))).toBe(false)
  })
})

describe('看板', () => {
  it('[FE-W12-S14] 兩塊看板都註冊了，名字是人看得懂的', async () => {
    const sinkRef = takeRef()
    await ReactThreeTestRenderer.create(
      <Harness sinkRef={sinkRef}>
        <BoardTargets />
      </Harness>,
    )

    const boards = boardItems()
    // 配置裡真的有看板 —— 少了這一行，看板被刪掉時下面的迴圈是空集合。
    expect(boards.length).toBeGreaterThan(1)

    const registry = registryOf(sinkRef)
    for (const { item, kind } of boards) {
      const entry = registry.entries.get(item.id)
      expect(entry?.label).toBe(BOARD_LABELS[kind])
      expect(entry?.x).toBeCloseTo(item.x, 10)
      // 這裡以前斷言 `onInteract` 是 `undefined`（「看板沒有互動動作」）。
      // `FE-B01` 之後看板按 E 會開清單面板 —— 那個動作由
      // `tests/board-panel-wiring.test.tsx` 成對驗（`FE-B01-S01`／`S02`）；
      // 這一條只守 `FE-W12` 自己的事：穩定的 `id` 與人看得懂的 `label`。
    }
  })
})
