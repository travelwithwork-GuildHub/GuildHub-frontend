import type { BoxFootprint, PropDefinition } from '../environment/definition'
import { footprintOf, rotateFootprint, visualBoundsOf } from '../environment/definition'
import { furnitureDefinition, FURNITURE_KINDS, type FurnitureKind } from '../environment/furnitureProps'
import { carpetDefinition, platformDefinition, wallDefinition } from '../environment/structural'
import {
  doorDefinition,
  guildBannerDefinition,
  projectBoardDefinition,
  signDefinition,
  talentBoardDefinition,
} from '../environment/semantic'
import { PHYSICS, type StaticBox } from '../physics/world'
import type { LayoutItem, Zone } from './types'

// 配置 → 幾何。規格 `FE-W11-S02`／`S04`／`S05`／`S07`／`S09`。
//
// ⚠️ **這裡不建立任何 Rapier 物件。** 它回的是 `StaticBox`（純資料），
// 誰把它交給物理世界是呼叫端的事 —— 見 change 的 design D3。

/** 牆的預設厚度與高度：沿用物理邊界的值，**不另外寫一組數字**。 */
const WALL = { height: PHYSICS.wallHeight, thickness: PHYSICS.wallThickness } as const

/** 一個配置項對應的元件描述。未列舉的種類拋錯 —— 型別擋得住打字，擋不住 `as any`。 */
export function definitionFor(item: LayoutItem): PropDefinition {
  switch (item.kind) {
    case 'wall':
      return wallDefinition(item.length, WALL.height, WALL.thickness)
    case 'carpet':
      return carpetDefinition(item.width, item.depth)
    case 'platform':
      return platformDefinition(item.width, item.depth, item.height)
    case 'sign':
      return signDefinition()
    case 'guildBanner':
      return guildBannerDefinition()
    case 'projectBoard':
      return projectBoardDefinition()
    case 'talentBoard':
      return talentBoardDefinition()
    case 'door':
      return doorDefinition()
    default: {
      const kind: FurnitureKind = item.kind
      if (!(FURNITURE_KINDS as readonly string[]).includes(kind)) {
        throw new Error(`配置裡出現了不認得的種類「${String(kind)}」。`)
      }
      return furnitureDefinition(kind)
    }
  }
}

/**
 * 一個配置項在世界座標下的碰撞盒。**沒有碰撞描述的元件回 `undefined`** ——
 * 地毯與門就是那種（門是牆上的一個洞，見 `FE-W10-S14`）。
 *
 * 做法是把元件的**局部**描述先旋轉、再平移。
 * `world-environment` 明訂元件不知道自己被放在哪裡，那個「哪裡」在這裡才加上去。
 */
export function staticBoxFor(item: LayoutItem): StaticBox | undefined {
  const local: BoxFootprint | undefined = footprintOf(definitionFor(item))
  if (local === undefined) return undefined
  const turned = rotateFootprint(local, item.turns ?? 0)
  return {
    x: item.x + turned.offsetX,
    z: item.z + turned.offsetZ,
    halfWidth: turned.halfWidth,
    halfDepth: turned.halfDepth,
    halfHeight: turned.halfHeight,
  }
}

/**
 * 一個配置項在世界座標下**看得見的**包圍盒。
 *
 * ⚠️ **不要拿碰撞盒去問構圖。** 看板的板面不擋路，所以它的碰撞盒只有兩根
 * 0.9 高的柱子；看板真正是 2.3 高。用碰撞盒算「在不在畫面內」會漏掉頭。
 */
export function visualBoxFor(item: LayoutItem): StaticBox | undefined {
  const local = visualBoundsOf(definitionFor(item))
  if (local === undefined) return undefined
  const turned = rotateFootprint(local, item.turns ?? 0)
  return {
    x: item.x + turned.offsetX,
    z: item.z + turned.offsetZ,
    halfWidth: turned.halfWidth,
    halfDepth: turned.halfDepth,
    halfHeight: turned.halfHeight,
  }
}

/** 整份配置推導出來的靜態碰撞。**這是物理世界唯一的靜態障礙物來源。** */
export function staticBoxesFor(items: readonly LayoutItem[]): StaticBox[] {
  return items.flatMap((item) => {
    const box = staticBoxFor(item)
    return box === undefined ? [] : [box]
  })
}

/** 重複的識別字。回空陣列代表沒有重複。 */
export function duplicateIds(items: readonly LayoutItem[]): string[] {
  const seen = new Set<string>()
  const dupes = new Set<string>()
  for (const item of items) {
    if (seen.has(item.id)) dupes.add(item.id)
    seen.add(item.id)
  }
  return [...dupes].sort()
}

/** 遊玩區域的半徑。**唯一的尺寸來源** —— 地板、邊界、配置的合法範圍都從它推導。 */
export const WORLD_HALF_EXTENT = PHYSICS.halfExtent

/**
 * 碰撞盒超出遊玩區域的配置項。回空陣列代表全部都在裡面。
 *
 * **兩層判準**：
 * 1. 邊界牆本來就跨在區域的邊上（內側面貼齊 `half`、外側面在外面），
 *    所以它只要不超出「世界連牆在內」的範圍就好
 * 2. 其餘每一個會擋路的東西都要**完整**落在 `±half` 之內
 *
 * ⚠️ 判斷「是不是邊界」看的是 `role`，**不是 `id` 的開頭** ——
 * 字串比對改個名字就靜默失效。
 */
export function outOfBounds(items: readonly LayoutItem[], half = WORLD_HALF_EXTENT): string[] {
  const bad: string[] = []
  for (const item of items) {
    const box = staticBoxFor(item)
    if (box === undefined) continue
    const limit = item.kind === 'wall' && item.role === 'boundary' ? half + PHYSICS.wallThickness : half
    const overX = Math.abs(box.x) + box.halfWidth > limit
    const overZ = Math.abs(box.z) + box.halfDepth > limit
    if (overX || overZ) bad.push(item.id)
  }
  return bad.sort()
}

/** 分區的問題：超出區域，或兩兩重疊。回空陣列代表沒問題。 */
export function zoneProblems(zones: readonly Zone[], half = WORLD_HALF_EXTENT): string[] {
  const problems: string[] = []
  for (const zone of zones) {
    if (Math.abs(zone.x) + zone.halfWidth > half || Math.abs(zone.z) + zone.halfDepth > half) {
      problems.push(`分區 ${zone.id} 超出遊玩區域`)
    }
  }
  for (let i = 0; i < zones.length; i += 1) {
    for (let j = i + 1; j < zones.length; j += 1) {
      const a = zones[i]
      const b = zones[j]
      if (a === undefined || b === undefined) continue
      // 邊界相接不算重疊 —— 兩個分區可以共用一條界線。
      const apart =
        Math.abs(a.x - b.x) >= a.halfWidth + b.halfWidth ||
        Math.abs(a.z - b.z) >= a.halfDepth + b.halfDepth
      if (!apart) problems.push(`分區 ${a.id} 與 ${b.id} 重疊`)
    }
  }
  return problems
}
