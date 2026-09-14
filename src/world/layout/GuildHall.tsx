'use client'

import type {} from '@react-three/fiber'
import { PropParts } from '../environment/PropParts'
import { definitionFor } from './geometry'
import { LAYOUT } from './guildHallLayout'
import type { LayoutItem } from './types'

// 配置的渲染。規格 `FE-W11-S01`、`FE-V01-S01`。
//
// ⚠️ **它只是走傳進來的 `layout`。** 這裡沒有任何座標 —— 座標全部在各場景的配置檔
// （`guildHallLayout.ts`、`projectRoomLayout.ts`），而**碰撞也走同一份**（`staticBoxesFor`）。
// 在這裡多寫一個 `<mesh>`，它就會是一個看得到、但物理世界不知道的東西。
//
// 檔名留著 `GuildHall.tsx`：`GuildHall()` 仍然是「Guild Hall 的配置渲染出來」，
// 只是它現在是 `LayoutItems` 的一個呼叫端，不是唯一的。
//
// ⚠️ **不建立任何碰撞體。** 註冊靜態碰撞是 `LocalPlayer` 建物理世界時的事。

/** 旋轉：`turns` 是 90° 的整數倍（`world-environment` 的碰撞描述只支援四分之一圈）。 */
function Item({ item }: { item: LayoutItem }) {
  return (
    <group position={[item.x, 0, item.z]} rotation={[0, ((item.turns ?? 0) * Math.PI) / 2, 0]}>
      <PropParts definition={definitionFor(item)} />
    </group>
  )
}

export function LayoutItems({ layout }: { layout: readonly LayoutItem[] }) {
  return (
    <>
      {layout.map((item) => (
        <Item key={item.id} item={item} />
      ))}
    </>
  )
}

export function GuildHall() {
  return <LayoutItems layout={LAYOUT} />
}
