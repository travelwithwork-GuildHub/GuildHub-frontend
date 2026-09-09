import { describe, expect, it } from 'vitest'
import { LAYOUT, SPAWN, STANCES, ZONES } from '@/world/layout/guildHallLayout'
import { staticBoxesFor, WORLD_HALF_EXTENT } from '@/world/layout/geometry'
import { isReachable, reachableFrom } from '@/world/layout/reachability'
import { boxOnScreen, groundOverscan, isOnScreen, occluders, screenHalfExtents } from '@/world/layout/framing'
import { PHYSICS, type StaticBox } from '@/world/physics/world'

// 規格：openspec/changes/fe-w11-guild-hall/specs/world-layout/spec.md
//   Requirement: 每一個分區都走得到 —— FE-W11-S10 / S11
//   Requirement: 固定相機下的構圖成立 —— FE-W11-S12 / S13 / S14

const BOXES = staticBoxesFor(LAYOUT)
const REACH = { half: WORLD_HALF_EXTENT, radius: PHYSICS.playerRadius }

/** 每一個分區的代表點：落在它裡面的站位。**不能用分區的中心** —— 實測
 *  Board 區的中心正好是招牌的柱子，那不是「走不到 Board 區」的證據。 */
function stancesIn(zone: (typeof ZONES)[number]) {
  return STANCES.filter(
    (s) => Math.abs(s.x - zone.x) <= zone.halfWidth && Math.abs(s.z - zone.z) <= zone.halfDepth,
  )
}

describe('每一個分區都走得到', () => {
  it('[FE-W11-S10] 出生點到每一個分區的代表點都走得到', () => {
    const reached = reachableFrom(SPAWN, BOXES, REACH)
    expect(reached.size, '從出生點一格都走不到 —— 出生在障礙物裡？').toBeGreaterThan(1000)

    for (const zone of ZONES) {
      const inside = stancesIn(zone)
      expect(inside.length, `分區 ${zone.id} 裡沒有任何代表站位 —— 這條對它恆真`).toBeGreaterThan(0)
      for (const stance of inside) {
        expect(isReachable(stance, reached), `走不到 ${zone.id} 的 ${stance.id}`).toBe(true)
      }
    }
  })

  it('[FE-W11-S10] 把走廊整個圍起來時，這條判準會失敗', () => {
    // ⚠️ **沒有這一條，上面那條可能只是「世界很空」。**
    //
    // ⚠️ 圍的是**整條線**不是只有那個開口 —— 實測：只堵開口的話走廊照樣走得到，
    // 因為隔牆只涵蓋 z ∈ [-3, 9]，北端與南端本來就是開的（那是刻意的，
    // 一個分區有兩個入口比較不容易被一段牆封死）。
    // **只堵一個入口就宣稱「封死了」，是一把量錯東西的尺。**
    const sealed: StaticBox[] = [
      ...BOXES,
      { x: -6, z: 0, halfWidth: 0.25, halfDepth: WORLD_HALF_EXTENT },
    ]
    const reached = reachableFrom(SPAWN, sealed, REACH)
    const corridor = ZONES.find((z) => z.id === 'corridor')
    const stance = stancesIn(corridor!)[0]
    expect(isReachable(stance!, reached), '開口被封住了，走廊卻還是走得到').toBe(false)
  })

  it('[FE-W11-S11] 通道明顯寬於角色直徑', () => {
    // 走廊隔牆的開口是配置裡最窄的通道。**不去證明「剛好過得去」** ——
    // 那種通道真的走起來會一直卡住。
    const walls = LAYOUT.filter((i) => i.kind === 'wall' && i.id.startsWith('wall-corridor-'))
    expect(walls.length, '走廊隔牆應該是兩段（中間是開口）').toBe(2)
    const boxes = walls.map((w) => staticBoxesFor([w])[0]!)
    const [a, b] = boxes.sort((p, q) => p.z - q.z)
    const gap = b!.z - b!.halfDepth - (a!.z + a!.halfDepth)
    expect(gap, '開口比角色直徑還窄').toBeGreaterThan(PHYSICS.playerRadius * 2)
    expect(gap, '開口沒有明顯寬於角色直徑（設計約束：至少 1.0）').toBeGreaterThanOrEqual(1)
  })
})

describe('固定相機下的構圖', () => {
  it('[FE-W11-S12] 出生時兩個看板都在畫面內', () => {
    const boards = LAYOUT.filter((i) => i.kind === 'projectBoard' || i.kind === 'talentBoard')
    expect(boards.length, '兩個看板').toBe(2)
    for (const board of boards) {
      const box = staticBoxesFor([board])[0]
      expect(box, `${board.id} 沒有碰撞盒 —— 這條會恆真`).toBeDefined()
      expect(boxOnScreen(box!, SPAWN), `${board.id} 有一部分在畫面外`).toBe(true)
    }
    // 防恆真：畫面外的東西要判成 false。
    const far = { x: 0, y: 0, z: SPAWN.z - 40 }
    expect(isOnScreen(far, SPAWN)).toBe(false)
  })

  it('[FE-W11-S13] 關鍵站位上角色不被靜態物件遮住', () => {
    expect(STANCES.length, '一個站位都沒有 —— 這條是空的').toBeGreaterThan(3)
    for (const stance of STANCES) {
      expect(occluders(stance, BOXES), `${stance.id} 的視線被擋住了`).toEqual([])
    }
  })

  it('[FE-W11-S13] 在站位的 +Z 側放一根夠高的柱子時，這條判準會失敗', () => {
    const pillar: StaticBox = { x: SPAWN.x, z: SPAWN.z + 2, halfWidth: 0.4, halfDepth: 0.4, halfHeight: 1.5 }
    expect(occluders(SPAWN, [pillar]).length, '柱子沒有被判成遮擋').toBe(1)
    // 同一根柱子放在 -Z 側（相機的另一邊）不該算遮擋。
    const behind: StaticBox = { ...pillar, z: SPAWN.z - 2 }
    expect(occluders(SPAWN, [behind])).toEqual([])
  })

  it('[FE-W11-S14] 走到極端位置時畫面上仍然是地板', () => {
    const reachable = WORLD_HALF_EXTENT - PHYSICS.playerRadius
    const overscan = groundOverscan(reachable)
    const { halfWidth, halfHeight } = screenHalfExtents()

    // 螢幕四角反投影到地面：X 偏移 halfWidth、Z 偏移 halfHeight × √2。
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const corner = {
          x: sx * reachable + sx * halfWidth,
          z: sz * reachable - sz * halfHeight * Math.SQRT2,
        }
        expect(Math.abs(corner.x), '畫面角落落在視覺地板外面').toBeLessThanOrEqual(overscan)
        expect(Math.abs(corner.z), '畫面角落落在視覺地板外面').toBeLessThanOrEqual(overscan)
      }
    }
    // 防恆真：沒有 overscan（地板只有遊玩區域那麼大）時要不成立。
    expect(reachable + halfWidth, '沒有 overscan 的話畫面角落會超出地板')
      .toBeGreaterThan(WORLD_HALF_EXTENT)
  })
})
