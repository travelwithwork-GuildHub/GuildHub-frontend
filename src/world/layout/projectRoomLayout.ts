import { BOUNDARY_WALLS } from './boundary'
import { WORLD_HALF_EXTENT } from './geometry'
import type { LayoutItem } from './types'

// Project Room 的配置。規格 `FE-W16-S01`～`S05`、`FE-V01-S02`。
//
// ⚠️ **這裡是房間裡每一個東西的座標，而且是唯一的一份** —— 渲染與碰撞都吃它（`staticBoxesFor`）。
// 場景註冊表只讀 `ROOM_LAYOUT`／`ROOM_SPAWN`，不動。
//
// **座標系**：+X 右、+Z 南（相機在 +Z 側上方往回看）。**佈局**（24×24，±12）：
//
//     -Z 北  ┌──────────────────────────┐
//            │  椅 桌 ·3      ·7 桌 椅   │   工位：左 0–3、右 4–7，由南（門口）到北
//            │  椅 桌 ·2  通  ·6 桌 椅   │   「·」是站位，在桌子與通道之間
//            │  椅 桌 ·1  道  ·5 桌 椅   │
//            │  椅 桌 ·0      ·4 桌 椅   │
//            │          ⊙出生             │   出生點離內側南牆 3（視線越得過牆，design D2）
//            ├──────────┤門├─────────────┤   內側南牆，中央門洞（`door` 造型，無碰撞）
//     +Z 南  └──────────────────────────┘   門廊深 2；外層邊界完整
//
// ⚠️ **八格固定，不讀 `seat_count`**（design D3）：這是後端 `seat_index` 的索引域，
// 哪幾格對這個專案不開放是 `FE-J13` 的事。
//
// ⚠️ **桌子不是互動物件，但可入座的空位是**（原 design D4，`fe-j13-sit-walk-in` 修訂）：
// 走近可入座的空位、按 E 入座 —— 互動掛在工位的**站位**（`Station.x/z`，走得到），由 `SeatMarkers` 註冊，不是桌面。
// 桌子本身仍不註冊互動（沒有「檢視桌子」這種行為）。

/** 內側南牆與門洞。**門洞淨寬 1.8、門造型 1.58**（跟 Guild Hall 的走廊開口同一組數字，否則門框跟牆長在一起）。 */
export const ENTRY = {
  /** 內側南牆的中心 z。南面在 10，門廊是 z ∈ (10, 12)。 */
  wallZ: 9.75,
  doorX: 0,
  gapWidth: 1.8,
  doorId: 'door-entry',
} as const

/** 出生點：門洞內側往北 3 —— 相機在南方 12、高 12，視線在牆處的高度是 `0.5 + 11.5·d/12`，d 要 > 1.57 才越得過 2 高的牆。 */
export const ROOM_SPAWN = { x: ENTRY.doorX, z: ENTRY.wallZ - 3 } as const

/**
 * 穿門即走的觸發區（`FE-V01-S20`：走出房間就回大廳）。門在 `ENTRY.wallZ`(9.75)、出生點在 `ROOM_SPAWN`(z=6.75)、外層邊界 `WORLD_HALF_EXTENT`(12)。
 *
 * `z`：門洞**以南** 0.75（= 10.5）—— 角色要刻意往南**穿過**門洞、進到門廊才觸發；房間裡正常走動（z < 10.5）不誤觸。
 * 從 `ENTRY.wallZ` 推導：門移了門檻跟著動，不會漂（跟 `ROOM_SPAWN` 同一個做法）。
 * `halfX`：門洞半寬是 `gapWidth/2`(0.9)，這裡收到 0.75 —— 要人**在門洞裡**穿過去，不是貼著南牆邊緣擦過。
 */
export const EXIT_TRIGGER = { z: ENTRY.wallZ + 0.75, halfX: 0.75 } as const

/** 通道的中線。工位左右對稱地排在它兩側。 */
export const AISLE_CENTER_X = 0

export const SEAT_INDICES = [0, 1, 2, 3, 4, 5, 6, 7] as const
export type SeatIndex = (typeof SEAT_INDICES)[number]

/** 一個工位：站位（角色站的地方）＋ 它的桌子與椅子的識別字。 */
export interface Station {
  readonly seatIndex: SeatIndex
  readonly id: string
  readonly x: number
  readonly z: number
  readonly deskId: string
  readonly chairId: string
}

/**
 * 工位的幾何常數（世界單位）。桌子 `turns: 1` —— 長邊沿 z，人站在通道側面向桌子；
 * 椅子在桌子靠牆那一側、面向桌子。從通道看過去：站位 → 桌子 → 椅子 → 牆。
 */
const STATION = {
  /** 站位離通道中線的距離。 */
  stanceX: 2.5,
  /** 桌子中心離通道中線的距離（桌子橫向半寬 0.4，近側面在 3.2）。 */
  deskX: 3.6,
  /** 椅子中心離通道中線的距離。 */
  chairX: 4.6,
  /** 索引 0／4 的 z（最靠門口）。 */
  firstZ: 5,
  /** 同一側相鄰工位的 z 間距。 */
  pitchZ: 4,
} as const

/**
 * `seat_index → 工位`。**純函式，同一索引永遠是同一位置**：0–3 在西、4–7 在東，各自由南到北。
 */
export function stationAt(seatIndex: number): Station {
  if (!Number.isInteger(seatIndex) || seatIndex < 0 || seatIndex > 7) {
    throw new Error(`seat_index 超出 0–7：${String(seatIndex)}`)
  }
  const side = seatIndex < 4 ? -1 : 1
  const z = STATION.firstZ - (seatIndex % 4) * STATION.pitchZ
  return {
    seatIndex: seatIndex as SeatIndex,
    id: `station-seat-${seatIndex}`,
    x: AISLE_CENTER_X + side * STATION.stanceX,
    z,
    deskId: `desk-seat-${seatIndex}`,
    chairId: `chair-seat-${seatIndex}`,
  }
}

export const STATIONS: readonly Station[] = SEAT_INDICES.map(stationAt)

/** 一個工位的桌椅。椅子面向桌子：西側轉 1（面朝東）、東側轉 3（面朝西）。 */
function furnitureOf(station: Station): LayoutItem[] {
  const side = station.seatIndex < 4 ? -1 : 1
  return [
    { id: station.deskId, kind: 'desk', x: AISLE_CENTER_X + side * STATION.deskX, z: station.z, turns: 1 },
    { id: station.chairId, kind: 'chair', x: AISLE_CENTER_X + side * STATION.chairX, z: station.z, turns: side < 0 ? 1 : 3 },
  ]
}

const segment = (from: number, to: number) => ({ length: to - from, center: (from + to) / 2 })
const westSeg = segment(-WORLD_HALF_EXTENT, ENTRY.doorX - ENTRY.gapWidth / 2)
const eastSeg = segment(ENTRY.doorX + ENTRY.gapWidth / 2, WORLD_HALF_EXTENT)

/**
 * 給可達性與構圖判準用的**代表點**。門廊在內側南牆以南、外層邊界以北。
 */
export const ROOM_POINTS = {
  aisle: { x: AISLE_CENTER_X, z: 0 },
  aisleEntry: { x: AISLE_CENTER_X, z: STATION.firstZ + 2 },
  aisleNorth: { x: AISLE_CENTER_X, z: STATION.firstZ - 3 * STATION.pitchZ - 2 },
  porch: { x: ENTRY.doorX, z: (ENTRY.wallZ + WORLD_HALF_EXTENT) / 2 },
} as const

export const ROOM_LAYOUT: readonly LayoutItem[] = [
  // ── 邊界。推導在 `boundary.ts`，跟 Guild Hall 共用 ──
  ...BOUNDARY_WALLS,
  // ── 出口：內側南牆兩段 ＋ 門洞裡的門造型（無碰撞、不註冊互動）──
  { id: 'wall-entry-west', kind: 'wall', x: westSeg.center, z: ENTRY.wallZ, length: westSeg.length },
  { id: 'wall-entry-east', kind: 'wall', x: eastSeg.center, z: ENTRY.wallZ, length: eastSeg.length },
  { id: ENTRY.doorId, kind: 'door', x: ENTRY.doorX, z: ENTRY.wallZ },
  // ── 中央通道的地毯：從通道入口鋪到北端，讓「通道」讀得出來 ──
  {
    id: 'carpet-aisle',
    kind: 'carpet',
    x: AISLE_CENTER_X,
    z: (ROOM_POINTS.aisleEntry.z + ROOM_POINTS.aisleNorth.z) / 2,
    width: STATION.stanceX * 2 - 1,
    depth: ROOM_POINTS.aisleEntry.z - ROOM_POINTS.aisleNorth.z,
  },
  // ── 八個工位 ──
  ...STATIONS.flatMap(furnitureOf),
]
