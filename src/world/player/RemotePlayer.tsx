'use client'

import type {} from '@react-three/fiber'
import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import type { Group } from 'three'
import type { Facing } from '@/world/coords'
import type { RemoteMotion } from '@/realtime/remotePlayers'
import { ChibiPlayer } from './ChibiPlayer'
import { FACING_ROTATION } from './facing'

// 一個遠端角色。規格 FE-R07。
//
// ⚠️ **座標與朝向不是 props。** 它只收一個穩定的 `id`，
// 在 render loop 裡自己去讀 —— 位置每秒變 10 次，當成 props 傳
// 就是每秒 10 次 React 重繪 × 40 個角色（`CONTEXT.md`：高頻資料不進 React）。
//
// ⚠️ **這一刀的遠端角色每 100 毫秒跳一格**（後端 `HZ = 10`）。
// 那不是缺陷，是這一刀的範圍 —— previous / target、平滑、jitter、缺包、
// teleport threshold 全部屬於 `FE-R08`。朝向同樣是直接切換。
//
// 也**沒有走路動畫**：判斷「這個人在不在走」要比對前後兩個位置，
// 而那正是 `FE-R08` 要建立的 previous／target。在這裡先做一個近似值，
// 之後會變成兩份互相打架的判斷。

export interface RemotePlayerProps {
  id: string
  /**
   * 動態資料。**傳的是那個 Map 本身**（它的身分是穩定的，只被就地改寫），
   * 所以這個 prop 不會造成重繪。
   */
  motion: ReadonlyMap<string, RemoteMotion>
}

export function RemotePlayer({ id, motion }: RemotePlayerProps) {
  const rootRef = useRef<Group>(null)

  useFrame(() => {
    const root = rootRef.current
    // ⚠️ **卸載與 render loop 有競態。** `leave` 造成的卸載可能發生在
    // 這一幀之前，那時 ref 已經是 null —— 不擋的話使用者離開就噴紅字。
    if (!root) return

    const m = motion.get(id)
    // 名單上有、但動態還沒到（理論上不會發生：`snapshot` 與 `join` 都帶座標）。
    // 真的發生的話**保持上一個位置**，不要跳回原點。
    if (m === undefined) return

    root.position.x = m.x
    root.position.z = m.z
    root.rotation.y = FACING_ROTATION[m.f as Facing] ?? 0
  })

  return (
    <group ref={rootRef}>
      <ChibiPlayer />
    </group>
  )
}
