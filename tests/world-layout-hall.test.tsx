import { describe, expect, it } from 'vitest'
import ReactThreeTestRenderer from '@react-three/test-renderer'
import type {} from '@react-three/fiber'
import { Vector3, type Mesh, type Object3D } from 'three'
import { GuildHall } from '@/world/layout/GuildHall'
import { LAYOUT, SPAWN, STANCES, ZONES } from '@/world/layout/guildHallLayout'
import {
  definitionFor,
  duplicateIds,
  outOfBounds,
  staticBoxFor,
  staticBoxesFor,
  zoneProblems,
  WORLD_HALF_EXTENT,
} from '@/world/layout/geometry'

// 規格：openspec/changes/fe-w11-guild-hall/specs/world-layout/spec.md
//   Requirement: 配置是一份資料 —— FE-W11-S01 / S05
//   Requirement: 遊玩區域的尺寸只有一個來源 —— FE-W11-S07
//   Requirement: 分區是具名的矩形 —— FE-W11-S09
//
// ⚠️ 上一刀（`world-layout-geometry`）用 fixture 驗那些檢查函式**本身**會不會抓錯；
// 這一支把它們套到**真的配置**上。兩邊都要有，少了任一邊都會有洞：
// 只有 fixture 的話，真的資料可以是壞的；只有真資料的話，檢查函式壞了也是綠的。

describe('Guild Hall 的配置', () => {
  it('[FE-W11-S05] 真的配置裡沒有重複的識別字', () => {
    expect(LAYOUT.length, '配置是空的 —— 下面每一條都恆真').toBeGreaterThan(10)
    expect(duplicateIds(LAYOUT)).toEqual([])
  })

  it('[FE-W11-S07] 真的配置沒有把東西擺到區域外面', () => {
    expect(staticBoxesFor(LAYOUT).length, '一個碰撞盒都沒推導出來').toBeGreaterThan(0)
    expect(outOfBounds(LAYOUT)).toEqual([])
  })

  it('[FE-W11-S09] 真的分區都在區域內且彼此不重疊', () => {
    expect(ZONES.length).toBe(3)
    expect(zoneProblems(ZONES)).toEqual([])
  })

  it('出生點與代表站位都不在任何靜態障礙物裡', () => {
    // 出生在牆裡的話，角色一開始就被推開 —— 那在畫面上看起來像「傳送」。
    const boxes = staticBoxesFor(LAYOUT)
    const points = [{ id: 'spawn', ...SPAWN }, ...STANCES]
    for (const p of points) {
      for (const box of boxes) {
        const inside =
          Math.abs(p.x - box.x) < box.halfWidth && Math.abs(p.z - box.z) < box.halfDepth
        expect(inside, `${p.id} 落在一個靜態障礙物裡`).toBe(false)
      }
    }
    expect(points.length).toBeGreaterThan(1)
  })
})

describe('Guild Hall 的渲染', () => {
  it('[FE-W11-S01] 每一個配置項都被渲染出來，位置與配置一致', async () => {
    const renderer = await ReactThreeTestRenderer.create(<GuildHall />)
    const scene = renderer.scene.instance as Object3D
    scene.updateMatrixWorld(true)

    // 每一項是一個 group，底下是它 definition 的部件。
    expect(scene.children.length, '渲染出來的項目數跟配置對不上').toBe(LAYOUT.length)

    let meshes = 0
    scene.traverse((o) => {
      if ((o as Mesh).isMesh) meshes += 1
    })
    const expected = LAYOUT.reduce((n, item) => n + definitionFor(item).parts.length, 0)
    expect(meshes, '有配置項沒有把它的部件都渲染出來').toBe(expected)

    // 位置：每一個 group 的世界座標等於配置寫的。
    for (const [i, item] of LAYOUT.entries()) {
      const group = scene.children[i]
      const at = group?.getWorldPosition(new Vector3()) ?? new Vector3()
      expect(at.x, `${item.id} 的 X 位置不對`).toBeCloseTo(item.x, 5)
      expect(at.z, `${item.id} 的 Z 位置不對`).toBeCloseTo(item.z, 5)
    }
  })

  it('[FE-W11-S06] 邊界牆從同一個尺寸常數推導', () => {
    // 靠 `role` 認邊界，不是靠 id 的開頭 —— 字串比對改個名字就靜默失效。
    const boundaries = LAYOUT.filter((i) => i.kind === 'wall' && i.role === 'boundary')
    expect(boundaries.length, '四面邊界牆').toBe(4)
    for (const wall of boundaries) {
      const box = staticBoxFor(wall)
      // 牆的**內側面**要貼齊遊玩區域的邊界。
      const inner = Math.max(
        Math.abs(box?.x ?? 0) - (box?.halfWidth ?? 0),
        Math.abs(box?.z ?? 0) - (box?.halfDepth ?? 0),
      )
      expect(inner, `${wall.id} 的內側面沒有貼齊遊玩區域`).toBeCloseTo(WORLD_HALF_EXTENT, 6)
    }
  })
})
