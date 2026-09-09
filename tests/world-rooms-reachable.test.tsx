import ReactThreeTestRenderer from '@react-three/test-renderer'
import { type ReactNode, type RefObject } from 'react'
import { describe, expect, it } from 'vitest'
import type { RoomDoorOut } from '@/api/contract/rest'
import { FACING, facingFromDirection, type Facing } from '@/world/coords'
import type { LocalPose } from '@/world/PositionSync'
import { staticBoxesFor, WORLD_HALF_EXTENT } from '@/world/layout/geometry'
import { LAYOUT, SPAWN } from '@/world/layout/guildHallLayout'
import { cellsOf, reachableFrom } from '@/world/layout/reachability'
import { InteractionProvider, useInteraction } from '@/world/interaction/InteractionProvider'
import { SpatialInteraction } from '@/world/interaction/SpatialInteraction'
import { PHYSICS } from '@/world/physics/world'
import { BoardTargets, boardItems } from '@/world/rooms/BoardTargets'
import { doorTargetId } from '@/world/rooms/labels'
import { ProjectDoors } from '@/world/rooms/ProjectDoors'
import { CORRIDOR_SLOTS } from '@/world/rooms/slots'
import { TUNING } from '@/world/interaction/tuning'

// 可走 ≠ 互動得到。規格 `FE-W12-S15`／`S16`。
//
// ⚠️⚠️ **這一組刻意不寫成「座標之間的距離小於 `range`」。**
// 那只證明兩份常數相容 —— 把 `Interactable` 的註冊或 `chooseTarget`
// 整個砍掉，那種算術照樣是綠的（外部審查者原話：
// 「你只是在驗證兩份靜態資料的數學關係」）。
//
// 這裡走**真實的路徑**：掛載門 → 角色放到 BFS 求出的可站立格 →
// 設定朝向 → 跑真正的 `SpatialInteraction` → 讀 provider 交出來的目標。

const room = (letter: string, title: string, online = 0): RoomDoorOut => ({
  project_id: `${letter}0000000-0000-4000-8000-00000000000${letter}`,
  title,
  online_count: online,
})

const ROOMS = CORRIDOR_SLOTS.map((_, i) => room(String.fromCharCode(97 + i), `專案 ${i}`, i))

const BOXES = staticBoxesFor(LAYOUT)

/** 「退一步」的距離：一個世界單位，大約是角色兩個身寬。 */
const STEP = 1

/** 角色真的走得到的每一個格子（降採樣，不然是十幾萬個）。 */
const REACHABLE = cellsOf(
  reachableFrom(SPAWN, BOXES, { half: WORLD_HALF_EXTENT, radius: PHYSICS.playerRadius }),
  2,
)

/**
 * 目前的目標。**讀的是 provider 交出來的那一份**，不是測試自己算的。
 *
 * ⚠️ 記的是**每一次**看到的值。只記最後一次的話，
 * 「一次都沒更新」跟「更新成 null」分不出來。
 */
function Spy({ seen }: { seen: (id: string | null) => void }) {
  const { target } = useInteraction()
  seen(target.id)
  return null
}

function Harness({
  seen,
  poseRef,
}: {
  seen: (id: string | null) => void
  poseRef: RefObject<LocalPose>
}): ReactNode {
  return (
    <InteractionProvider>
      <Spy seen={seen} />
      <SpatialInteraction poseRef={poseRef} />
      <ProjectDoors rooms={ROOMS} slots={CORRIDOR_SLOTS} />
      <BoardTargets />
    </InteractionProvider>
  )
}

/**
 * 離某個物件最近的**可站立**格子，以及站在那裡要面向哪一邊。
 *
 * ⚠️ **候選只從 BFS 的結果來** —— 「貼著物件的那一格」很可能是碰撞盒裡面，
 * 玩家根本站不到。這一整條判準要防的就是那件事。
 */
function stanceFor(spot: { x: number; z: number }): { x: number; z: number; f: Facing } | null {
  let best: { x: number; z: number; d: number } | null = null
  for (const cell of REACHABLE) {
    const d = Math.hypot(cell.x - spot.x, cell.z - spot.z)
    if (best === null || d < best.d) best = { x: cell.x, z: cell.z, d }
  }
  if (best === null) return null
  const f = facingFromDirection(spot.x - best.x, spot.z - best.z) ?? FACING.down
  return { x: best.x, z: best.z, f }
}

/**
 * 從最近的可站立格**再退一步**（沿著同一條視線）。
 *
 * ⚠️ **玩家不會停在貼著門的那一格。** 只驗「最近的格子選得到」的話，
 * `range` 小到 0.4 也會全綠 —— 而 0.4 的意思是「必須貼著門才有提示」。
 */
function oneStepBack(
  spot: { x: number; z: number },
  stance: { x: number; z: number; f: Facing },
): { x: number; z: number; f: Facing } {
  const dx = spot.x - stance.x
  const dz = spot.z - stance.z
  const length = Math.hypot(dx, dz) || 1
  return { x: stance.x - (dx / length) * STEP, z: stance.z - (dz / length) * STEP, f: stance.f }
}

async function targetAt(stance: { x: number; z: number; f: Facing }): Promise<string | null> {
  const seen: Array<string | null> = []
  const poseRef: RefObject<LocalPose> = { current: { x: stance.x, z: stance.z, f: stance.f } }
  const renderer = await ReactThreeTestRenderer.create(
    <Harness seen={(id) => seen.push(id)} poseRef={poseRef} />,
  )
  // ⚠️ **`advanceFrames` 要包在 `act` 裡。** `SpatialInteraction` 在 `useFrame`
  // 裡 `setTarget`，不包的話那次更新還沒 flush，讀到的永遠是初始的 `null`
  //（第一版整組紅在這裡，而紅的是量測不是產品）。
  await ReactThreeTestRenderer.act(async () => {
    await renderer.advanceFrames(3, 1 / 60)
  })
  return seen.at(-1) ?? null
}

describe('每一個互動物件都真的互動得到', () => {
  it('BFS 的結果不是空的 —— 這一整組判準的前提', () => {
    // 沒有這一行，下面每一條在「BFS 壞掉、一格都走不到」時都會
    // 因為找不到站位而**用不同的方式**紅或綠，說不出原因。
    expect(REACHABLE.length).toBeGreaterThan(100)
  })

  it('[FE-W12-S15] 走廊上每一扇門都選得到', async () => {
    expect(CORRIDOR_SLOTS.length).toBeGreaterThan(1)

    for (const [index, slot] of CORRIDOR_SLOTS.entries()) {
      const stance = stanceFor(slot)
      if (stance === null) throw new Error(`第 ${index} 扇門附近沒有可站立的格子`)
      const wanted = doorTargetId(ROOMS[index]?.project_id ?? '')
      expect(
        await targetAt(stance),
        `站在 (${stance.x.toFixed(1)}, ${stance.z.toFixed(1)}) 面向第 ${index} 扇門，` +
          `選到的卻不是它 —— 互動半徑 ${TUNING.range} 可能不夠`,
      ).toBe(wanted)
    }
  })

  it('[FE-W12-S15] 兩塊看板都選得到', async () => {
    const boards = boardItems()
    expect(boards.length).toBeGreaterThan(1)

    for (const { item } of boards) {
      const stance = stanceFor(item)
      if (stance === null) throw new Error(`${item.id} 附近沒有可站立的格子`)
      expect(await targetAt(stance), `站在看板前選不到 ${item.id}`).toBe(item.id)
    }
  })

  it('[FE-W12-S15] 退後一步仍然選得到 —— 玩家不會貼著門站', async () => {
    for (const [index, slot] of CORRIDOR_SLOTS.entries()) {
      const stance = stanceFor(slot)
      if (stance === null) throw new Error(`第 ${index} 扇門附近沒有可站立的格子`)
      const back = oneStepBack(slot, stance)
      expect(
        await targetAt(back),
        `退一步（${STEP} 個單位）之後選不到第 ${index} 扇門 —— ` +
          `互動半徑 ${TUNING.range} 太小，等於要求玩家貼著門站`,
      ).toBe(doorTargetId(ROOMS[index]?.project_id ?? ''))
    }
  })

  it('[FE-W12-S15] 反向控制：站在出生點誰都選不到', async () => {
    // ⚠️ **這是 `range` 的上界。** 出生點到最近的看板是 5.5 個單位 ——
    // 少了這一條，把 `range` 改成 6 也會讓上面每一條全綠，
    // 而那的意思是「一出生畫面上就掛著『按 E 看專案看板』」。
    expect(await targetAt({ x: SPAWN.x, z: SPAWN.z, f: FACING.up })).toBe(null)
  })
})
