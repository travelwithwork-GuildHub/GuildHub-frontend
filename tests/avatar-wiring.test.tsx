import { describe, expect, it } from 'vitest'
import ReactThreeTestRenderer from '@react-three/test-renderer'
import type { Mesh, MeshStandardMaterial } from 'three'
import { ChibiPlayer } from '@/world/player/ChibiPlayer'
import { RemotePlayers } from '@/world/RemotePlayers'
import type { RemoteIdentity, RemoteMotion } from '@/realtime/remotePlayers'

// 規格 `avatar-appearance`（`FE-W19`）的**接線那一半**。
//
// ⚠️⚠️ **`tests/avatar-look.test.ts` 驗的是映射函式，這一份驗的是有沒有人呼叫它。**
// 兩者缺一不可：映射再正確，沒有接上去的話畫面上還是同一隻 ——
// 而那正是這一項開工前的狀態（`av` 早就在 `RemoteIdentity` 裡，
// **沒有任何地方讀它**）。
//
// ⚠️ **這一份不驗「畫面上看得出差別」** —— 那要真的 WebGL 與像素判準，在 e2e。
// 這裡問的是比較弱但更早的一個問題：**材質的顏色有沒有跟著 `av` 變**。

/** 場景裡每一個 mesh 的顏色，依 mesh 在樹中的順序。 */
async function colorsOf(element: React.ReactElement): Promise<string[]> {
  const renderer = await ReactThreeTestRenderer.create(element)
  const out: string[] = []
  renderer.scene.allChildren.forEach(function walk(node) {
    const instance = node.instance as unknown as Mesh
    const material = instance.material as MeshStandardMaterial | undefined
    if (material?.color !== undefined) out.push(material.color.getHexString())
    node.allChildren.forEach(walk)
  })
  return out
}

const roster = (av: number): ReadonlyMap<string, RemoteIdentity> =>
  new Map([['someone', { id: 'someone', name: '別人', av }]])

/** 動態是空的：`RemotePlayer` 在 `track === undefined` 時保持原位，不會拋錯。 */
const NO_MOTION: ReadonlyMap<string, RemoteMotion> = new Map()

describe('av 有沒有真的接到角色上', () => {
  it('[FE-W19-S01] 本地角色的顏色跟著 `av` 變', async () => {
    const zero = await colorsOf(<ChibiPlayer av={0} />)
    const one = await colorsOf(<ChibiPlayer av={1} />)
    expect(zero.length, '沒有掃到任何材質 —— 那是這個測試的問題，不是產品的').toBeGreaterThan(0)
    expect(
      one,
      '`av` 換了但材質顏色一個都沒變 —— 角色元件沒有在讀 `av`',
    ).not.toEqual(zero)
  })

  it('[FE-W19-S04] 變的不只是眼睛', async () => {
    const zero = await colorsOf(<ChibiPlayer av={0} />)
    const one = await colorsOf(<ChibiPlayer av={1} />)
    const changed = zero.filter((c, i) => c !== one[i]).length
    // 角色一共 9 個 mesh：頭、兩顆眼睛、身體、四肢 ×4。
    // 只換眼睛的話最多變 2 個 —— 實測那在畫面上是 3.71%，遠低於 10% 的門檻。
    expect(
      changed,
      `只有 ${changed} 個材質變了。規格逐字：僅有眼睛等局部細節的差異 SHALL NOT 視為不同的 avatar`,
    ).toBeGreaterThan(2)
  })

  it('[FE-W19-S02] 遠端角色的顏色跟著名單上的 `av` 變', async () => {
    // ⚠️ **走完整條路徑**：名單 → `RemotePlayers` → `RemotePlayer` → `ChibiPlayer`。
    // 直接對 `avatarLook()` 斷言的話，這條判準證明不了任何接線 ——
    // 而「沒有接線」正是這一項開工前的狀態。
    const zero = await colorsOf(
      <RemotePlayers roster={roster(0)} motion={NO_MOTION} now={() => 0} />,
    )
    const one = await colorsOf(
      <RemotePlayers roster={roster(1)} motion={NO_MOTION} now={() => 0} />,
    )
    expect(zero.length, '遠端角色沒有渲染出任何材質').toBeGreaterThan(0)
    expect(
      one,
      '名單上的 `av` 換了但遠端角色的顏色沒變 —— `RemotePlayers` 沒有把 `av` 傳下去',
    ).not.toEqual(zero)
  })

  it('[FE-W19-S03] 同一個 `av`，本地與遠端長得一樣', async () => {
    const local = await colorsOf(<ChibiPlayer av={1} />)
    const remote = await colorsOf(
      <RemotePlayers roster={roster(1)} motion={NO_MOTION} now={() => 0} />,
    )
    expect(
      remote,
      '同一個 `av` 在本地與遠端畫出不同的外觀 —— 那代表兩邊用了不同的映射，而兩份一定會漂',
    ).toEqual(local)
  })

  it('[FE-W19-S07] 遠端送來值域外的 `av`，畫成預設而不是第二款', async () => {
    const zero = await colorsOf(
      <RemotePlayers roster={roster(0)} motion={NO_MOTION} now={() => 0} />,
    )
    const one = await colorsOf(
      <RemotePlayers roster={roster(1)} motion={NO_MOTION} now={() => 0} />,
    )
    const wild = await colorsOf(
      <RemotePlayers roster={roster(999)} motion={NO_MOTION} now={() => 0} />,
    )
    expect(wild, '`av=999` 沒有回到預設').toEqual(zero)
    expect(wild, '`av=999` 被畫成了第二款 —— 那是取模的症狀').not.toEqual(one)
  })
})
