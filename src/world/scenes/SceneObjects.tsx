'use client'

import type { RefObject } from 'react'
import type { RoomDoorOut } from '@/api/contract/rest'
import type { LabelAnchor } from '@/world/rooms/anchors'
import { BoardTargets } from '@/world/rooms/BoardTargets'
import { BoardSummaryProjector } from '@/world/rooms/BoardSummaryProjector'
import type { BoardSummaryNodes } from '@/world/rooms/BoardSummary'
import { DoorLabelProjector } from '@/world/rooms/DoorLabelProjector'
import type { LabelNodes } from '@/world/rooms/DoorLabels'
import { ProjectDoors } from '@/world/rooms/ProjectDoors'
import type { DoorSlot } from '@/world/rooms/slots'
import { SEAT_ANCHORS } from '@/world/seats/anchors'
import { SeatAnchorProjector } from '@/world/seats/SeatAnchorProjector'
import type { SeatAnchorNodes } from '@/world/seats/SeatAnchors'
import { Interactable } from '@/world/interaction/Interactable'
import { ENTRY } from '@/world/layout/projectRoomLayout'
import type { LocalPose } from '@/world/PositionSync'
import { RoomExitTrigger } from './RoomExitTrigger'
import type { SceneRef } from './registry'

/** 出口門前的互動提示（`FE-V01-S21`）。**元件常數，不是規格**（規格只寫「回到大廳」的意圖）。 */
export const ROOM_EXIT_LABEL = '回到大廳'

// Canvas 裡面、隨場景不同的物件。規格 `FE-V01-S03`。
//
// ⚠️ **只屬於 Guild Hall 的東西在房間裡是「不掛」，不是「藏起來」。**
// 門的 `Interactable` 掛著就會註冊進互動系統 —— 房間裡走到某個座標會冒出「進入 星際導航」的提示，
// 而那扇門根本不在畫面上。
//
// 它是 `WorldCanvas` 的一部分拆出來的，理由只有一個：讓「房間裡沒有門的註冊」能用真的互動系統驗
// （`InteractionProvider` 在 `WorldCanvas` 裡面，從外面碰不到它的註冊表）。
//
// 房間那一支只有工位錨點的投影器（`FE-W16-S06`）：桌椅本身走 `WorldShell` 的配置渲染，**不在這裡另畫、不註冊互動**
// （`FE-W16-S04`／`S07`；在這裡多寫一個 `<mesh>`，就是一個看得到但物理世界不知道的東西）。

export interface SceneObjectsProps {
  scene: SceneRef
  doors: readonly RoomDoorOut[]
  slots: readonly DoorSlot[]
  anchors: readonly LabelAnchor[]
  nodesRef: RefObject<LabelNodes>
  /** 工位錨點的 DOM 節點（`FE-W16-S06`）；錨點本身在 Canvas 外面（`SeatAnchors`），這裡的投影器每幀寫它們的位置。 */
  seatNodesRef: RefObject<SeatAnchorNodes>
  /** 看板摘要的 DOM 節點（`FE-W20`）；節點在 Canvas 外面（`BoardSummary`），這裡的 `BoardSummaryProjector` 每幀寫位置。只有 Guild Hall 用。 */
  boardNodesRef?: RefObject<BoardSummaryNodes>
  /** 對著門按 E（`FE-V01-S10`）。從 Canvas 外面用 `useRequestEntry()` 拿、當 prop 傳進來。 */
  requestEntry?: (projectId: string, title: string) => void
  /** 本地角色的權威狀態（`LocalPlayer` 每幀寫）。房間裡的穿門觸發器讀它（`FE-V01-S20`）。 */
  poseRef?: RefObject<LocalPose>
  /** 走出房間就回大廳（`FE-V01-S20`／`S21`）＝ `useScene().returnToHall`。穿門即走與門前按 E 都呼叫它。 */
  requestExit?: () => void
}

export function SceneObjects({ scene, doors, slots, anchors, nodesRef, seatNodesRef, boardNodesRef, requestEntry, poseRef, requestExit }: SceneObjectsProps) {
  if (scene.id === 'room') {
    // 把八個工位錨點釘在桌面中心上（`FE-W16-S06`）。**它渲染 null** —— 錨點本身是 Canvas 外面的 DOM。
    // 走出房間就回大廳（`FE-V01-S20`／`S21`）：南牆門洞是出口 —— 穿門即走（`RoomExitTrigger`），門前也有「回到大廳」提示可按 E。
    // 兩個入口都呼叫 `requestExit`（＝`returnToHall`）。`WorldCanvas` 一定會給 `poseRef`／`requestExit`；單獨渲染的測試沒給就只有工位錨點。
    return (
      <>
        <SeatAnchorProjector anchors={SEAT_ANCHORS} nodesRef={seatNodesRef} />
        {requestExit !== undefined && (
          <>
            {poseRef !== undefined && <RoomExitTrigger poseRef={poseRef} onExit={requestExit} />}
            <Interactable id="room-exit" x={ENTRY.doorX} z={ENTRY.wallZ} label={ROOM_EXIT_LABEL} onInteract={requestExit} />
          </>
        )}
      </>
    )
  }
  return (
    <>
      {/* 走廊上依 `GET /api/rooms` 生成的門（`FE-W12-S01`）。 */}
      <ProjectDoors rooms={doors} slots={slots} onEnter={requestEntry} />
      {/* 兩塊看板接上互動系統（`FE-W12-S14`）；按 E 開清單面板（`FE-B01-S01`／`S02`）。 */}
      <BoardTargets />
      {/* 把看板摘要釘在板面上（`FE-W20`）。**它渲染 null** —— 摘要本身是 Canvas 外面的 DOM（`BoardSummary`）。 */}
      {boardNodesRef !== undefined && <BoardSummaryProjector nodesRef={boardNodesRef} />}
      {/* 把標籤釘在門上（`FE-W12-S10`）。**它渲染 null** —— 標籤本身是 Canvas 外面的 DOM。 */}
      <DoorLabelProjector anchors={anchors} nodesRef={nodesRef} />
    </>
  )
}
