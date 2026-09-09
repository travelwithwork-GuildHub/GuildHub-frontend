'use client'

import type {} from '@react-three/fiber'
import type { WorldColorName } from '@/design/world'
import type { PropDefinition } from './definition'
import { PropParts } from './PropParts'

// 結構元件。規格 `FE-W10-S01`：**尺寸由呼叫端決定** ——
// `FE-W11` 的走廊跟大廳不會一樣寬，所以它們不能是常數表。
//
// 它們的 definition 是從 props 算出來的，**跟家具走同一條路** ——
// 碰撞判準（`FE-W10-S05`）因此對三類元件一致地成立。
//
// ⚠️ **一個座標都不訂。** 這裡只回答「一面牆長什麼樣子」，
// 不回答「牆在哪裡」—— 後者是 `FE-W11`。唯一的例外是 `WorldShell`，
// 理由見 change 的 design D4。

/** 圓角半徑。薄板的半徑會被 `geometryFor` 夾到最短邊的 0.49 倍，這裡給的是上界。 */
const RADIUS = 0.06

export function floorDefinition(
  width: number,
  depth: number,
  thickness = 0.2,
  color: WorldColorName = 'ground',
): PropDefinition {
  return {
    parts: [
      {
        geometry: { shape: 'RoundedBox', width, height: thickness, depth, radius: RADIUS },
        material: { kind: 'standard', color, roughness: 0.95 },
        // 上表面切齊 y = 0 —— 角色的腳在 y ≈ -0.02，所以它站在地面上。
        position: [0, -thickness / 2, 0],
        // 平貼的地面**不投射陰影**：它沒有東西可以投上去，而每個 caster
        // 都要進一次 shadow pass。它要做的是**接收**。
        castShadow: false,
      },
    ],
  }
}

export function wallDefinition(length: number, height: number, thickness: number): PropDefinition {
  return {
    parts: [
      {
        geometry: { shape: 'RoundedBox', width: length, height, depth: thickness, radius: RADIUS },
        material: { kind: 'standard', color: 'wall', roughness: 0.9 },
        position: [0, height / 2, 0],
        blocks: true,
      },
    ],
  }
}

export function carpetDefinition(width: number, depth: number): PropDefinition {
  return {
    parts: [
      {
        geometry: { shape: 'RoundedBox', width, height: 0.02, depth, radius: RADIUS },
        material: { kind: 'standard', color: 'carpet', roughness: 1 },
        position: [0, 0.01, 0],
        castShadow: false,
        // **地毯不擋路** —— 所以它沒有碰撞盒（規格 FE-W10-S06）。
      },
    ],
  }
}

export function platformDefinition(width: number, depth: number, height: number): PropDefinition {
  return {
    parts: [
      {
        geometry: { shape: 'RoundedBox', width, height, depth, radius: RADIUS },
        material: { kind: 'standard', color: 'platform', roughness: 0.85 },
        position: [0, height / 2, 0],
        blocks: true,
      },
    ],
  }
}

export function Floor({
  width,
  depth,
  thickness,
  color,
}: {
  width: number
  depth: number
  thickness?: number
  /** 省略＝地面色。世界外面的地用 `outside`（見 `FE-W11-S14`）。 */
  color?: WorldColorName
}) {
  return <PropParts definition={floorDefinition(width, depth, thickness, color)} />
}

export function Wall({ length, height, thickness }: { length: number; height: number; thickness: number }) {
  return <PropParts definition={wallDefinition(length, height, thickness)} />
}

export function Carpet({ width, depth }: { width: number; depth: number }) {
  return <PropParts definition={carpetDefinition(width, depth)} />
}

export function Platform({ width, depth, height }: { width: number; depth: number; height: number }) {
  return <PropParts definition={platformDefinition(width, depth, height)} />
}
