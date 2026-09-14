import { beforeAll, describe, expect, it } from 'vitest'
import type RAPIER_NS from '@dimforge/rapier3d-compat'
import { duplicateIds, outOfBounds, staticBoxesFor } from '@/world/layout/geometry'
import { ROOM_LAYOUT, ROOM_SPAWN } from '@/world/layout/projectRoomLayout'
import { LAYOUT as HALL_LAYOUT } from '@/world/layout/guildHallLayout'
import { createPhysicsWorld } from '@/world/physics/world'

// Project Room 在 `FE-W16` 之前的配置。規格 `FE-V01-S02`：
// `world-layout` 對 Guild Hall 跑的三條判準（`FE-W11-S05`／`S07`／`S08`）同樣跑在這份上。

let RAPIER: typeof RAPIER_NS
beforeAll(async () => {
  RAPIER = await import('@dimforge/rapier3d-compat')
  await RAPIER.init()
})

describe('Project Room 的配置', () => {
  it('[FE-V01-S02] 恰好四面邊界牆，而且是配置裡全部的項目', () => {
    expect(ROOM_LAYOUT.length).toBe(4)
    for (const item of ROOM_LAYOUT) {
      expect(item.kind).toBe('wall')
      expect('role' in item && item.role).toBe('boundary')
    }
    expect(ROOM_SPAWN).toEqual({ x: 0, z: 0 })
  })

  it('[FE-V01-S02] FE-W11-S05：識別字不重複', () => {
    expect(duplicateIds(ROOM_LAYOUT)).toEqual([])
  })

  it('[FE-V01-S02] FE-W11-S07：沒有東西擺到區域外面', () => {
    expect(staticBoxesFor(ROOM_LAYOUT).length).toBe(4)
    expect(outOfBounds(ROOM_LAYOUT)).toEqual([])
  })

  it('[FE-V01-S02] FE-W11-S08：物理世界裡的碰撞體恰好是配置產生的那些', () => {
    const boxes = staticBoxesFor(ROOM_LAYOUT)
    const world = createPhysicsWorld(RAPIER, { staticBoxes: boxes })
    expect(world.world.colliders.len()).toBe(boxes.length + 1)
  })

  it('邊界牆跟 Guild Hall 的是同一份推導（同位置、同長度）', () => {
    // 兩個場景的邊界要吃同一個尺寸來源（`FE-W11-S06`）—— 不然改了 `halfExtent` 只有一邊會動。
    const hallBoundary = HALL_LAYOUT.filter((item) => 'role' in item && item.role === 'boundary')
    expect(hallBoundary).toEqual(ROOM_LAYOUT)
  })
})
