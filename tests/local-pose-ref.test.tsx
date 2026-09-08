import { describe, expect, it, vi } from 'vitest'
import ReactThreeTestRenderer from '@react-three/test-renderer'
import type { FC } from 'react'
import { Vector3 } from 'three'
import { LocalPlayer, type LocalPlayerProps } from '@/world/player/LocalPlayer'

// 規格：openspec/specs/position-sync/spec.md
//   Requirement: 位置從專用的 ref 來，不是相機的跟隨目標 —— Scenario FE-R03-S01
//
// **這條 Scenario 原本沒有測試指著它** —— archive 之後的缺口報告抓到的。
// `FE-R03` 的其他五條都有，只有這一條漏了。
//
// 用 `@react-three/test-renderer` 的理由照 `player-no-rerender.test.tsx` 的檔頭：
// `LocalPlayer` 的行為全部在 `useFrame` 裡，而它讀的是 R3F 真的掛上去的
// `<group ref>`。mock 掉 `@react-three/fiber` 的話測到的是 mock 的形狀。

describe('本地角色的位置給網路層讀', () => {
  it('[FE-R03-S01] 角色移動時，專用的 ref 跟著更新，而且沒有 React 重繪', async () => {
    const targetRef = { current: new Vector3(0, 0, 0) }
    const poseRef = { current: { x: 0, z: 0, f: 0 } }

    const counted = vi.fn((props: LocalPlayerProps) => LocalPlayer(props))
    const Counted = counted as unknown as FC<LocalPlayerProps>

    const renderer = await ReactThreeTestRenderer.create(
      <Counted targetRef={targetRef} poseRef={poseRef} />,
    )
    const rendersBefore = counted.mock.calls.length

    // **等物理世界真的載進來。** Rapier 是 `await import(...)` ＋ `await init()`，
    // 不等的話走的是「物理還在載入」那一支的純位移 fallback ——
    // 測試照樣綠，但驗到的不是權威來源那條路徑。
    await ReactThreeTestRenderer.act(async () => {
      for (let i = 0; i < 50; i++) await new Promise((r) => setTimeout(r, 0))
    })

    // **是 `code` 不是 `key`** —— `LocalPlayer` 讀的是實體鍵位。
    await ReactThreeTestRenderer.act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowRight' }))
    })
    await ReactThreeTestRenderer.act(async () => {
      await renderer.advanceFrames(30, 1 / 60)
    })

    expect(poseRef.current.x, '角色往右走了，pose ref 的 x 沒有跟上').toBeGreaterThan(0)
    // 朝向也要寫進去 —— `move` 訊息需要它
    expect(poseRef.current.f, '向右的朝向是協定的 2').toBe(2)
    // 這個 ref 拿到的就是角色現在的位置
    expect(poseRef.current.x).toBeCloseTo(targetRef.current.x, 5)
    expect(poseRef.current.z).toBeCloseTo(targetRef.current.z, 5)

    expect(
      counted.mock.calls.length,
      '寫 pose ref 造成了 React 重繪 —— 那條路徑不該經過 React',
    ).toBe(rendersBefore)

    await ReactThreeTestRenderer.act(async () => {
      window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ArrowRight' }))
    })
  }, 60_000)
})
