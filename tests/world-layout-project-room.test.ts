import { beforeAll, describe, expect, it } from 'vitest'
import type RAPIER_NS from '@dimforge/rapier3d-compat'
import { duplicateIds, outOfBounds, staticBoxesFor, visualBoxFor, WORLD_HALF_EXTENT } from '@/world/layout/geometry'
import {
  AISLE_CENTER_X,
  ENTRY,
  ROOM_LAYOUT,
  ROOM_POINTS,
  ROOM_SPAWN,
  SEAT_INDICES,
  STATIONS,
  stationAt,
} from '@/world/layout/projectRoomLayout'
import { LAYOUT as HALL_LAYOUT } from '@/world/layout/guildHallLayout'
import { boxOnScreen, isOnScreen, occluders, screenWidthOf } from '@/world/layout/framing'
import { isReachable, reachableFrom } from '@/world/layout/reachability'
import type { LayoutItem } from '@/world/layout/types'
import { createPhysicsWorld, PHYSICS, type StaticBox } from '@/world/physics/world'

// Project Room 的配置。規格 `FE-V01-S02`（`world-layout` 對 Guild Hall 跑的三條判準同樣跑在這份上）、
// `FE-W16-S01`／`S02`（出口與可達性）、`S03`（八個工位模板）、`S05`（構圖與視線）。
//
// ⚠️ 每一條「拔掉什麼會紅」的突變都在這裡有對照組 —— 世界很空的時候「都走得到」是恆真的。

let RAPIER: typeof RAPIER_NS
beforeAll(async () => {
  RAPIER = await import('@dimforge/rapier3d-compat')
  await RAPIER.init()
})

const BOXES = staticBoxesFor(ROOM_LAYOUT)
const RADIUS = PHYSICS.playerRadius
const DIAMETER = RADIUS * 2
const REACH = { half: WORLD_HALF_EXTENT, radius: RADIUS }
const byId = (id: string) => ROOM_LAYOUT.find((item) => item.id === id)
/** 把門洞封住的那一段牆（對照組）。 */
const GAP_PLUG: StaticBox = { x: ENTRY.doorX, z: ENTRY.wallZ, halfWidth: ENTRY.gapWidth / 2, halfDepth: PHYSICS.wallThickness / 2 }

describe('Project Room 的配置通過 world-layout 的判準', () => {
  it('[FE-V01-S02] 外層邊界恰好四面，但配置不只邊界；碰撞盒多於四面', () => {
    const boundary = ROOM_LAYOUT.filter((item) => item.kind === 'wall' && item.role === 'boundary')
    expect(boundary.length).toBe(4)
    expect(ROOM_LAYOUT.length).toBeGreaterThan(4)
    expect(BOXES.length, '交給物理層的碰撞盒要含內側南牆與桌椅').toBeGreaterThan(4)
    // 邊界跟 Guild Hall 吃同一份推導（`FE-W11-S06`）。
    expect(HALL_LAYOUT.filter((item) => item.kind === 'wall' && item.role === 'boundary')).toEqual(boundary)
  })

  it('[FE-V01-S02] FE-W11-S05／S07：識別字不重複、沒有東西擺到區域外面', () => {
    expect(duplicateIds(ROOM_LAYOUT)).toEqual([])
    expect(outOfBounds(ROOM_LAYOUT)).toEqual([])
  })

  it('[FE-V01-S02] FE-W11-S08：物理世界裡的碰撞體恰好是配置產生的那些', () => {
    const world = createPhysicsWorld(RAPIER, { staticBoxes: BOXES })
    expect(world.world.colliders.len()).toBe(BOXES.length + 1)
  })
})

describe('從門口進來', () => {
  it('[FE-W16-S01] 出生點安全；通道、八個站位、門廊都走得到', () => {
    const reached = reachableFrom(ROOM_SPAWN, BOXES, REACH)
    expect(reached.size, '從出生點一格都走不到 —— 出生在障礙物裡？').toBeGreaterThan(1000)
    expect(STATIONS.length, '工位數是 0 的話下面恆真').toBe(8)
    expect(isReachable(ROOM_POINTS.aisle, reached), '走不到通道').toBe(true)
    for (const station of STATIONS) {
      expect(isReachable(station, reached), `走不到 ${station.id}`).toBe(true)
    }
    expect(isReachable(ROOM_POINTS.porch, reached), '走不到門廊').toBe(true)
  })

  it('[FE-W16-S01] 突變：把門洞封住，門廊就走不到', () => {
    const reached = reachableFrom(ROOM_SPAWN, [...BOXES, GAP_PLUG], REACH)
    expect(isReachable(ROOM_POINTS.aisle, reached), '封門不該影響通道').toBe(true)
    expect(isReachable(ROOM_POINTS.porch, reached), '門洞封住了，門廊卻還走得到').toBe(false)
  })

  it('[FE-W16-S02] 門洞是內側南牆唯一的通路，而且淨寬不小於角色直徑的 2 倍', () => {
    const walls = ROOM_LAYOUT.filter((item) => item.kind === 'wall' && item.role !== 'boundary')
    expect(walls.length, '內側南牆應該是兩段').toBe(2)
    const [west, east] = walls.map((wall) => staticBoxesFor([wall])[0]!).sort((a, b) => a.x - b.x)
    const gap = east!.x - east!.halfWidth - (west!.x + west!.halfWidth)
    expect(gap, '門洞淨寬').toBeGreaterThanOrEqual(DIAMETER * 2)
    expect(gap).toBeCloseTo(ENTRY.gapWidth, 6)
  })

  it('[FE-W16-S02] 外層南邊界完整：門廊裡向南走不出遊玩區域（搜尋域延伸到邊界外）', () => {
    const wide = { half: WORLD_HALF_EXTENT + 2, radius: RADIUS }
    const outside = { x: ENTRY.doorX, z: WORLD_HALF_EXTENT + 1.5 }
    const reached = reachableFrom(ROOM_SPAWN, BOXES, wide)
    expect(isReachable(ROOM_POINTS.porch, reached), '門廊要走得到').toBe(true)
    expect(isReachable(outside, reached), '走出外層南邊界了').toBe(false)
    // 對照：拿掉外層南牆，同一個點要變成可達 —— 證明擋住它的是 collider，不是搜尋域剛好裁在邊界上。
    const south = staticBoxFor('boundary-south')
    const without = BOXES.filter((box) => box !== south)
    expect(without.length).toBe(BOXES.length - 1)
    expect(isReachable(outside, reachableFrom(ROOM_SPAWN, without, wide)), '沒有南牆卻走不出去 —— 這條是空的').toBe(true)
  })
})

/** 配置項在世界座標下的碰撞盒（跟 `BOXES` 裡的是同一個物件）。 */
function staticBoxFor(id: string): StaticBox {
  const index = ROOM_LAYOUT.filter((item) => staticBoxesFor([item]).length > 0).findIndex((item) => item.id === id)
  return BOXES[index]!
}

describe('八個工位是穩定的模板', () => {
  it('[FE-W16-S03] 索引集合恰好 0–7、每個工位三件齊全、識別字含索引且唯一', () => {
    expect(STATIONS.length).toBe(8)
    expect(new Set(STATIONS.map((s) => s.seatIndex))).toEqual(new Set(SEAT_INDICES))
    expect(new Set(STATIONS.map((s) => s.id)).size).toBe(8)
    for (const station of STATIONS) {
      expect(station.id).toContain(String(station.seatIndex))
      const desk = byId(station.deskId)
      const chair = byId(station.chairId)
      expect(desk?.kind, `${station.id} 缺桌子`).toBe('desk')
      expect(chair?.kind, `${station.id} 缺椅子`).toBe('chair')
      expect(desk!.id).toContain(String(station.seatIndex))
      expect(chair!.id).toContain(String(station.seatIndex))
      expect(stationAt(station.seatIndex), '同一索引永遠是同一位置').toEqual(station)
    }
    expect(() => stationAt(8)).toThrow()
  })

  it('[FE-W16-S03] 0–3 在西、4–7 在東、各自由南到北；站位在桌子與通道之間；椅子在靠牆側', () => {
    for (const station of STATIONS) {
      const desk = byId(station.deskId) as LayoutItem
      const chair = byId(station.chairId) as LayoutItem
      const west = station.seatIndex < 4
      expect(west ? desk.x < AISLE_CENTER_X : desk.x > AISLE_CENTER_X, `${station.id} 在錯的那一側`).toBe(true)
      // 站位在桌子與通道中線之間；椅子比桌子更靠外牆。
      expect(Math.abs(station.x)).toBeLessThan(Math.abs(desk.x))
      expect(Math.sign(station.x)).toBe(Math.sign(desk.x))
      expect(Math.abs(chair.x)).toBeGreaterThan(Math.abs(desk.x))
    }
    for (const side of [[0, 1, 2, 3], [4, 5, 6, 7]]) {
      const zs = side.map((i) => stationAt(i).z)
      for (let k = 1; k < zs.length; k += 1) expect(zs[k]!, `索引 ${side[k]} 沒有比 ${side[k - 1]} 更北`).toBeLessThan(zs[k - 1]!)
    }
    // 0 與 4 是離門口最近的一對（南是 +z）。
    const others = STATIONS.filter((s) => s.seatIndex !== 0 && s.seatIndex !== 4)
    expect(Math.min(stationAt(0).z, stationAt(4).z)).toBeGreaterThan(Math.max(...others.map((s) => s.z)))
  })

  it('[FE-W16-S03] 八個站位兩兩距離不小於角色直徑的 2 倍', () => {
    for (let i = 0; i < STATIONS.length; i += 1) {
      for (let j = i + 1; j < STATIONS.length; j += 1) {
        const a = STATIONS[i]!
        const b = STATIONS[j]!
        expect(Math.hypot(a.x - b.x, a.z - b.z), `${a.id} 與 ${b.id} 太近`).toBeGreaterThanOrEqual(DIAMETER * 2)
      }
    }
  })
})

describe('從門口用固定相機看得到工位區與通道', () => {
  const stances = [{ id: 'spawn', ...ROOM_SPAWN }, ...STATIONS]
  const CHEST = 0.5
  /** 視線要過的東西：靜態碰撞盒**加上門的視覺盒** —— 門板沒有 collider 但它是不透明的，站在門後面一樣被擋住。 */
  const OPAQUE = [...BOXES, visualBoxFor(byId(ENTRY.doorId)!)!]

  it('[FE-W16-S05] 出生點看得到至少一個完整的工位、通道入口與門洞', () => {
    const whole = STATIONS.filter((s) =>
      [s.deskId, s.chairId].every((id) => boxOnScreen(visualBoxFor(byId(id)!)!, ROOM_SPAWN)),
    )
    expect(whole.length, '出生點看不到任何完整的工位').toBeGreaterThan(0)
    expect(isOnScreen({ ...ROOM_POINTS.aisleEntry, y: 0 }, ROOM_SPAWN), '通道入口在畫面外').toBe(true)
    const door = byId(ENTRY.doorId)!
    expect(door.kind).toBe('door')
    expect(boxOnScreen(visualBoxFor(door)!, ROOM_SPAWN), '門洞在畫面外').toBe(true)
    // 防恆真：遠處的點要判成畫面外。
    expect(isOnScreen({ x: 0, y: 0, z: ROOM_SPAWN.z - 40 }, ROOM_SPAWN)).toBe(false)
  })

  it('[FE-W16-S05] 出生點離內側南牆夠遠：視線在牆處的高度大於牆高', () => {
    const wallNorthFace = ENTRY.wallZ - PHYSICS.wallThickness / 2
    const d = wallNorthFace - ROOM_SPAWN.z
    expect(d).toBeGreaterThan(0)
    expect(CHEST + 11.5 * (d / 12), '視線越不過內側南牆').toBeGreaterThan(PHYSICS.wallHeight)
  })

  it('[FE-W16-S05] 出生點與八個站位的視線都不被靜態物件擋住', () => {
    expect(stances.length).toBe(9)
    for (const stance of stances) {
      expect(occluders(stance, OPAQUE, CHEST), `${stance.id} 的視線被擋住了`).toEqual([])
    }
  })

  it('[FE-W16-S05] 門造型的橫向輪廓不小於角色直徑的投影', () => {
    const door = byId(ENTRY.doorId)!
    expect(screenWidthOf(visualBoxFor(door)!)).toBeGreaterThanOrEqual(DIAMETER)
    // 突變：轉成東西向就只剩一條細縫。
    expect(screenWidthOf(visualBoxFor({ ...door, turns: 1 })!)).toBeLessThan(DIAMETER)
  })

  it('[FE-W16-S05] 突變：視線段上放盒子、出生點貼近內側南牆，視線那段要紅', () => {
    const block: StaticBox = { x: ROOM_SPAWN.x, z: ROOM_SPAWN.z + 2, halfWidth: 0.4, halfDepth: 0.4, halfHeight: 1.5 }
    expect(occluders(ROOM_SPAWN, [...OPAQUE, block], CHEST).length).toBeGreaterThan(0)
    const nearWall = { x: ENTRY.doorX, z: ENTRY.wallZ - 1 }
    expect(occluders(nearWall, OPAQUE, CHEST).length, '離門 1 單位視線應該被門板擋住').toBeGreaterThan(0)
  })
})
