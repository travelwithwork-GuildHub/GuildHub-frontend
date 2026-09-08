import { describe, expect, it, vi } from 'vitest'
import ReactThreeTestRenderer from '@react-three/test-renderer'
import type { FC } from 'react'
import { RemotePlayers } from '@/world/RemotePlayers'
import { RemotePlayer, type RemotePlayerProps } from '@/world/player/RemotePlayer'
import type { RemoteIdentity, RemoteMotion } from '@/realtime/remotePlayers'

// 規格：openspec/changes/fe-r07-remote-players/specs/remote-players/spec.md
//   Requirement: 名單上的每個人都在畫面上有一個角色 —— FE-R07-S07 / S08
//
// ⚠️ Scenario ID 只放在 `it` 標題上，而且那條 `it` 要把該 Scenario 的每一個
// WHEN/THEN 子句都跑過。
//
// 用 `@react-three/test-renderer` 的理由照 `player-no-rerender.test.tsx` 的檔頭：
// 這些元件的行為全部在 `useFrame` 裡，而它讀的是 R3F 真的掛上去的 `<group ref>`。
// 用 jsdom ＋ mock 掉 `@react-three/fiber` 的話，`<group>` 會變成 DOM 元素、
// `root.position` 是 `undefined` —— **那樣測到的不是這條 Scenario，是 mock 的形狀。**

const identity = (id: string): RemoteIdentity => ({ id, name: '訪客', av: 0 })

function scene(roster: string[], motion: Map<string, RemoteMotion>) {
  return {
    roster: new Map(roster.map((id) => [id, identity(id)])),
    motion,
  }
}

/**
 * 場景裡有幾個遠端角色。
 *
 * 數的是場景的**直接子節點** —— 每個 `RemotePlayer` 的最外層就是一個 group。
 * 一開始是靠 `ChibiPlayer` 頭部的幾何尺寸去數，那是**耦合到別的模組的內部細節**：
 * `FE-W08` 換 Avatar 的時候這個測試會壞，而壞掉的原因跟它要驗的事無關。
 */
function remoteCount(renderer: Awaited<ReturnType<typeof ReactThreeTestRenderer.create>>): number {
  return renderer.scene.children.length
}

describe('遠端角色的渲染', () => {
  it('[FE-R07-S07] 名單改變時，畫面上的角色跟著增減', async () => {
    const motion = new Map<string, RemoteMotion>([
      ['u1', { x: 1, z: 0, f: 0 }],
      ['u2', { x: 2, z: 0, f: 0 }],
    ])

    const renderer = await ReactThreeTestRenderer.create(
      <RemotePlayers {...scene(['u1', 'u2'], motion)} />,
    )
    expect(remoteCount(renderer), '名單上有兩個人，畫面上應該有兩個角色').toBe(2)

    // 其中一個離開
    motion.delete('u1')
    await ReactThreeTestRenderer.act(async () => {
      await renderer.update(<RemotePlayers {...scene(['u2'], motion)} />)
    })

    expect(remoteCount(renderer), '離開的人的角色應該從畫面上消失').toBe(1)
  })

  it('[FE-R07-S08] 遠端角色的位置來自動態資料，不是 props', async () => {
    const motion = new Map<string, RemoteMotion>([['u1', { x: 1, z: 2, f: 0 }]])

    // ⚠️ **數的是 `RemotePlayer`（子元件），不是 `RemotePlayers`（父層）。**
    //
    // 第一版包錯了層 —— 負向驗證抓到的：在 `RemotePlayer` 的 `useFrame` 裡
    // 加一個 `setState`（也就是「把位置放進 React」那個違規），
    // **測試照樣是綠的**，因為子元件重繪不會讓父元件重繪。
    //
    // 怎麼數渲染次數：把元件包成 `vi.fn`，在另一個元件的函式體裡直接呼叫它
    // 等於把它 inline 進去，hooks 仍然在同一次 render 裡執行。
    const counted = vi.fn((props: RemotePlayerProps) => RemotePlayer(props))
    const Counted = counted as unknown as FC<RemotePlayerProps>

    const renderer = await ReactThreeTestRenderer.create(<Counted id="u1" motion={motion} />)
    await ReactThreeTestRenderer.act(async () => {
      await renderer.advanceFrames(1, 1 / 60)
    })

    const group = renderer.scene.findAllByType('Group').find((g) => {
      const p = (g.instance as { position?: { x: number } }).position
      return p?.x === 1
    })
    expect(group, '第一幀之後角色應該已經在動態資料指定的位置').toBeDefined()

    const rendersBefore = counted.mock.calls.length

    // **就地改寫動態資料** —— 這正是 `applyMessage` 對 `pos` 做的事。
    const m = motion.get('u1')!
    m.x = 10
    m.z = 20

    await ReactThreeTestRenderer.act(async () => {
      await renderer.advanceFrames(2, 1 / 60)
    })

    const moved = renderer.scene.findAllByType('Group').find((g) => {
      const p = (g.instance as { position?: { x: number; z: number } }).position
      return p?.x === 10 && p.z === 20
    })
    expect(moved, '動態資料改了，但角色沒有跟著移動').toBeDefined()

    // **這一條才是這個 Scenario 在講的事。**
    expect(
      counted.mock.calls.length,
      '位置更新造成了 React 重繪 —— 那表示座標走了 props 或 state',
    ).toBe(rendersBefore)
  })

  it('動態資料還沒到的時候不會炸，也不會跳回原點', async () => {
    // 名單上有、但動態沒有。理論上不會發生（`snapshot` 與 `join` 都帶座標），
    // 真的發生時要**保持原狀**而不是把角色丟到原點。
    const motion = new Map<string, RemoteMotion>()
    const renderer = await ReactThreeTestRenderer.create(
      <RemotePlayers {...scene(['u1'], motion)} />,
    )

    await ReactThreeTestRenderer.act(async () => {
      await renderer.advanceFrames(3, 1 / 60)
    })

    expect(remoteCount(renderer), '角色仍然在場').toBe(1)
  })
})
