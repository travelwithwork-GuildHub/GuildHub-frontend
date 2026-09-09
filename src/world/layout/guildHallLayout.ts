import { PHYSICS } from '../physics/world'
import { WORLD_HALF_EXTENT } from './geometry'
import type { LayoutItem, Zone } from './types'

// Guild Hall 的配置。規格 `FE-W11-S01`／`S09`。
//
// ⚠️ **檔名刻意是 `guildHallLayout` 不是 `guildHall`。**
// macOS 的檔案系統不分大小寫，`guildHall.ts` 與 `GuildHall.tsx` 是同一個名字
// —— import 會靜默解析到錯的那一個（`FE-W10` 已經踩過一次）。
//
// ⚠️ **這裡是世界裡每一個東西的座標，而且是唯一的一份。**
// 渲染走這份、碰撞也走這份（`staticBoxesFor`）——
// 在別的地方再寫一組座標的話，兩份會漂，而症狀是「看起來走得過去卻卡住」。
//
// **座標系**：+X 在畫面右方、+Z 在畫面下方（相機在玩家的 +Z 側上方往回看）。
// 所以「北」是 -Z、「南」是 +Z。
//
// **佈局**（24×24，±12）：
//
//     -Z 北  ┌──────────────────────────┐
//            │        Board 區          │   兩個看板 ＋ 招牌，出生就看得到
//            │                          │
//     走廊 → │ ▓▓ ┊ ▓▓        社交區    │   走廊在西側，中間留一個門的開口
//            │ ▓▓ ┊ ▓▓      桌椅書架    │
//     +Z 南  └──────────────────────────┘
//              ↑ 出生點在中央偏南
//
// ⚠️ **牆的開口寬 1.8，門本身寬 1.58** —— 開口要比門大一點，
// 否則門框會跟牆長在一起。而 1.8 遠大於角色直徑 0.5（`FE-W11-S11`）。

/** 出生點。**不在任何分區裡** —— 出生時看得到 Board 區，走幾步到社交區。 */
export const SPAWN = { x: 0, z: 1 } as const

const HALF = WORLD_HALF_EXTENT
/** 邊界牆比場地長一個厚度，讓四個角接起來。 */
const BOUNDARY_LENGTH = HALF * 2 + PHYSICS.wallThickness
/**
 * 邊界牆的中心。
 *
 * ⚠️ **牆的內側面要貼齊 `±HALF`，所以中心在 `HALF + 厚度/2`。**
 * 把中心放在 `HALF` 的話牆會有一半長在遊玩區域裡面 ——
 * 角色會停在牆的正中間，看起來像半個身體陷進牆裡。
 */
const BOUNDARY_AT = HALF + PHYSICS.wallThickness / 2

/** 走廊隔牆的開口：中心與淨寬。 */
const GAP = { center: 3, width: 1.8 } as const
/** 走廊隔牆涵蓋的 Z 範圍。 */
const CORRIDOR_WALL = { from: -3, to: 9, x: -6 } as const

const segment = (from: number, to: number) => ({ length: to - from, center: (from + to) / 2 })

const northSeg = segment(CORRIDOR_WALL.from, GAP.center - GAP.width / 2)
const southSeg = segment(GAP.center + GAP.width / 2, CORRIDOR_WALL.to)

export const LAYOUT: readonly LayoutItem[] = [
  // ── 邊界。**視覺與碰撞都從這裡來** ────────────────────────────────
  { id: 'boundary-north', kind: 'wall', role: 'boundary', x: 0, z: -BOUNDARY_AT, length: BOUNDARY_LENGTH },
  { id: 'boundary-south', kind: 'wall', role: 'boundary', x: 0, z: BOUNDARY_AT, length: BOUNDARY_LENGTH },
  { id: 'boundary-west', kind: 'wall', role: 'boundary', x: -BOUNDARY_AT, z: 0, turns: 1, length: BOUNDARY_LENGTH },
  { id: 'boundary-east', kind: 'wall', role: 'boundary', x: BOUNDARY_AT, z: 0, turns: 1, length: BOUNDARY_LENGTH },

  // ── Board 區（北）。出生時要看得到（`FE-W11-S12`）────────────────
  { id: 'carpet-boards', kind: 'carpet', x: 0, z: -6, width: 14, depth: 5 },
  { id: 'board-project', kind: 'projectBoard', x: -3.5, z: -6.5 },
  { id: 'board-talent', kind: 'talentBoard', x: 3.5, z: -6.5 },
  { id: 'sign-boards', kind: 'sign', x: 0, z: -6.5 },
  { id: 'plant-boards-west', kind: 'plant', x: -7.5, z: -6.5 },
  { id: 'plant-boards-east', kind: 'plant', x: 7.5, z: -6.5 },

  // ── 社交區（東南）────────────────────────────────────────────────
  { id: 'carpet-social', kind: 'carpet', x: 6, z: 5.5, width: 10, depth: 8 },
  { id: 'desk-social-a', kind: 'desk', x: 4, z: 3.5 },
  { id: 'chair-social-a', kind: 'chair', x: 4, z: 4.9, turns: 2 },
  { id: 'desk-social-b', kind: 'desk', x: 8, z: 7, turns: 1 },
  { id: 'chair-social-b', kind: 'chair', x: 6.7, z: 7, turns: 1 },
  { id: 'shelf-social', kind: 'shelf', x: 10.8, z: 4, turns: 1 },
  { id: 'plant-social', kind: 'plant', x: 2, z: 8.5 },
  { id: 'lamp-social', kind: 'lamp', x: 10.5, z: 8.5 },

  // ── 走廊（西）。`FE-W12` 的 Project Door 之後排在這裡 ─────────────
  { id: 'wall-corridor-north', kind: 'wall', x: CORRIDOR_WALL.x, z: northSeg.center, turns: 1, length: northSeg.length },
  { id: 'wall-corridor-south', kind: 'wall', x: CORRIDOR_WALL.x, z: southSeg.center, turns: 1, length: southSeg.length },
  { id: 'door-corridor', kind: 'door', x: CORRIDOR_WALL.x, z: GAP.center, turns: 1 },
  { id: 'carpet-corridor', kind: 'carpet', x: -9, z: 3, width: 5, depth: 11 },
  // 靠著西邊界牆的兩扇門。**它們今天通不到任何地方** —— `FE-W12` 才依 API 生成。
  { id: 'door-room-1', kind: 'door', x: -11.4, z: 0, turns: 1 },
  { id: 'door-room-2', kind: 'door', x: -11.4, z: 6, turns: 1 },
  { id: 'banner-corridor', kind: 'guildBanner', x: -8, z: -1.5 },
  { id: 'lamp-corridor', kind: 'lamp', x: -7, z: 8 },
] as const

/**
 * 具名的矩形範圍。**只有矩形** —— 間距、容量、朝向是 `FE-W12` 真的要排門的
 * 時候才知道的事（change 的 design D4）。
 */
export const ZONES: readonly Zone[] = [
  { id: 'boards', x: 0, z: -6.5, halfWidth: 8, halfDepth: 3 },
  { id: 'social', x: 6.5, z: 5.5, halfWidth: 5.5, halfDepth: 4.5 },
  { id: 'corridor', x: -9, z: 3, halfWidth: 2.8, halfDepth: 6 },
] as const

/**
 * 給構圖與遮擋判準用的**代表站位**。
 *
 * ⚠️ **不是「世界上所有位置」。** 任何一面內牆都會遮住站在它北側緊鄰處的角色 ——
 * 那是牆的本質，不是缺陷。要驗的是**設計上保證看得清楚的地方**
 *（change 的 design D5）。
 */
export const STANCES: readonly { readonly id: string; readonly x: number; readonly z: number }[] = [
  { id: 'spawn', x: SPAWN.x, z: SPAWN.z },
  { id: 'project-board', x: -3.5, z: -4.5 },
  { id: 'talent-board', x: 3.5, z: -4.5 },
  { id: 'social', x: 4, z: 5.6 },
  { id: 'corridor', x: -8, z: 3 },
] as const
