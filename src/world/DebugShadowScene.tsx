'use client'

// React 19 廢掉了全域 JSX namespace，所以 R3F v9 的 `<mesh>` 這類 intrinsic
// 是靠 `@react-three/fiber` 的模組擴充帶進來的 —— 檔案裡沒有 import 到它，
// 型別就找不到（TS2339: Property 'mesh' does not exist）。
// 這個 type-only import 沒有 runtime 成本，只是把擴充拉進 TS 的程式集。
import type {} from '@react-three/fiber'
import { worldColor } from '@/design/world'

// ⚠️⚠️ **這整個檔案由 FE-W10 移除。** ⚠️⚠️
//
// 它存在的唯一理由：規格 FE-W01-S03 要求「投射陰影的物件在接收陰影的平面上
// 留下可見的陰影」。沒有任何 mesh 的話，燈光與 soft shadow 的設定
// 「設定好了但看不到」，那條 Scenario 就無從驗證。
//
// **刻意不叫它 `Floor`。** `Floor / Wall / Carpet / Platform` 逐字是
// `FE-W10 EnvironmentComponents`（W3）的範圍 —— 用了正式名字之後，
// 沒有人分得出哪個是臨時的、哪個是真的場景元件。
//
// FE-W10 接手時：刪掉這個檔案，把 `<DebugShadowScene />` 換成正式的場景。
// 它中間會被 FE-W02–FE-W07 五個項目看到，所以這段警告要夠大聲。

export function DebugShadowScene() {
  return (
    <>
      {/* 接收陰影的平面。**不是** Floor —— 見檔案開頭。 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.5, 0]} receiveShadow>
        <planeGeometry args={[20, 20]} />
        <meshStandardMaterial color={worldColor('ground')} />
      </mesh>

      {/* 投射陰影的方塊。它唯一的工作是證明陰影真的有出現。 */}
      {/* 挪到旁邊：角色的 spawn 點在原點，疊在一起會看不出朝向。
          FE-W10 會把這個方塊整個移除。 */}
      <mesh position={[3, 0.6, -2]} castShadow>
        <boxGeometry args={[1.2, 1.2, 1.2]} />
        <meshStandardMaterial color={worldColor('accent')} />
      </mesh>
    </>
  )
}
