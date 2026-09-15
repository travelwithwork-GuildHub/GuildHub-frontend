import { describe, expect, it, vi } from 'vitest'
import ReactThreeTestRenderer from '@react-three/test-renderer'
import { FACING } from '@/world/coords'
import type { LocalPose } from '@/world/PositionSync'
import { Interactable } from '@/world/interaction/Interactable'
import { InteractionProvider } from '@/world/interaction/InteractionProvider'
import { SpatialInteraction } from '@/world/interaction/SpatialInteraction'
import { TUNING } from '@/world/interaction/tuning'

// 規格：openspec/changes/fe-n08-room-entry-gate/specs/room-entry-gate/spec.md
//   Requirement: 視窗開著就鎖住世界命令；Esc、關閉、Tab 照全站鍵盤規則 —— S02 的「再按 E 是空白的」在真瀏覽器裡的前提：
//   開出視窗的那一下 E 不能再變成一個 `e` 打進剛拿到焦點的密碼欄（瀏覽器驗收抓到：欄位裡有一個 e）。
//
// 獨立一個檔案：`interaction-loop.test.tsx` 裡各條測試的 renderer 不卸載，前面測試的 `SpatialInteraction` 還掛在 window 上聽 keydown、
// `currentId` 停在它們最後一幀的目標 —— 在那個檔案裡量「沒有目標時不擋」會被別條的殘留聽眾污染。

const pose = (x: number, z: number, f = FACING.down): { current: LocalPose } => ({ current: { x, z, f } })

describe('被世界吃掉的 E', () => {
  it('[FE-N08-S02] 有目標時那一下 E 的預設動作被擋掉（開出來的密碼欄不會收到一個 e）；沒有目標時不擋', async () => {
    const poseRef = pose(0, -0.9, FACING.down)
    const onInteract = vi.fn()
    const renderer = await ReactThreeTestRenderer.create(
      <InteractionProvider>
        <SpatialInteraction poseRef={poseRef} />
        <Interactable id="door" x={0} z={0} label="星際導航" onInteract={onInteract} />
      </InteractionProvider>,
    )
    await ReactThreeTestRenderer.act(async () => {
      await renderer.advanceFrames(2, 1 / 60)
    })
    const hit = new KeyboardEvent('keydown', { code: 'KeyE', cancelable: true })
    await ReactThreeTestRenderer.act(async () => {
      window.dispatchEvent(hit)
    })
    expect(onInteract).toHaveBeenCalledTimes(1)
    expect(hit.defaultPrevented, '被世界吃掉的 E 要擋掉預設動作，不然那個 e 會打進剛開出來的欄位').toBe(true)

    poseRef.current.z = TUNING.range + 5
    await ReactThreeTestRenderer.act(async () => {
      await renderer.advanceFrames(2, 1 / 60)
    })
    const miss = new KeyboardEvent('keydown', { code: 'KeyE', cancelable: true })
    await ReactThreeTestRenderer.act(async () => {
      window.dispatchEvent(miss)
    })
    expect(onInteract).toHaveBeenCalledTimes(1)
    expect(miss.defaultPrevented, '沒有目標的 E 不是世界的，不能擋').toBe(false)
  }, 60_000)

})
