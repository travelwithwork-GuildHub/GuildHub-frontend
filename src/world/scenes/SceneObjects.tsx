'use client'

import type { RefObject } from 'react'
import type { RoomDoorOut } from '@/api/contract/rest'
import type { LabelAnchor } from '@/world/rooms/anchors'
import { BoardTargets } from '@/world/rooms/BoardTargets'
import { DoorLabelProjector } from '@/world/rooms/DoorLabelProjector'
import type { LabelNodes } from '@/world/rooms/DoorLabels'
import { ProjectDoors } from '@/world/rooms/ProjectDoors'
import type { DoorSlot } from '@/world/rooms/slots'
import type { SceneRef } from './registry'

// Canvas 裡面、隨場景不同的物件。規格 `FE-V01-S03`。
//
// ⚠️ **只屬於 Guild Hall 的東西在房間裡是「不掛」，不是「藏起來」。**
// 門的 `Interactable` 掛著就會註冊進互動系統 —— 房間裡走到某個座標會冒出「進入 星際導航」的提示，
// 而那扇門根本不在畫面上。
//
// 它是 `WorldCanvas` 的一部分拆出來的，理由只有一個：讓「房間裡沒有門的註冊」能用真的互動系統驗
// （`InteractionProvider` 在 `WorldCanvas` 裡面，從外面碰不到它的註冊表）。

export interface SceneObjectsProps {
  scene: SceneRef
  doors: readonly RoomDoorOut[]
  slots: readonly DoorSlot[]
  anchors: readonly LabelAnchor[]
  nodesRef: RefObject<LabelNodes>
}

export function SceneObjects({ scene, doors, slots, anchors, nodesRef }: SceneObjectsProps) {
  if (scene.id !== 'hall') return null
  return (
    <>
      {/* 走廊上依 `GET /api/rooms` 生成的門（`FE-W12-S01`）。 */}
      <ProjectDoors rooms={doors} slots={slots} />
      {/* 兩塊看板接上互動系統（`FE-W12-S14`）；按 E 開清單面板（`FE-B01-S01`／`S02`）。 */}
      <BoardTargets />
      {/* 把標籤釘在門上（`FE-W12-S10`）。**它渲染 null** —— 標籤本身是 Canvas 外面的 DOM。 */}
      <DoorLabelProjector anchors={anchors} nodesRef={nodesRef} />
    </>
  )
}
