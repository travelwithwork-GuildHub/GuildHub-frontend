import { describe, expect, it, vi } from 'vitest'
import ReactThreeTestRenderer from '@react-three/test-renderer'
import type { FC } from 'react'
import { RemotePlayers } from '@/world/RemotePlayers'
import { RemotePlayer, type RemotePlayerProps } from '@/world/player/RemotePlayer'
import type { RemoteIdentity, RemoteMotion } from '@/realtime/remotePlayers'
import { RENDER_DELAY_MS, appendSample, createTrack } from '@/realtime/interpolation'

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

/** 測試用的時鐘。**元件不自己取時間**，一律用這個。 */
let clock = 1000
const now = () => clock

/** 一條只有一筆樣本的軌跡 —— 那一筆當下就看得到（游標早於它，夾住）。 */
function trackAt(x: number, z: number, f = 0): RemoteMotion {
  const track = createTrack()
  appendSample(track, { x, z, f }, clock)
  return track
}

function scene(roster: string[], motion: Map<string, RemoteMotion>) {
  return {
    roster: new Map(roster.map((id) => [id, identity(id)])),
    motion,
    now,
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

type Renderer = Awaited<ReturnType<typeof ReactThreeTestRenderer.create>>

/**
 * 場景裡第一個角色最外層 group 目前的 `x`。
 *
 * **讀的是 three 的物件，不是 React 的任何東西** —— 這一層的行為整個發生在
 * `useFrame` 裡，位置從頭到尾沒有進過 React。
 */
function groupX(renderer: Renderer): number {
  const root = renderer.scene.children[0]!.instance as unknown as { position: { x: number } }
  return root.position.x
}

/**
 * 推進 `frames` 幀，並把 render loop 裡拋出的錯誤**抓回來**。
 *
 * ⚠️ **直接 `await advanceFrames(...)` 抓不到 render loop 的錯誤。**
 * `@react-three/test-renderer` 是這樣跑每一幀的：
 *
 * ```js
 * promises.push(new Promise(() => subscriber.ref.current(state, delta)))
 * Promise.all(promises)   // ← 沒有 return、沒有 await
 * ```
 *
 * callback 在 `Promise` 的 executor 裡**同步**跑，所以一拋錯就變成那個 promise 的
 * rejection；而 `Promise.all` 的結果沒有被接住，於是整件事變成 **unhandled
 * rejection** —— `try/catch` 抓不到，`expect(...).rejects` 也等不到。
 *
 * 實測：把 `RemotePlayer` 的樣本守衛拿掉，`evaluate(undefined, …)` 確實拋了
 * `TypeError`，但 vitest 只在報告尾巴印一行 `Errors 1 error`，**那條測試照樣是綠的**。
 * 所以「不拋錯」這種 Scenario 在這個 renderer 上一定要自己接 `unhandledRejection`，
 * 否則寫出來的是一條**永遠不會紅**的測試。
 */
async function advanceCatching(renderer: Renderer, frames: number): Promise<unknown[]> {
  const caught: unknown[] = []
  const trap = (e: unknown) => caught.push(e)
  process.on('unhandledRejection', trap)
  try {
    await ReactThreeTestRenderer.act(async () => {
      await renderer.advanceFrames(frames, 1 / 60)
    })
    // unhandled rejection 要等這一輪 macrotask 結束才會被回報。
    await new Promise((resolve) => setTimeout(resolve, 0))
  } finally {
    process.off('unhandledRejection', trap)
  }
  return caught
}

describe('遠端角色的渲染', () => {
  it('[FE-R07-S07] 名單改變時，畫面上的角色跟著增減', async () => {
    const motion = new Map<string, RemoteMotion>([
      ['u1', trackAt(1, 0)],
      ['u2', trackAt(2, 0)],
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
    const motion = new Map<string, RemoteMotion>([['u1', trackAt(1, 2)]])

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

    const renderer = await ReactThreeTestRenderer.create(
      <Counted id="u1" motion={motion} now={now} />,
    )
    await ReactThreeTestRenderer.act(async () => {
      await renderer.advanceFrames(1, 1 / 60)
    })

    const group = renderer.scene.findAllByType('Group').find((g) => {
      const p = (g.instance as { position?: { x: number } }).position
      return p?.x === 1
    })
    expect(group, '第一幀之後角色應該已經在動態資料指定的位置').toBeDefined()

    const rendersBefore = counted.mock.calls.length

    // **就地追加一筆樣本** —— 這正是 `applyMessage` 對 `pos` 做的事。
    appendSample(motion.get('u1')!, { x: 10, z: 20, f: 0 }, clock)
    // 有 250 毫秒的 render delay，所以要把**注入的時鐘**推過去才會走到。
    clock += RENDER_DELAY_MS

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

  it('[FE-R08-S12] 插值的每一幀都改變 transform，而且都不觸發 React 重繪', async () => {
    const FRAME_MS = 1000 / 60
    /** 6 幀約 100 毫秒 —— 也就是後端量到的 10 Hz。**中間那 5 幀才是重點。** */
    const SAMPLE_EVERY = 6

    // ⚠️ **先鋪一段已經在過去的歷史。**
    // 剛 `join` 的頭 250 毫秒游標比第一筆樣本還早，畫面**本來就該是靜止的**
    // （`FE-R08-S14`）。從那裡開始量會把「還沒開始動」誤判成「不會動」，
    // 而那條測試會在正式碼完全正確的時候紅。
    const track = createTrack()
    const START = clock
    for (let i = 0; i <= 6; i++) {
      appendSample(track, { x: i, z: 0, f: 0 }, START - 600 + i * 100)
    }
    const motion = new Map<string, RemoteMotion>([['u1', track]])

    // 數重繪次數的手法同 `FE-R07-S08`：包成 `vi.fn` 再 inline 呼叫，
    // hooks 仍然在同一次 render 裡執行。**數的是子元件**，父層數不到違規。
    const counted = vi.fn((props: RemotePlayerProps) => RemotePlayer(props))
    const Counted = counted as unknown as FC<RemotePlayerProps>

    const renderer = await ReactThreeTestRenderer.create(
      <Counted id="u1" motion={motion} now={now} />,
    )
    await ReactThreeTestRenderer.act(async () => {
      await renderer.advanceFrames(1, 1 / 60)
    })
    const rendersBefore = counted.mock.calls.length

    const xs: number[] = []
    let nextX = 7
    for (let frame = 0; frame < 36; frame++) {
      clock += FRAME_MS
      if (frame % SAMPLE_EVERY === SAMPLE_EVERY - 1) {
        appendSample(track, { x: nextX++, z: 0, f: 0 }, clock)
      }
      await ReactThreeTestRenderer.act(async () => {
        await renderer.advanceFrames(1, 1 / 60)
      })
      xs.push(groupX(renderer))
    }

    const stuck = xs.filter((x, i) => i > 0 && x === xs[i - 1]).length
    expect(
      stuck,
      `36 幀裡有 ${stuck} 幀跟前一幀完全一樣 —— 那就是跳格。` +
        '只有六分之一的幀有新樣本，其餘五幀要靠插值才會動',
    ).toBe(0)

    // ⚠️ **兩個斷言要在同一條裡。** 只驗這一條的話，
    // render loop 什麼都不做（角色整場不動）也會綠。
    expect(
      counted.mock.calls.length,
      '插值造成了 React 重繪 —— 那表示位置走了 props 或 state',
    ).toBe(rendersBefore)
  })

  it('[FE-R08-S19] 寫入與求值用的是同一個注入時鐘', async () => {
    // ⚠️ **基準刻意選一個遠大於 `performance.now()` 的數字。**
    // 這樣「求值端自己去拿 `performance.now()`」的錯誤實作，游標會遠早於
    // 第一筆樣本、被夾在它上面永遠不動 —— 也就是這條測試會紅。
    // 用一個接近真實 `performance.now()` 的基準的話，那個 bug 會躲過去。
    let fake = 1_000_000
    const fakeNow = () => fake

    const GAP = 100
    const track = createTrack()
    appendSample(track, { x: 3, z: 0, f: 0 }, fakeNow())
    fake += GAP
    appendSample(track, { x: 13, z: 0, f: 0 }, fakeNow())
    const motion = new Map<string, RemoteMotion>([['u1', track]])

    const renderer = await ReactThreeTestRenderer.create(
      <RemotePlayer id="u1" motion={motion} now={fakeNow} />,
    )
    await ReactThreeTestRenderer.act(async () => {
      await renderer.advanceFrames(1, 1 / 60)
    })
    // `x = 3` 而不是 `0`：這一條同時證明了 transform 真的被寫過。
    expect(groupX(renderer), '第二筆剛到，畫面本來就該還在第一筆上').toBeCloseTo(3, 6)

    // **只推進假時鐘，真實時間完全不動。**
    // 這一段在畫面上的時間窗是 `[t1 + D, t2 + D]`，所以從 `t2` 往前推
    // `D − GAP/2` 才會走到中點。
    fake += RENDER_DELAY_MS - GAP / 2
    await ReactThreeTestRenderer.act(async () => {
      await renderer.advanceFrames(1, 1 / 60)
    })
    const mid = groupX(renderer)
    expect(mid, '假時鐘推進了畫面卻沒動 —— 求值端用的不是寫入端那個時鐘').toBeGreaterThan(3)
    expect(mid).toBeLessThan(13)

    fake += GAP / 2
    await ReactThreeTestRenderer.act(async () => {
      await renderer.advanceFrames(1, 1 / 60)
    })
    expect(
      groupX(renderer),
      '假時鐘總共推進 RENDER_DELAY 之後，位置應該正好是第二個樣本',
    ).toBeCloseTo(13, 6)
  })

  it('[FE-R08-S20] 樣本已經被清掉，但角色還沒卸載', async () => {
    const motion = new Map<string, RemoteMotion>([['u1', trackAt(4, 5)]])
    const renderer = await ReactThreeTestRenderer.create(
      <RemotePlayers {...scene(['u1'], motion)} />,
    )
    await ReactThreeTestRenderer.act(async () => {
      await renderer.advanceFrames(1, 1 / 60)
    })
    const before = groupX(renderer)
    expect(before, '前置條件：transform 要先被真的寫過').toBeCloseTo(4, 6)

    // `leave` 做的事：**就地**把 entry 刪掉。名單刻意不動 ——
    // 角色要等 React 依新名單重繪才卸載，中間這一段就是要驗的空窗。
    //
    // ⚠️ **不可以改成「把角色卸載掉再推進幾幀」。** 量過：卸載之後那個元件的
    // `useFrame` 根本不會再被呼叫，所以那樣的測試把守衛整條拿掉照樣是綠的 ——
    // 它驗到的是 R3F 的訂閱管理，不是我們的程式碼。
    motion.delete('u1')

    // **要用 `advanceCatching`** —— 見它的註解：直接 await 的話，
    // render loop 拋的錯會變成 unhandled rejection，這條測試就永遠不會紅。
    const caught = await advanceCatching(renderer, 2)
    expect(caught, `render loop 拋了錯：${caught.map(String).join(' / ')}`).toEqual([])

    expect(groupX(renderer), '樣本沒了就該停在原地，不是跳回原點').toBeCloseTo(before, 6)
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
