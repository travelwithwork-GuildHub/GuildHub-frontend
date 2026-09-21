import { describe, expect, it, vi } from 'vitest'
import ReactThreeTestRenderer from '@react-three/test-renderer'
import { useEffect, type RefObject } from 'react'
import { FACING } from '@/world/coords'
import type { LocalPose } from '@/world/PositionSync'
import { RoomExitTrigger } from '@/world/scenes/RoomExitTrigger'
import { SceneObjects, ROOM_EXIT_LABEL } from '@/world/scenes/SceneObjects'
import { InteractionProvider, useInteraction } from '@/world/interaction/InteractionProvider'
import { ListPanelProvider } from '@/list-panel/ListPanelProvider'
import { EXIT_TRIGGER } from '@/world/layout/projectRoomLayout'
import { ENTRY } from '@/world/layout/projectRoomLayout'
import type { SceneRef } from '@/world/scenes/registry'

// 走出房間就回大廳。規格 `FE-V01-S20`（穿門即走）／`S21`（門前按 E）。
//
// `RoomExitTrigger` 的行為全在 `useFrame` 裡 → 用 `@react-three/test-renderer` 真的推進幀（mock 掉 fiber 會測到 mock 的形狀）。
// 「按 E → onInteract」那半截由既有的互動系統驗（`interaction-loop`／`world-scenes-door`）；這裡驗**註冊的內容對不對**。

const poseAt = (x: number, z: number): RefObject<LocalPose> => ({ current: { x, z, f: FACING.down } })

describe('穿門即走（FE-V01-S20）', () => {
  it('正常走動（z<10.5）不觸發；穿過門檻觸發恰一次；之後多幀不再觸發', async () => {
    const onExit = vi.fn()
    const pose = poseAt(0, 6.75) // 出生點
    const renderer = await ReactThreeTestRenderer.create(<RoomExitTrigger poseRef={pose} onExit={onExit} />)

    // 房間裡走到門附近但沒穿過（z 一直 < 觸發門檻）
    pose.current = { x: 0, z: 9.0, f: FACING.down }
    await renderer.advanceFrames(3, 1 / 60)
    expect(onExit).not.toHaveBeenCalled()

    // 往南穿過門洞、到達觸發區
    pose.current = { x: 0, z: EXIT_TRIGGER.z, f: FACING.down }
    await renderer.advanceFrames(1, 1 / 60)
    expect(onExit).toHaveBeenCalledTimes(1)

    // 繼續往南、再跑幾幀：仍只一次（`fired` 一次性）
    pose.current = { x: 0, z: 11.5, f: FACING.down }
    await renderer.advanceFrames(4, 1 / 60)
    expect(onExit).toHaveBeenCalledTimes(1)
  })

  it('到門檻 z 但偏離門洞（|x| > halfX）不觸發 —— 要在門洞裡穿過去', async () => {
    const onExit = vi.fn()
    const pose = poseAt(EXIT_TRIGGER.halfX + 0.15, EXIT_TRIGGER.z)
    const renderer = await ReactThreeTestRenderer.create(<RoomExitTrigger poseRef={pose} onExit={onExit} />)
    await renderer.advanceFrames(4, 1 / 60)
    expect(onExit).not.toHaveBeenCalled()
  })

  it('觸發門檻在門洞以南（門是出口的內界）、且在門洞寬度內', () => {
    expect(EXIT_TRIGGER.z).toBeGreaterThan(ENTRY.wallZ) // 門在 9.75，門檻在它以南 → 要穿過門才觸發
    expect(EXIT_TRIGGER.halfX).toBeLessThanOrEqual(ENTRY.gapWidth / 2) // 門洞半寬 0.9，觸發要求人在門洞裡
  })
})

/** 讀互動註冊表 —— `useInteraction().registry` 是穩定物件，effect 後 `entries` 已含註冊的目標。 */
function RegistrySpy({ onRegistry }: { onRegistry: (r: ReturnType<typeof useInteraction>['registry']) => void }) {
  const { registry } = useInteraction()
  useEffect(() => {
    onRegistry(registry)
  })
  return null
}

describe('門前按 E 離開（FE-V01-S21）', () => {
  const roomScene: SceneRef = { id: 'room', projectId: '11111111-1111-4111-8111-111111111111' }
  const hallScene: SceneRef = { id: 'hall' }
  const emptyRefs = () => ({ nodesRef: { current: new Map() }, seatNodesRef: { current: new Map() } })

  it('room 場景註冊 room-exit（提示「回到大廳」、onInteract 呼叫 requestExit）', async () => {
    const requestExit = vi.fn()
    let registry: ReturnType<typeof useInteraction>['registry'] | null = null
    const { nodesRef, seatNodesRef } = emptyRefs()
    await ReactThreeTestRenderer.create(
      <InteractionProvider>
        <RegistrySpy onRegistry={(r) => (registry = r)} />
        <SceneObjects
          scene={roomScene}
          doors={[]}
          slots={[]}
          anchors={[]}
          nodesRef={nodesRef}
          seatNodesRef={seatNodesRef}
          poseRef={poseAt(0, 6.75)}
          requestExit={requestExit}
        />
      </InteractionProvider>,
    )
    const entry = registry!.entries.get('room-exit')
    expect(entry).toBeDefined()
    expect(entry!.label).toBe(ROOM_EXIT_LABEL)
    expect(entry!.x).toBe(ENTRY.doorX)
    expect(entry!.z).toBe(ENTRY.wallZ)
    entry!.onInteract?.()
    expect(requestExit).toHaveBeenCalledTimes(1)
  })

  it('hall 場景沒有 room-exit（出口只屬於房間）', async () => {
    let registry: ReturnType<typeof useInteraction>['registry'] | null = null
    const { nodesRef, seatNodesRef } = emptyRefs()
    await ReactThreeTestRenderer.create(
      // 大廳分支渲染 `BoardTargets`（需要 `ListPanelProvider`，而它自己又需要 `InteractionProvider` 在外層）；這裡只關心「有沒有 room-exit」。
      <InteractionProvider>
        <RegistrySpy onRegistry={(r) => (registry = r)} />
        <ListPanelProvider>
          <SceneObjects
            scene={hallScene}
            doors={[]}
            slots={[]}
            anchors={[]}
            nodesRef={nodesRef}
            seatNodesRef={seatNodesRef}
            poseRef={poseAt(0, -1)}
            requestExit={vi.fn()}
          />
        </ListPanelProvider>
      </InteractionProvider>,
    )
    expect(registry!.entries.get('room-exit')).toBeUndefined()
  })
})
