'use client'

import { useThree } from '@react-three/fiber'
import { PHYSICS } from '../physics/world'
import { groundOverscan } from '../layout/framing'
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
  // ⚠️ **視覺地板要比碰撞邊界大**（`FE-W11-S14`）：牆只有 2 單位高，
  // 相機從 12 個單位的高處往下看 —— 玩家走到邊緣時看得到牆外面。
  // 大小**由相機投影到地面的範圍推導**，不是隨手挑一個常數：
  // 相機參數改的那天，隨手挑的常數會靜默失效。
  //
  // ⚠️⚠️ **用執行期真正的長寬比，不是寫死的 16:9。**
  // 網頁的視窗比例完全不可控 —— 超寬螢幕、直向、分割視窗都會讓
  // 寫死的值不夠大，而症狀是「畫面邊緣有一塊空白」。
  // （`groundOverscan` 內部會把結果量化到整數單位，所以拉視窗不會
  // 在幾何快取裡一直留下新的地板。）
  const { width, height } = useThree((state) => state.size)
  const outside = groundOverscan(PHYSICS.halfExtent - PHYSICS.playerRadius, width / height) * 2

  return (
    <>
      {/* 世界外面的地。比地面暗一階，看起來不像可以走過去的地方。
          壓在正式地板下面一點，避免兩個共面的多邊形互相閃爍（z-fighting）。 */}
      <group position={[0, -0.05, 0]}>
        <Floor width={outside} depth={outside} color="outside" />
      </group>
      <Floor width={span} depth={span} />
      {/* ⚠️ **四面邊界牆已經搬進 `LAYOUT`**（`FE-W11`）——
          它們現在跟內牆走同一條路，視覺與碰撞吃同一份資料。
          在這裡再畫一次的話就是第二份真相。 */}
      <GuildHall />
    </>
  )
}
