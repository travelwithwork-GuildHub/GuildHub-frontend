import { describe, expect, it, vi } from 'vitest'
import ReactThreeTestRenderer from '@react-three/test-renderer'
import { useEffect, useState, type ReactNode, type RefObject } from 'react'
import { FACING } from '@/world/coords'
import type { LocalPose } from '@/world/PositionSync'
import { Interactable } from '@/world/interaction/Interactable'
import { InteractionProvider, useInteraction } from '@/world/interaction/InteractionProvider'
import { SpatialInteraction } from '@/world/interaction/SpatialInteraction'
import { TUNING } from '@/world/interaction/tuning'

// 規格：openspec/specs/spatial-interaction/spec.md
//   Requirement: 目標改變才通知 React —— Scenario FE-W06-S08 / S09
//   Requirement: `E` 只作用在目前的目標 —— S10 / S11 / S12
//   Requirement: 物件自己註冊，卸載時自己註銷 —— S15
//
// 用 `@react-three/test-renderer` 的理由跟 `player-no-rerender.test.tsx` 一樣：
// `SpatialInteraction` 的行為全部在 `useFrame` 裡，mock 掉 `@react-three/fiber`
// 的話測到的是 mock 的形狀。
//
// ⚠️ **這個檔案裡的 `<InteractionProvider>` 與 consumer 都是真的正式碼**，
// 只有「把 target 讀出來數次數」那個小元件是測試自己的。

/** 把每次 context 更新記下來 —— `FE-W06-S08` 要數的就是這個。 */
function Spy({ onValue }: { onValue: (id: string | null, label: string | null) => void }) {
  const { target } = useInteraction()
  onValue(target.id, target.label)
  return null
}

function Harness({ poseRef, children }: { poseRef: { current: LocalPose }; children: ReactNode }) {
  return (
    <InteractionProvider>
      <SpatialInteraction poseRef={poseRef} />
      {children}
    </InteractionProvider>
  )
}

const pose = (x: number, z: number, f = FACING.down): { current: LocalPose } => ({
  current: { x, z, f },
})

/**
 * 可以從測試外面拿掉的一段子樹。
 *
 * ⚠️ **用 ref 當 prop 交出去，而且只在 effect 裡寫。**
 * 在 render 期間指派給外部變數會被 `react-hooks/globals` 擋，
 * 直接改 prop 物件會被 `react-hooks/immutability` 擋 —— **兩條規則都是對的**。
 * 傳 ref 是這個 repo 既有的模式（`targetRef`、`poseRef`）。
 */
function Removable({
  controlsRef,
  children,
}: {
  controlsRef: RefObject<{ remove?: () => void }>
  children: ReactNode
}) {
  const [alive, setAlive] = useState(true)
  useEffect(() => {
    controlsRef.current.remove = () => setAlive(false)
  }, [controlsRef])
  return alive ? children : null
}

describe('互動目標接上 render loop', () => {
  it('[FE-W06-S08] 走在兩個物件之間很多幀，React 更新次數不隨幀數成長', async () => {
    const poseRef = pose(0, -1.5)
    const seen: Array<string | null> = []

    const renderer = await ReactThreeTestRenderer.create(
      <Harness poseRef={poseRef}>
        <Interactable id="left" x={-1} z={0} label="左" />
        <Interactable id="right" x={1} z={0} label="右" />
        <Spy onValue={(id) => seen.push(id)} />
      </Harness>,
    )

    const before = seen.length
    // 在等分數線附近逐幀微幅來回 —— 最壞的實際情況是一整幀的走路距離
    const amplitude = 4 / 60
    for (let frame = 0; frame < 90; frame++) {
      poseRef.current.x = (frame % 2 === 0 ? 1 : -1) * amplitude
      await ReactThreeTestRenderer.act(async () => {
        await renderer.advanceFrames(1, 1 / 60)
      })
    }
    const updates = seen.length - before

    // 目標在整段過程中只從「沒有」變成某一個，之後不再改變
    expect(updates, `90 幀裡 context 更新了 ${updates} 次 —— 提示會閃爍`).toBeLessThanOrEqual(2)
    // 防恆真：如果一次都沒更新，代表這條測的可能是「互動層根本沒接上」
    expect(updates, '一次都沒更新 —— 互動層沒有接上').toBeGreaterThan(0)
  }, 60_000)

  it('[FE-W06-S09] 走出所有範圍時，收到「沒有目標」', async () => {
    const poseRef = pose(0, 1)
    const seen: Array<string | null> = []

    const renderer = await ReactThreeTestRenderer.create(
      <Harness poseRef={poseRef}>
        <Interactable id="board" x={0} z={0} label="專案看板" />
        <Spy onValue={(id) => seen.push(id)} />
      </Harness>,
    )
    await ReactThreeTestRenderer.act(async () => {
      await renderer.advanceFrames(2, 1 / 60)
    })
    expect(seen.at(-1)).toBe('board')

    poseRef.current.z = TUNING.range + 5
    await ReactThreeTestRenderer.act(async () => {
      await renderer.advanceFrames(2, 1 / 60)
    })

    expect(seen.at(-1), '走出範圍之後目標還在').toBeNull()
  }, 60_000)

  it('[FE-W06-S15] 物件卸載之後不得再是目標', async () => {
    const poseRef = pose(0, 1)
    const seen: Array<string | null> = []

    const controlsRef: RefObject<{ remove?: () => void }> = { current: {} }

    const renderer = await ReactThreeTestRenderer.create(
      <Harness poseRef={poseRef}>
        <Removable controlsRef={controlsRef}>
          <Interactable id="board" x={0} z={0} label="專案看板" />
        </Removable>
        <Spy onValue={(id) => seen.push(id)} />
      </Harness>,
    )
    await ReactThreeTestRenderer.act(async () => {
      await renderer.advanceFrames(2, 1 / 60)
    })
    expect(seen.at(-1)).toBe('board')

    await ReactThreeTestRenderer.act(async () => {
      controlsRef.current.remove?.()
    })
    await ReactThreeTestRenderer.act(async () => {
      await renderer.advanceFrames(2, 1 / 60)
    })

    // 角色沒有動，物件消失了 —— 目標必須跟著消失
    expect(seen.at(-1), '物件卸載之後還是目標').toBeNull()
  }, 60_000)

  it('[FE-W06-S10] 按 E 只觸發目前的目標', async () => {
    const poseRef = pose(0, -0.9, FACING.down)
    const near = vi.fn()
    const far = vi.fn()

    const renderer = await ReactThreeTestRenderer.create(
      <Harness poseRef={poseRef}>
        <Interactable id="near" x={0} z={0} label="近" onInteract={near} />
        <Interactable id="far" x={1.4} z={0} label="遠" onInteract={far} />
      </Harness>,
    )
    await ReactThreeTestRenderer.act(async () => {
      await renderer.advanceFrames(2, 1 / 60)
    })
    await ReactThreeTestRenderer.act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE' }))
    })

    expect(near).toHaveBeenCalledTimes(1)
    expect(far, '範圍內的其他物件也被觸發了').not.toHaveBeenCalled()
  }, 60_000)

  it('[FE-W06-S11] 沒有目標時按 E 不得拋錯，也不得觸發任何東西', async () => {
    const poseRef = pose(0, TUNING.range + 5)
    const onInteract = vi.fn()

    const renderer = await ReactThreeTestRenderer.create(
      <Harness poseRef={poseRef}>
        <Interactable id="board" x={0} z={0} label="專案看板" onInteract={onInteract} />
      </Harness>,
    )
    await ReactThreeTestRenderer.act(async () => {
      await renderer.advanceFrames(2, 1 / 60)
    })
    await ReactThreeTestRenderer.act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE' }))
    })

    expect(onInteract).not.toHaveBeenCalled()
  }, 60_000)

  it('[FE-W06-S12] 目標在按鍵被處理之前註銷 —— 不得觸發已消失的物件', async () => {
    const poseRef = pose(0, 1)
    const onInteract = vi.fn()
    const controlsRef: RefObject<{ remove?: () => void }> = { current: {} }

    const renderer = await ReactThreeTestRenderer.create(
      <Harness poseRef={poseRef}>
        <Removable controlsRef={controlsRef}>
          <Interactable id="board" x={0} z={0} label="專案看板" onInteract={onInteract} />
        </Removable>
      </Harness>,
    )
    // 先讓它成為目標
    await ReactThreeTestRenderer.act(async () => {
      await renderer.advanceFrames(2, 1 / 60)
    })
    // **卸載之後不再跑任何一幀** —— 這正是那段空窗：
    // render loop 算出來的目標還在 ref 裡，而註冊表已經沒有它了
    await ReactThreeTestRenderer.act(async () => {
      controlsRef.current.remove?.()
    })
    await ReactThreeTestRenderer.act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE' }))
    })

    expect(onInteract, '觸發了一個已經註銷的物件').not.toHaveBeenCalled()
  }, 60_000)
})
