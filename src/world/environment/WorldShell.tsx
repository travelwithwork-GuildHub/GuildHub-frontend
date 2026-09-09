'use client'

import type {} from '@react-three/fiber'
import { PHYSICS } from '../physics/world'
import { GuildHall } from '../layout/GuildHall'
import { Floor } from './structural'

// 世界的外殼。規格 `FE-W10-S10`／`S11`／`S12`。
//
// **這不是「配置」。** 哪張桌子放哪裡是 `FE-W11`；地面與邊界是世界成立的條件。
// 它取代了 `DebugShadowScene` —— 那兩個物件的唯一目的是讓 `FE-W01-S03`
// 可被驗證，而那讓對外公開的 `/world` 展示的是鷹架。
//
// **牆為什麼在這裡**：物理世界已經有 ±`halfExtent` 的**隱形**邊界，
// 玩家走到邊緣會被看不見的東西擋住 —— 那是今天就存在的缺陷。
// 把它畫出來的理由是**消除那個缺陷**，不是為了讓陰影可驗。
//
// ⚠️⚠️ **這裡不建立任何碰撞體。** 邊界的碰撞體由 `createPhysicsWorld` 的
// `addBounds` 產生，那裡是單一權威來源。再疊一組就是第二份真相，而兩份會漂。
//
// ⚠️ **尺寸一律從 `PHYSICS` 推導，不寫死數字。** 寫死的話，改了物理範圍之後
// 玩家會走到牆外面 —— 而畫面上看起來只是「牆的位置怪怪的」。

export function WorldShell() {
  const span = PHYSICS.halfExtent * 2

  return (
    <>
      <Floor width={span} depth={span} />
      {/* ⚠️ **四面邊界牆已經搬進 `LAYOUT`**（`FE-W11`）——
          它們現在跟內牆走同一條路，視覺與碰撞吃同一份資料。
          在這裡再畫一次的話就是第二份真相。 */}
      <GuildHall />
    </>
  )
}
