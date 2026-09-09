'use client'

import type {} from '@react-three/fiber'
import type { BoxFootprint, PropDefinition } from './definition'
import { footprintOf } from './definition'
import { PropParts } from './PropParts'

// 家具的 definition 表。規格 `FE-W10-S02`。
//
// **這五種沒有產品語意上的差異**（一張桌子就是一張桌子），所以它們是
// **資料**，共用一個 renderer。有語意的那五種（`Sign`／`Board`／`Door`⋯⋯）
// 是各自的元件，因為它們的差異該由 TypeScript 表達 —— 見 change 的 design D1。
//
// ⚠️ **原點在地面中心。** 每一種的最低點都是 `y = 0`，
// 所以 `FE-W11` 擺放時給的是「東西站在哪裡」，不是「東西的中心在哪裡」。
//
// ⚠️ **`blocks` 標在部件上，不是標在整個家具上。**
// 盆栽只有花盆擋路、燈只有底座與燈桿擋路 —— 葉子跟燈罩合法地伸出碰撞盒外面。
// 標錯的話玩家會在離樹幹還有一段距離的空氣中被擋住。

export const FURNITURE_KINDS = ['desk', 'chair', 'shelf', 'plant', 'lamp'] as const

export type FurnitureKind = (typeof FURNITURE_KINDS)[number]

const DESK: PropDefinition = {
  parts: [
    {
      geometry: { shape: 'RoundedBox', width: 1.6, height: 0.08, depth: 0.8, radius: 0.03 },
      material: { kind: 'standard', color: 'wood', roughness: 0.7 },
      position: [0, 0.72, 0],
      blocks: true,
    },
    ...([[-0.72, -0.32], [0.72, -0.32], [-0.72, 0.32], [0.72, 0.32]] as const).map(([x, z]) => ({
      geometry: { shape: 'RoundedBox', width: 0.08, height: 0.68, depth: 0.08, radius: 0.02 } as const,
      material: { kind: 'standard', color: 'woodDark', roughness: 0.8 } as const,
      position: [x, 0.34, z] as [number, number, number],
      blocks: true,
    })),
  ],
}

const CHAIR: PropDefinition = {
  parts: [
    {
      geometry: { shape: 'RoundedBox', width: 0.44, height: 0.07, depth: 0.44, radius: 0.03 },
      material: { kind: 'standard', color: 'wood', roughness: 0.7 },
      position: [0, 0.44, 0],
      blocks: true,
    },
    {
      geometry: { shape: 'RoundedBox', width: 0.44, height: 0.5, depth: 0.06, radius: 0.03 },
      material: { kind: 'standard', color: 'wood', roughness: 0.7 },
      position: [0, 0.72, -0.19],
      blocks: true,
    },
    ...([[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]] as const).map(([x, z]) => ({
      geometry: { shape: 'RoundedBox', width: 0.06, height: 0.4, depth: 0.06, radius: 0.02 } as const,
      material: { kind: 'standard', color: 'woodDark', roughness: 0.8 } as const,
      position: [x, 0.2, z] as [number, number, number],
      blocks: true,
    })),
  ],
}

const SHELF: PropDefinition = {
  parts: [
    ...([-0.57, 0.57] as const).map((x) => ({
      geometry: { shape: 'RoundedBox', width: 0.06, height: 1.6, depth: 0.4, radius: 0.02 } as const,
      material: { kind: 'standard', color: 'woodDark', roughness: 0.8 } as const,
      position: [x, 0.8, 0] as [number, number, number],
      blocks: true,
    })),
    ...([0.3, 0.9, 1.5] as const).map((y) => ({
      geometry: { shape: 'RoundedBox', width: 1.08, height: 0.06, depth: 0.4, radius: 0.02 } as const,
      material: { kind: 'standard', color: 'wood', roughness: 0.7 } as const,
      position: [0, y, 0] as [number, number, number],
      blocks: true,
    })),
  ],
}

// ⚠️ **葉子刻意不擋路。** 這一種是「視覺比碰撞大」的例子 ——
// 標成擋路的話，玩家會在離花盆 0.3 個單位的地方撞到空氣。
const PLANT: PropDefinition = {
  parts: [
    {
      geometry: { shape: 'Cylinder', radius: 0.22, height: 0.3 },
      material: { kind: 'standard', color: 'terracotta', roughness: 0.9 },
      position: [0, 0.15, 0],
      blocks: true,
    },
    {
      geometry: { shape: 'Sphere', radius: 0.34 },
      material: { kind: 'standard', color: 'leaf', roughness: 0.85 },
      position: [0, 0.62, 0],
    },
    {
      geometry: { shape: 'Sphere', radius: 0.22 },
      material: { kind: 'standard', color: 'leaf', roughness: 0.85 },
      position: [0.2, 0.86, 0.08],
    },
  ],
}

// ⚠️ **燈罩不擋路**，理由同 `PLANT` 的葉子。
const LAMP: PropDefinition = {
  parts: [
    {
      geometry: { shape: 'Cylinder', radius: 0.18, height: 0.06 },
      material: { kind: 'standard', color: 'metal', roughness: 0.4, metalness: 0.6 },
      position: [0, 0.03, 0],
      blocks: true,
    },
    {
      geometry: { shape: 'Cylinder', radius: 0.035, height: 1.3 },
      material: { kind: 'standard', color: 'metal', roughness: 0.4, metalness: 0.6 },
      position: [0, 0.71, 0],
      blocks: true,
    },
    {
      // `basic` 不吃光 —— 燈罩是「自己在發亮」的外觀，被打光會看起來像塑膠。
      geometry: { shape: 'Cylinder', radius: 0.28, height: 0.26 },
      material: { kind: 'basic', color: 'glow' },
      position: [0, 1.44, 0],
      castShadow: false,
    },
  ],
}

export const FURNITURE: Readonly<Record<FurnitureKind, PropDefinition>> = {
  desk: DESK,
  chair: CHAIR,
  shelf: SHELF,
  plant: PLANT,
  lamp: LAMP,
}

/** 取一種家具的 definition。未列舉的名字拋錯 —— 型別擋得住打字錯誤，擋不住 `as any`。 */
export function furnitureDefinition(kind: FurnitureKind): PropDefinition {
  const found = FURNITURE[kind]
  if (found === undefined) {
    throw new Error(
      `沒有「${String(kind)}」這種家具。合法的有：${FURNITURE_KINDS.join('、')}。` +
        '要新增造型就加一筆 definition，**不要另外寫一個元件檔** —— 那會讓風格在寫的過程中散掉。',
    )
  }
  return found
}

// 家具的泛用 renderer。規格 `FE-W10-S02`。
//
// **五種家具共用這一個元件。** 各寫一個 `Desk.tsx`／`Chair.tsx` 的話，
// 五個檔案會有五份幾乎一樣的樣板 —— 而風格會在寫的過程中散掉。

export function Furniture({ kind }: { kind: FurnitureKind }) {
  return <PropParts definition={furnitureDefinition(kind)} />
}

/**
 * 一種家具的局部碰撞盒。**沒有世界座標** —— `FE-W11` 套上擺放位置才產生
 * 物理世界要的東西。不擋路的家具回 `undefined`。
 */
export function furnitureFootprint(kind: FurnitureKind): BoxFootprint | undefined {
  return footprintOf(furnitureDefinition(kind))
}
