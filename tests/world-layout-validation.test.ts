import { describe, expect, it } from 'vitest'
import { LAYOUT, SPAWN, STANCES, ZONES } from '@/world/layout/guildHallLayout'
import { staticBoxesFor, visualBoxFor, WORLD_HALF_EXTENT } from '@/world/layout/geometry'
import { cellsOf, isReachable, reachableFrom, standableIn } from '@/world/layout/reachability'
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

  it('[FE-W11-S10] 比角色還窄的縫走不過去', () => {
    // ⚠️ **這條在驗「障礙物有沒有依角色半徑膨脹」。**
    // 實測：把膨脹拿掉，上面每一條都照樣綠 —— 因為真的配置裡最窄的通道是 1.8，
    // 角色縮成一個點也過得去。**那時膨脹這件事是沒有人驗過的。**
    const gap = 0.3 // 角色直徑是 0.5
    const wall: StaticBox[] = [
      { x: 0, z: -5, halfWidth: 0.25, halfDepth: 5 - gap / 2 },
      { x: 0, z: 5, halfWidth: 0.25, halfDepth: 5 - gap / 2 },
    ]
    const half = 8
    const west = { x: -3, z: 0 }
    const east = { x: 3, z: 0 }
    const radius = PHYSICS.playerRadius

    expect(isReachable(east, reachableFrom(west, wall, { half, radius })), '0.3 的縫比角色還窄，不該過得去').toBe(false)
    // 對照：把縫拉寬到角色直徑的兩倍就過得去 —— 證明這把尺不是「永遠說不通」。
    const wide: StaticBox[] = [
      { x: 0, z: -5, halfWidth: 0.25, halfDepth: 5 - 1 },
      { x: 0, z: 5, halfWidth: 0.25, halfDepth: 5 - 1 },
    ]
    expect(isReachable(east, reachableFrom(west, wide, { half, radius })), '2.0 的縫應該過得去').toBe(true)
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
      // ⚠️ **量的是視覺包圍盒，不是碰撞盒。** 看板的板面不擋路，
      // 所以它的碰撞盒只有兩根 0.9 高的柱子；看板真正是 2.3 高。
      // 用碰撞盒算的話，「頭被切掉」在畫面上看得到，而測試是綠的（實測）。
      const box = visualBoxFor(board)
      expect(box, `${board.id} 沒有包圍盒 —— 這條會恆真`).toBeDefined()
      expect((box?.halfHeight ?? 0) * 2, `${board.id} 的視覺高度看起來像只有柱子`)
        .toBeGreaterThan(1.5)
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

// ─────────────────────────────────────────────────────────────────────
// 封存前由外部審查逼出來的三條。它們共同的形狀是
// **把「只驗幾個代表點」換成「把整個可走區域掃一遍」** ——
// 代表點會漏掉分區裡的死角，而 BFS 的格子本來就已經算好了。

describe('封存前補上的覆蓋', () => {
  const reached = reachableFrom(SPAWN, BOXES, REACH)

  it('[FE-W11-S10] 分區裡沒有走不進去的死角', () => {
    // 只驗代表點的話，分區裡包著一塊到不了的地方是看不出來的。
    for (const zone of ZONES) {
      const standable = standableIn(zone, BOXES, PHYSICS.playerRadius)
      expect(standable.length, `分區 ${zone.id} 裡一個站得下的格子都沒有`).toBeGreaterThan(100)
      const unreachable = standable.filter((c) => !isReachable(c, reached))
      expect(unreachable.length, `分區 ${zone.id} 裡有 ${unreachable.length} 格站得下卻走不到`).toBe(0)
    }
  })

  it('[FE-W11-S13] 整個可走區域裡，角色都不會被家具擋住', () => {
    // ⚠️ **牆不算。** 任何一面牆都會遮住站在它北側緊鄰處的角色 ——
    // 那是牆的本質，不是缺陷（design D5）。這條掃的是**家具與擺設**。
    const notWalls = LAYOUT.filter((i) => i.kind !== 'wall')
      .flatMap((i) => {
        const box = staticBoxesFor([i])
        return box.length > 0 ? box : []
      })
    expect(notWalls.length, '一個非牆的碰撞盒都沒有 —— 這條是空的').toBeGreaterThan(5)

    const sample = cellsOf(reached, 10) // 每 1 個世界單位取一點
    expect(sample.length, '取樣點太少').toBeGreaterThan(50)
    // ⚠️ **忽略比角色還窄的東西。** 實測掃出來的三個「遮擋」全部是細桿：
    // 旗桿 0.08 寬、招牌柱 0.1、側放的書架 0.4 —— 角色是 0.5。
    // 一根比角色還細的柱子只蓋掉一條縫，不是「被擋住」；
    // 硬要求連細桿都不能在視線上，判準會逼人把所有立柱貼到牆上。
    const width = PHYSICS.playerRadius * 2
    const blockedViews = sample.filter((cell) => occluders(cell, notWalls, 1, width).length > 0)
    expect(blockedViews.length, `有 ${blockedViews.length} 個站得到的位置被家具擋住視線`).toBe(0)

    // 防恆真：一個跟角色一樣寬、夠高的東西放在取樣點的 +Z 側要被抓到。
    const blocker: StaticBox = { x: sample[0]!.x, z: sample[0]!.z + 2, halfWidth: 0.6, halfDepth: 0.4, halfHeight: 1.5 }
    expect(occluders(sample[0]!, [blocker], 1, width).length, '寬的障礙物沒有被抓到').toBe(1)
  })

  it('配置裡沒有兩個東西的碰撞盒疊在一起', () => {
    // 「椅子塞進桌子裡」這種資料錯誤在畫面上看得出來，但沒有機器在看。
    // ⚠️ **邊界牆的四個角本來就互相重疊** —— 那是把角封起來的方式。
    const solid = LAYOUT.map((item) => ({ item, box: staticBoxesFor([item])[0] })).filter(
      (e) => e.box !== undefined,
    )
    expect(solid.length, '一個碰撞盒都沒有').toBeGreaterThan(10)

    const isBoundary = (i: (typeof LAYOUT)[number]) => i.kind === 'wall' && i.role === 'boundary'
    const clashes: string[] = []
    for (let i = 0; i < solid.length; i += 1) {
      for (let j = i + 1; j < solid.length; j += 1) {
        const a = solid[i]!
        const b = solid[j]!
        if (isBoundary(a.item) && isBoundary(b.item)) continue
        const overlapX = a.box!.halfWidth + b.box!.halfWidth - Math.abs(a.box!.x - b.box!.x)
        const overlapZ = a.box!.halfDepth + b.box!.halfDepth - Math.abs(a.box!.z - b.box!.z)
        // 邊緣相接（重疊 0）不算 —— 兩張桌子並排是合法的。
        if (overlapX > 1e-6 && overlapZ > 1e-6) clashes.push(`${a.item.id} × ${b.item.id}`)
      }
    }
    expect(clashes, '這些東西疊在一起了').toEqual([])
  })
})
