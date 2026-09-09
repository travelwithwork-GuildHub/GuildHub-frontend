import { describe, expect, it } from 'vitest'
import {
  definitionFor,
  duplicateIds,
  outOfBounds,
  staticBoxFor,
  staticBoxesFor,
  zoneProblems,
  WORLD_HALF_EXTENT,
} from '@/world/layout/geometry'
import type { LayoutItem, Zone } from '@/world/layout/types'
import { footprintOf } from '@/world/environment/definition'

// 規格：openspec/changes/fe-w11-guild-hall/specs/world-layout/spec.md
//   Requirement: 配置是一份資料，渲染與碰撞吃同一份 —— FE-W11-S02 / S04 / S05
//   Requirement: 遊玩區域的尺寸只有一個來源 —— FE-W11-S07
//   Requirement: 分區是具名的矩形 —— FE-W11-S09
//
// ⚠️ **這一支不碰 Rapier、不渲染。** 幾何算錯與 React 沒掛載混在一起的話，
// 紅燈說不出是哪一個（change 的 tasks 1.8）。

const desk = (over: Partial<LayoutItem> = {}): LayoutItem =>
  ({ id: 'desk-1', kind: 'desk', x: 0, z: 0, ...over }) as LayoutItem

describe('配置推導出來的碰撞', () => {
  it('[FE-W11-S02] 會擋路的配置項產生碰撞體，位置是局部描述套上擺放', () => {
    const local = footprintOf(definitionFor(desk()))
    expect(local, '桌子應該有碰撞描述').toBeDefined()

    const box = staticBoxFor(desk({ x: 3, z: -2 } as Partial<LayoutItem>))
    expect(box).toBeDefined()
    // 位置＝擺放位置 ＋ 局部偏移；尺寸不變。
    expect(box?.x).toBeCloseTo(3 + (local?.offsetX ?? 0), 6)
    expect(box?.z).toBeCloseTo(-2 + (local?.offsetZ ?? 0), 6)
    expect(box?.halfWidth).toBeCloseTo(local?.halfWidth ?? 0, 6)
    expect(box?.halfDepth).toBeCloseTo(local?.halfDepth ?? 0, 6)
  })

  it('[FE-W11-S03] 沒有碰撞描述的配置項不產生碰撞體', () => {
    const carpet: LayoutItem = { id: 'rug', kind: 'carpet', x: 1, z: 1, width: 3, depth: 2 }
    const door: LayoutItem = { id: 'door-1', kind: 'door', x: 0, z: 5 }
    expect(staticBoxFor(carpet), '地毯不擋路').toBeUndefined()
    expect(staticBoxFor(door), '門是牆上的一個洞（FE-W10-S14）').toBeUndefined()
    // 它們也不該出現在整份清單裡。
    expect(staticBoxesFor([carpet, door, desk()])).toHaveLength(1)
  })

  it('[FE-W11-S04] 旋轉 90° 的配置項，碰撞盒跟著轉', () => {
    const straight = staticBoxFor(desk())
    const turned = staticBoxFor(desk({ turns: 1 } as Partial<LayoutItem>))
    expect(straight?.halfWidth).not.toBeCloseTo(straight?.halfDepth ?? 0, 3)
    expect(turned?.halfWidth, '90° 沒有交換半寬與半深').toBeCloseTo(straight?.halfDepth ?? 0, 6)
    expect(turned?.halfDepth).toBeCloseTo(straight?.halfWidth ?? 0, 6)

    // 位置也要繞元件原點轉：(x, z) → (z, -x)
    const offset = staticBoxFor({ id: 'w', kind: 'wall', x: 0, z: 0, length: 4, turns: 1 })
    const flat = staticBoxFor({ id: 'w', kind: 'wall', x: 0, z: 0, length: 4 })
    expect(offset?.halfWidth).toBeCloseTo(flat?.halfDepth ?? 0, 6)
  })

  it('[FE-W11-S05] 識別字不重複', () => {
    expect(duplicateIds([desk(), { ...desk(), id: 'desk-2' } as LayoutItem])).toEqual([])
    expect(duplicateIds([desk(), desk()]), '同一個 id 出現兩次應該被抓到').toEqual(['desk-1'])
  })

  it('[FE-W11-S07] 碰撞盒超出遊玩區域時被抓出來', () => {
    expect(outOfBounds([desk()])).toEqual([])
    // 半徑 12 的世界，桌子擺在 x = 11.9 會超出去（桌子半寬 0.8）。
    expect(outOfBounds([desk({ id: 'far', x: WORLD_HALF_EXTENT - 0.1 } as Partial<LayoutItem>)]))
      .toEqual(['far'])
    // ⚠️ 沒有碰撞描述的東西不參與這條 —— 地毯可以貼著邊。
    expect(outOfBounds([{ id: 'rug', kind: 'carpet', x: 99, z: 0, width: 1, depth: 1 }])).toEqual([])
  })

  it('[FE-W11-S09] 分區都在區域內且彼此不重疊', () => {
    const ok: Zone[] = [
      { id: 'boards', x: -5, z: 0, halfWidth: 3, halfDepth: 3 },
      { id: 'social', x: 5, z: 0, halfWidth: 3, halfDepth: 3 },
    ]
    expect(zoneProblems(ok)).toEqual([])
    expect(zoneProblems([{ id: 'boards', x: 20, z: 0, halfWidth: 3, halfDepth: 3 }]))
      .toEqual(['分區 boards 超出遊玩區域'])
    expect(zoneProblems([ok[0]!, { ...ok[1]!, x: -4 }])).toEqual(['分區 boards 與 social 重疊'])
    // 邊界相接不算重疊 —— 兩個分區可以共用一條界線。
    expect(zoneProblems([ok[0]!, { ...ok[1]!, x: 1 }])).toEqual([])
  })

  it('未列舉的種類拋錯', () => {
    expect(() => definitionFor({ id: 'x', kind: 'sofa', x: 0, z: 0 } as unknown as LayoutItem))
      .toThrow(/sofa/)
  })
})
