'use client'

import type {} from '@react-three/fiber'
import { forwardRef } from 'react'
import { BackSide, type Group } from 'three'
import { avatarLook } from '@/design/avatar'
import { worldColor } from '@/design/world'

// 程式化的 Chibi 角色。**沒有載入任何外部模型** ——
// CONTEXT.md 的詞彙表：Procedural Avatar 是「由 primitive 組出來的 Chibi 角色，
// 不是載入外部模型」。
//
// ⚠️ 這是**簡單版**。FE-W08 ProceduralAvatar（W3）會換成模組化的正式版
// （Head / Hair / Body / Arms / Legs，Local 與 Remote 共用同一套）。
//
// ⚠️ **像素外觀（`FE-W14-S06`）：描邊＋框臉髮型＋臉部細節。**
// - **描邊**：inverted-hull —— 每個部位後面疊一個放大一點、只畫背面（`BackSide`）、
//   不吃光（`meshBasicMaterial`）的深色 box，露在本體外圈成一圈輪廓。不用後處理 pass。
// - **框臉髮型**：頂＋瀏海＋兩側鬢角＋後腦（不是一塊平板）—— 這是「這是人」的關鍵訊號。
// - **臉部細節**：眼、嘴、腮紅。
// 描邊色與髮色是像素風常數（`worldColor('ink')`／`('hair')`／`('blush')`）；
// **軀幹／四肢色仍由 `avatarLook(av)` 決定**（`avatar-appearance`／`FE-A05`／`FE-W19`），本 change 不改那組色。
//
// ⚠️ **動畫不走 props。** 手腳的擺動與身體的起伏是每幀變動的高頻資料 ——
// CONTEXT.md 明訂它們不得進 React。
//
// 做法是**只暴露一個根 ref，子部位用名字查**（`getObjectByName`）。
// 不用「把五個 ref 當 prop 傳下來」是因為 `react-hooks/refs` 會擋 ——
// 那條規則是對的（傳 ref 等於在 render 期間碰它），而 three.js 本來就有
// 用名字查子物件的慣例。呼叫端查一次、快取起來，之後每幀直接寫 transform。

// 規格 FE-W09-S02：**MUST NOT 寫死顏色。** 這些值在 `src/design/world.ts`，
// 改顏色去那裡改一次，不是在十幾個場景元件裡逐一改。
//
// ⚠️ **顏色不再是模組層級常數了**（`FE-W19`）—— body／limb 依 `av` 而定，
// 所以要在 render 裡取。**取用的是 `avatarLook()`，本地與遠端同一份。**

/** 呼叫端用這些名字查子部位。改名字會讓動畫靜默停止 —— 所以它們是契約。 */
export const CHIBI_PARTS = ['leftArm', 'rightArm', 'leftLeg', 'rightLeg'] as const

export type ChibiPart = (typeof CHIBI_PARTS)[number]

/**
 * inverted-hull 描邊：同一個 box 放大一點、深色、只畫背面，露在本體外圈＝一圈輪廓（`FE-W14-S06`）。
 *
 * 用 `meshBasicMaterial`（不吃光）—— 描邊是要恆為深色的剪影，被燈光染色就不是輪廓了。
 */
function OutlineBox({
  position,
  size,
  color,
  scale = 1.16,
}: {
  position: [number, number, number]
  size: [number, number, number]
  color: string
  scale?: number
}) {
  return (
    <mesh position={position} scale={scale}>
      <boxGeometry args={size} />
      <meshBasicMaterial color={color} side={BackSide} />
    </mesh>
  )
}

function Limb({
  name,
  position,
  size,
  color,
  outline,
  restX = 0,
}: {
  name: ChibiPart
  position: [number, number, number]
  size: [number, number, number]
  color: string
  outline: string
  /**
   * 靜止時的關節角度（弧度，繞 X）。**坐姿用**：讓大腿往前彎、手往前擱。
   *
   * ⚠️ 走路動畫的驅動端（`LocalPlayer`）每幀寫 `rotation.x`，會蓋掉這個初始值。
   * 所以驅動端要呈現坐姿，必須在 seated 時**跳過**那次寫入（見 `FE-W14-S08` 的契約，
   * 實際入座的接線歸 `FE-J13`）。非驅動的實例（`RemotePlayer`、靜態渲染）不寫四肢，這個初始值直接生效。
   */
  restX?: number
}) {
  return (
    // 外層 group 的原點在關節，所以 rotation.x 是「從肩膀／髖部擺動」
    <group name={name} position={position} rotation={[restX, 0, 0]}>
      <OutlineBox position={[0, -size[1] / 2, 0]} size={size} color={outline} />
      <mesh position={[0, -size[1] / 2, 0]} castShadow>
        <boxGeometry args={size} />
        <meshStandardMaterial color={color} />
      </mesh>
    </group>
  )
}

export interface ChibiPlayerProps {
  /**
   * 協定的 `av`。規格 `avatar-appearance`（`FE-W19`）。
   *
   * ⚠️⚠️ **型別是 `unknown` 而不是 `number`，那是刻意的。**
   * 後端的 `avatar_id: int` 沒有上界、沒有下界、沒有任何驗證，
   * 所以 `null` 與非整數在執行期完全可能發生。值域檢查在 `avatarLook()` 裡，
   * **不在這裡** —— 本地與遠端各檢查一次的話，兩份會漂。
   */
  av?: unknown
  /**
   * 坐姿（`FE-W14-S08`）。為真時大腿往前彎、手往前擱、整體略抬到椅面高度；為假時是站姿。
   *
   * ⚠️ **只做姿勢本身。** 坐在正確座位上的定位、面向、走動起身歸 `FE-J13`。
   * ⚠️ 對每幀驅動四肢的實例（`LocalPlayer`）只有在它 seated 時**跳過擺動寫入**才看得到；
   * `RemotePlayer` 與靜態實例（截圖、非驅動渲染）直接生效。
   */
  seated?: boolean
}

/** ref 指向身體的根 group —— 上下起伏寫在它的 `position.y`。 */
export const ChibiPlayer = forwardRef<Group, ChibiPlayerProps>(function ChibiPlayer(
  { av, seated = false },
  ref,
) {
  // ⚠️ **這裡不做任何值域判斷。** `avatarLook()` 收 `unknown` 並自己處理 ——
  // 在元件裡補一層 `av ?? 0` 會製造第二份規則，而兩份規則一定會漂。
  const look = avatarLook(av)
  const outline = worldColor('ink')
  const hair = worldColor('hair')
  const blush = worldColor('blush')
  // 坐姿的關節角度。**正 X 把肢體往身後轉、負 X 往身前（+Z 是臉的方向）** —— 往前彎是負角。
  // 大腿彎 ~75°、手往前擱 ~17°。
  const legRest = seated ? -1.32 : 0
  const armRest = seated ? -0.3 : 0
  return (
    // 坐姿時整體略抬，讓臀部落在椅面（椅座頂 ~0.48）而不是懸空。
    <group ref={ref} position={[0, seated ? 0.05 : 0, 0]}>
      {/* 頭。Chibi 的比例：頭幾乎跟身體一樣大 */}
      <OutlineBox position={[0, 1.15, 0]} size={[0.62, 0.58, 0.58]} color={outline} scale={1.1} />
      <mesh position={[0, 1.15, 0]} castShadow>
        <boxGeometry args={[0.62, 0.58, 0.58]} />
        <meshStandardMaterial color={look.skin} />
      </mesh>

      {/* 眼睛。**朝向靠它看得出來** —— 沒有眼睛的話 0/1/2/3 四個朝向
          在畫面上分不出來，而 V1 的驗證就沒有依據。
          眼睛在 +Z 面，所以朝向 0（下）時它正對相機。 */}
      <mesh position={[-0.14, 1.18, 0.3]}>
        <boxGeometry args={[0.1, 0.13, 0.02]} />
        <meshStandardMaterial color={look.ink} />
      </mesh>
      <mesh position={[0.14, 1.18, 0.3]}>
        <boxGeometry args={[0.1, 0.13, 0.02]} />
        <meshStandardMaterial color={look.ink} />
      </mesh>

      {/* 框臉髮型（頂＋瀏海＋兩側鬢角＋後腦，像西瓜皮）——平板讀不出頭髮，框住臉才是「髮型」（`FE-W14-S06`）。 */}
      {/* 頂 */}
      <mesh position={[0, 1.44, -0.02]} castShadow>
        <boxGeometry args={[0.66, 0.2, 0.62]} />
        <meshStandardMaterial color={hair} />
      </mesh>
      {/* 瀏海（蓋額頭、在眼睛上方） */}
      <mesh position={[0, 1.34, 0.29]}>
        <boxGeometry args={[0.66, 0.14, 0.06]} />
        <meshStandardMaterial color={hair} />
      </mesh>
      {/* 兩側鬢角（框住臉頰） */}
      <mesh position={[-0.32, 1.14, 0.02]} castShadow>
        <boxGeometry args={[0.06, 0.42, 0.62]} />
        <meshStandardMaterial color={hair} />
      </mesh>
      <mesh position={[0.32, 1.14, 0.02]} castShadow>
        <boxGeometry args={[0.06, 0.42, 0.62]} />
        <meshStandardMaterial color={hair} />
      </mesh>
      {/* 後腦 */}
      <mesh position={[0, 1.16, -0.31]} castShadow>
        <boxGeometry args={[0.66, 0.46, 0.08]} />
        <meshStandardMaterial color={hair} />
      </mesh>
      {/* 嘴 */}
      <mesh position={[0, 1.03, 0.3]}>
        <boxGeometry args={[0.14, 0.03, 0.02]} />
        <meshStandardMaterial color={look.ink} />
      </mesh>
      {/* 腮紅 */}
      <mesh position={[-0.24, 1.08, 0.3]}>
        <boxGeometry args={[0.08, 0.06, 0.02]} />
        <meshStandardMaterial color={blush} />
      </mesh>
      <mesh position={[0.24, 1.08, 0.3]}>
        <boxGeometry args={[0.08, 0.06, 0.02]} />
        <meshStandardMaterial color={blush} />
      </mesh>

      <OutlineBox position={[0, 0.66, 0]} size={[0.46, 0.5, 0.34]} color={outline} scale={1.14} />
      <mesh position={[0, 0.66, 0]} castShadow>
        <boxGeometry args={[0.46, 0.5, 0.34]} />
        <meshStandardMaterial color={look.body} />
      </mesh>

      <Limb name="leftArm" position={[-0.3, 0.86, 0]} size={[0.14, 0.42, 0.14]} color={look.limb} outline={outline} restX={armRest} />
      <Limb name="rightArm" position={[0.3, 0.86, 0]} size={[0.14, 0.42, 0.14]} color={look.limb} outline={outline} restX={armRest} />
      <Limb name="leftLeg" position={[-0.13, 0.42, 0]} size={[0.16, 0.44, 0.16]} color={look.limb} outline={outline} restX={legRest} />
      <Limb name="rightLeg" position={[0.13, 0.42, 0]} size={[0.16, 0.44, 0.16]} color={look.limb} outline={outline} restX={legRest} />
    </group>
  )
})
