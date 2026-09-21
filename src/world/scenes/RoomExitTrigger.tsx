'use client'

import type {} from '@react-three/fiber'
import { useFrame } from '@react-three/fiber'
import { useRef, type RefObject } from 'react'
import type { LocalPose } from '@/world/PositionSync'
import { EXIT_TRIGGER } from '@/world/layout/projectRoomLayout'

// 穿門即走：走出房間就回大廳。規格 `FE-V01-S20`（design D2／D3）。
//
// ⚠️ **不渲染任何東西。** 它在 Canvas 裡，因為要 `useFrame` 讀 `LocalPlayer` 每幀寫的 `poseRef`。
// 只掛在 `room` 場景（`SceneObjects` 的 room 分支）；`hall` 不掛。
//
// 觸發：角色往南穿過門洞、位置到 `z ≥ EXIT_TRIGGER.z 且 |x| ≤ EXIT_TRIGGER.halfX` → `onExit()`（＝ `returnToHall`）。
// 門檻在門洞**以南**（門在 9.75、出生點 6.75）：要刻意穿門才觸發，房間裡正常走動不誤觸（`S20`）。
//
// ⚠️ **一次性**（`fired` ref）：`onExit` 只呼叫一次。`returnToHall` 使 `transition ≠ null`，
// 既有的 `SceneTransitionOverlay` 當幀鎖住移動（layout effect），角色不會在門廊繼續往南、也不會重複觸發；
// 回大廳後房間子樹整棵卸載（`WorldCanvas` 以 scene 當 key），這個元件跟著消失，`fired` 也沒了。
//
// ⚠️ **不對稱不會傳送迴圈**（design D3）：回大廳後即使按著前進鍵也不會自動再進房 —— 進房一律要按 E。

export function RoomExitTrigger({ poseRef, onExit }: { poseRef: RefObject<LocalPose>; onExit: () => void }) {
  const fired = useRef(false)
  useFrame(() => {
    if (fired.current) return
    const p = poseRef.current
    if (p.z >= EXIT_TRIGGER.z && Math.abs(p.x) <= EXIT_TRIGGER.halfX) {
      fired.current = true
      onExit()
    }
  })
  return null
}
