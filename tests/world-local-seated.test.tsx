import { describe, expect, it } from 'vitest'
import ReactThreeTestRenderer from '@react-three/test-renderer'
import { Vector3, type Group } from 'three'
import { LocalPlayer } from '@/world/player/LocalPlayer'

// 規格：openspec/changes/fe-w14-pixel-restyle/specs/world-visual-polish/spec.md
//   FE-W14-S08（角色有可重用的坐姿姿勢）—— **每幀驅動四肢的實例**（`LocalPlayer` 的走路擺動）
//   在 `seated` 時 SHALL **跳過**每幀對四肢的擺動寫入，否則 `ChibiPlayer` 擺好的靜態坐姿
//   （大腿前彎、整體抬到椅面）會被每幀覆蓋掉。本 change 只做這個機制；何時 `seated=true`
//   （真的入座、就位、面向、起身）歸 `FE-J13`。
//
// 用 `@react-three/test-renderer`（照 `player-no-rerender.test.tsx` 的理由）：`LocalPlayer` 的
// 四肢寫入整個發生在 `useFrame` 裡，讀的是 R3F 真的掛上去的 `<group ref>`；jsdom＋mock 掉 R3F
// 測到的是 mock 的形狀，不是這條 Scenario。

type Renderer = Awaited<ReturnType<typeof ReactThreeTestRenderer.create>>

/** LocalPlayer 根 group（場景第一個子節點）底下、名字為 `name` 的關節 group 的 `rotation.x`。 */
function jointX(renderer: Renderer, name: string): number {
  const root = renderer.scene.children[0]!.instance as unknown as Group
  const joint = root.getObjectByName(name)
  if (!joint) throw new Error(`找不到關節 group「${name}」—— CHIBI_PARTS 的名字是契約`)
  return joint.rotation.x
}

describe('LocalPlayer 坐姿（驅動實例跳過每幀擺動）', () => {
  it('[FE-W14-S08] seated 時大腿維持前彎，不被每幀走路擺動覆蓋', async () => {
    const targetRef = { current: new Vector3(0, 0, 0) }
    // 給網路層的 pose ref —— 這條測試跟它無關，但它是必填 prop（同 player-no-rerender）。
    const poseRef = { current: { x: 0, z: 0, f: 0 } }

    const renderer = await ReactThreeTestRenderer.create(
      <LocalPlayer targetRef={targetRef} poseRef={poseRef} seated />,
    )

    // 推進幾幀 —— `useFrame` 正是「寫入（或本 fix 跳過）四肢角度」的地方。
    // **一定要包在 `act` 裡**（同 player-no-rerender：不包的話 frame callback 的效果不會 flush）。
    await ReactThreeTestRenderer.act(async () => {
      await renderer.advanceFrames(10, 1 / 60)
    })

    // 沒有這個 fix 的話，`LocalPlayer` 每幀把 `pose.swing`（idle 接近 0）寫進大腿 `rotation.x`，
    // 把 `ChibiPlayer` 的坐姿角度（-1.32）覆蓋掉 —— 這裡就會是接近 0、不再 < -0.5。
    expect(jointX(renderer, 'leftLeg'), 'seated 左大腿被走路擺動覆蓋了').toBeLessThan(-0.5)
    expect(jointX(renderer, 'rightLeg'), 'seated 右大腿被走路擺動覆蓋了').toBeLessThan(-0.5)

    await renderer.unmount()
  }, 30_000)
})
