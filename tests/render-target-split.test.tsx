import { describe, expect, it } from 'vitest'
import ReactThreeTestRenderer from '@react-three/test-renderer'
import { Vector3 } from 'three'
import { LocalPlayer } from '@/world/player/LocalPlayer'
import { MOVE_SPEED } from '@/world/player/movement'
import { PHYSICS } from '@/world/physics/world'

// 規格：openspec/changes/fe-w03-render-interpolation/specs/world-player/spec.md
//   Requirement: 相機跟隨畫面位置，網路送出物理位置 —— FE-W03-S17
//
// 用 `@react-three/test-renderer` 的理由照 `player-no-rerender.test.tsx` 的檔頭：
// `LocalPlayer` 的行為全部在 `useFrame` 裡，而它讀的是 R3F 真的掛上去的
// `<group ref>`。mock 掉 `@react-three/fiber` 的話測到的是 mock 的形狀。

/** 刻意**不是** `fixedStep` 的整數倍 —— 那樣 `alpha` 才會落在 0 與 1 之間。 */
const ODD_DT = PHYSICS.fixedStep * 1.37

describe('相機與網路拿到不同的位置', () => {
  it('[FE-W03-S17] 相機拿畫面位置、網路拿物理位置，而且兩者不相等', async () => {
    const targetRef = { current: new Vector3(0, 0, 0) }
    const poseRef = { current: { x: 0, z: 0, f: 0 } }

    const renderer = await ReactThreeTestRenderer.create(
      <LocalPlayer targetRef={targetRef} poseRef={poseRef} />,
    )

    // **等 Rapier 真的載進來。** 不等的話走的是「物理還在載入」那一支的
    // 純位移 fallback —— 那一支沒有插值，兩個出口會相等，這條會假紅。
    await ReactThreeTestRenderer.act(async () => {
      for (let i = 0; i < 50; i++) await new Promise((r) => setTimeout(r, 0))
    })

    await ReactThreeTestRenderer.act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowRight' }))
    })
    await ReactThreeTestRenderer.act(async () => {
      for (let i = 0; i < 20; i++) await renderer.advanceFrames(1, ODD_DT)
    })

    const physics = poseRef.current.x
    const rendered = targetRef.current.x

    expect(physics, '角色沒有往右走 —— 下面每一條都不算數').toBeGreaterThan(0)

    // 畫面落後物理，落差在 0 與一個固定步之間。
    const lag = physics - rendered
    expect(lag, `畫面竟然跑在物理前面（落差 ${lag}）`).toBeGreaterThan(0)
    expect(lag, `落差 ${lag} 超過一個固定步`).toBeLessThanOrEqual(
      MOVE_SPEED * PHYSICS.fixedStep + 1e-6,
    )

    // ⚠️ **這一條是整條 Scenario 的重點。**
    // 少了它，一個「兩個出口都寫同一個值」的實作會通過 ——
    // 而那正是這條要防的兩種錯誤（相機跟著跳、或送出去的位置被延遲）。
    expect(physics, '兩個出口拿到同一個值 —— 相機會跟著物理位置跳').not.toBe(rendered)

    await ReactThreeTestRenderer.act(async () => {
      window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ArrowRight' }))
    })
  }, 60_000)
})
