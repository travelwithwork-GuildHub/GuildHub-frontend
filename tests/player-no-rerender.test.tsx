import { describe, expect, it, vi } from 'vitest'
import ReactThreeTestRenderer from '@react-three/test-renderer'
import type { FC } from 'react'
import { Vector3 } from 'three'
import { LocalPlayer, type LocalPlayerProps } from '@/world/player/LocalPlayer'

// `FE-W03-S13`（角色移動時相機的 target 跟著改變，且沒有觸發 React 重新渲染）
// 與 `FE-W04-S08`（位置由 rigid body 持有，不每幀寫 React state）。
//
// 這兩條在 `fe-w03-player` 與 `fe-w04-physics` 的 tasks.md 都寫著
// 「驗證：Scenario X」而且都打了勾，而 **一條測試都沒有**。
//
// 為什麼要 `@react-three/test-renderer`：`LocalPlayer` 的整個行為都在
// `useFrame` 裡，而它讀的是 R3F 真的掛上去的 `<group ref>`。用 jsdom ＋
// mock 掉 `@react-three/fiber` 的話，`<group>` 會變成一個 DOM 元素、
// `root.position` 是 `undefined`，frame callback 第一行就炸 ——
// **那樣測到的不是這條 Scenario，是 mock 的形狀。**
// R3F 官方的 test renderer 有真的 reconciler 與場景圖，但不需要 WebGL。
//
// 怎麼數渲染次數：把元件包成 `vi.fn(props => LocalPlayer(props))`。
// 在另一個元件的函式體裡直接呼叫它等於把它 inline 進去，hooks 仍然在同一次
// render 裡執行，所以 `mock.calls.length` 就是它的渲染次數。

describe('角色的位置不進 React', () => {
  it('[FE-W03-S13][FE-W04-S08] 連續移動多幀，角色元件的渲染次數不增加，而 target 有跟上', async () => {
    const targetRef = { current: new Vector3(0, 0, 0) }
    const counted = vi.fn((props: LocalPlayerProps) => LocalPlayer(props))
    const Counted = counted as unknown as FC<LocalPlayerProps>

    const renderer = await ReactThreeTestRenderer.create(<Counted targetRef={targetRef} />)

    expect(counted, '第一次掛載應該只渲染一次').toHaveBeenCalledTimes(1)

    // 按住一個方向鍵，跑很多幀。
    // **是 `code` 不是 `key`** —— LocalPlayer 讀的是實體鍵位。
    await ReactThreeTestRenderer.act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowRight' }))
    })
    // **`advanceFrames` 一定要包在 `act` 裡。** 不包的話，frame callback 裡
    // 觸發的 state 更新只是被「排程」，不會在斷言之前 flush ——
    // 於是「元件把位置寫進 React state」這個突變**照樣是綠的**（實測過）。
    // 量不到的斷言比沒有斷言更糟，因為它看起來像有在驗。
    await ReactThreeTestRenderer.act(async () => {
      await renderer.advanceFrames(60, 1 / 60)
    })

    // **這一條才是兩份規格在講的事。**
    expect(
      counted,
      '角色移動讓元件重新渲染了 —— 位置進了 React state，而規格說權威來源是 rigid body',
    ).toHaveBeenCalledTimes(1)

    // **沒有下面這一條，上面那條是恆真的** —— 一個什麼都不做的元件當然不會
    // 重新渲染。要證明「它真的動了、而且 target 真的被寫進去」。
    expect(targetRef.current.x, '角色沒有往右移動，或 target 沒有被寫進去').toBeGreaterThan(0)

    await ReactThreeTestRenderer.act(async () => {
      window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ArrowRight' }))
    })
    await renderer.unmount()
  }, 60_000)
})
