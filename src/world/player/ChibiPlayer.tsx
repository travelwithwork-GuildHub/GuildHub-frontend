'use client'

import type {} from '@react-three/fiber'
import { forwardRef } from 'react'
import type { Group } from 'three'

// 程式化的 Chibi 角色。**沒有載入任何外部模型** ——
// CONTEXT.md 的詞彙表：Procedural Avatar 是「由 primitive 組出來的 Chibi 角色，
// 不是載入外部模型」。
//
// ⚠️ 這是**簡單版**。FE-W08 ProceduralAvatar（W3）會換成模組化的正式版
// （Head / Hair / Body / Arms / Legs，Local 與 Remote 共用同一套）。
//
// ⚠️ **動畫不走 props。** 手腳的擺動與身體的起伏是每幀變動的高頻資料 ——
// CONTEXT.md 明訂它們不得進 React。
//
// 做法是**只暴露一個根 ref，子部位用名字查**（`getObjectByName`）。
// 不用「把五個 ref 當 prop 傳下來」是因為 `react-hooks/refs` 會擋 ——
// 那條規則是對的（傳 ref 等於在 render 期間碰它），而 three.js 本來就有
// 用名字查子物件的慣例。呼叫端查一次、快取起來，之後每幀直接寫 transform。

const SKIN = '#f2c9a0'
const BODY = '#4d5bb0'
const LIMB = '#3b4794'

/** 呼叫端用這些名字查子部位。改名字會讓動畫靜默停止 —— 所以它們是契約。 */
export const CHIBI_PARTS = ['leftArm', 'rightArm', 'leftLeg', 'rightLeg'] as const

export type ChibiPart = (typeof CHIBI_PARTS)[number]

function Limb({
  name,
  position,
  size,
}: {
  name: ChibiPart
  position: [number, number, number]
  size: [number, number, number]
}) {
  return (
    // 外層 group 的原點在關節，所以 rotation.x 是「從肩膀／髖部擺動」
    <group name={name} position={position}>
      <mesh position={[0, -size[1] / 2, 0]} castShadow>
        <boxGeometry args={size} />
        <meshStandardMaterial color={LIMB} />
      </mesh>
    </group>
  )
}

/** ref 指向身體的根 group —— 上下起伏寫在它的 `position.y`。 */
export const ChibiPlayer = forwardRef<Group>(function ChibiPlayer(_props, ref) {
  return (
    <group ref={ref}>
      {/* 頭。Chibi 的比例：頭幾乎跟身體一樣大 */}
      <mesh position={[0, 1.15, 0]} castShadow>
        <boxGeometry args={[0.62, 0.58, 0.58]} />
        <meshStandardMaterial color={SKIN} />
      </mesh>

      {/* 眼睛。**朝向靠它看得出來** —— 沒有眼睛的話 0/1/2/3 四個朝向
          在畫面上分不出來，而 V1 的驗證就沒有依據。
          眼睛在 +Z 面，所以朝向 0（下）時它正對相機。 */}
      <mesh position={[-0.14, 1.18, 0.3]}>
        <boxGeometry args={[0.1, 0.13, 0.02]} />
        <meshStandardMaterial color="#20232e" />
      </mesh>
      <mesh position={[0.14, 1.18, 0.3]}>
        <boxGeometry args={[0.1, 0.13, 0.02]} />
        <meshStandardMaterial color="#20232e" />
      </mesh>

      <mesh position={[0, 0.66, 0]} castShadow>
        <boxGeometry args={[0.46, 0.5, 0.34]} />
        <meshStandardMaterial color={BODY} />
      </mesh>

      <Limb name="leftArm" position={[-0.3, 0.86, 0]} size={[0.14, 0.42, 0.14]} />
      <Limb name="rightArm" position={[0.3, 0.86, 0]} size={[0.14, 0.42, 0.14]} />
      <Limb name="leftLeg" position={[-0.13, 0.42, 0]} size={[0.16, 0.44, 0.16]} />
      <Limb name="rightLeg" position={[0.13, 0.42, 0]} size={[0.16, 0.44, 0.16]} />
    </group>
  )
})
