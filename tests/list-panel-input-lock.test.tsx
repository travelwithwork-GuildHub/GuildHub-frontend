import { describe, expect, it } from 'vitest'
import ReactThreeTestRenderer from '@react-three/test-renderer'
import { useEffect } from 'react'
import { Vector3 } from 'three'
import { InteractionProvider } from '@/world/interaction/InteractionProvider'
import { LocalPlayer } from '@/world/player/LocalPlayer'
import { ListPanelProvider, useListPanel } from '@/list-panel/ListPanelProvider'

// 規格：openspec/changes/fe-b01-list-container/specs/list-panel/spec.md
//   Requirement: Escape 關閉面板，並把世界的輸入還回去 —— S17／S18
//
// ⚠️ **判準測的是移動輸入有沒有恢復，不是 `canvas.focus()` 或 `stopPropagation()`。**
// 這裡的角色是真的 `LocalPlayer`（含物理），開關面板走真的 `ListPanelProvider` ——
// 量的是「按了方向鍵之後 pose 有沒有動」。
//
// ⚠️ **`S17` 與 `S18` 要成對。** 只有 `S18` 的話，「開了面板就永遠鎖住輸入」是全綠的。

/** 從 provider 裡把開關拿出來給測試用。**不渲染任何東西。** */
const grabbed: { panel: ReturnType<typeof useListPanel> | null } = { panel: null }
function Grab() {
  const value = useListPanel()
  useEffect(() => {
    grabbed.panel = value
  }, [value])
  return null
}
const panel = () => {
  if (grabbed.panel === null) throw new Error('provider 還沒掛好')
  return grabbed.panel
}

async function mounted() {
  const targetRef = { current: new Vector3(0, 0, 0) }
  const poseRef = { current: { x: 0, z: 0, f: 0 } }
  const renderer = await ReactThreeTestRenderer.create(
    <InteractionProvider>
      <ListPanelProvider>
        <Grab />
        <LocalPlayer targetRef={targetRef} poseRef={poseRef} />
      </ListPanelProvider>
    </InteractionProvider>,
  )
  // 等物理世界載進來（理由同 `input-lifecycle.test.tsx`）。
  await ReactThreeTestRenderer.act(async () => {
    for (let i = 0; i < 50; i++) await new Promise((r) => setTimeout(r, 0))
  })
  return { renderer, poseRef }
}

const frames = (r: Awaited<ReturnType<typeof mounted>>['renderer'], n: number) =>
  ReactThreeTestRenderer.act(async () => {
    await r.advanceFrames(n, 1 / 60)
  })
const key = (type: 'keydown' | 'keyup', code: string) =>
  ReactThreeTestRenderer.act(async () => {
    window.dispatchEvent(new KeyboardEvent(type, { code }))
  })

describe('面板開著的時候，鍵盤是面板的', () => {
  it('[FE-B01-S18] 面板開啟中按方向鍵，角色 SHALL NOT 移動', async () => {
    const { renderer, poseRef } = await mounted()
    await ReactThreeTestRenderer.act(async () => panel().openPanel('projects'))
    await key('keydown', 'ArrowRight')
    await frames(renderer, 30)
    expect(poseRef.current.x, '面板開著，角色還是走了 —— 方向鍵沒有被鎖住').toBe(0)
    await key('keyup', 'ArrowRight')
  })

  it('[FE-B01-S18] 面板開啟中，方向鍵的預設行為是面板的（捲動），角色 SHALL NOT 吃掉它', async () => {
    // 每幀清掉按鍵擋得住「走路」，擋不住這一種：角色的 keydown 還是 `preventDefault()` 了，
    // 面板裡按 ↓ 什麼都不會捲。
    await mounted()
    await ReactThreeTestRenderer.act(async () => panel().openPanel('projects'))
    const event = new KeyboardEvent('keydown', { code: 'ArrowDown', cancelable: true })
    await ReactThreeTestRenderer.act(async () => {
      window.dispatchEvent(event)
    })
    expect(event.defaultPrevented, '面板開著，角色還是把方向鍵的預設行為吃掉了').toBe(false)
    await key('keyup', 'ArrowDown')
  })

  it('[FE-B01-S18] 按著方向鍵的時候面板開了，角色 SHALL 停下來', async () => {
    // 走著走著按 E：`keydown` 早就收了，光擋 `keydown` 擋不住這一種。
    const { renderer, poseRef } = await mounted()
    await key('keydown', 'ArrowRight')
    await frames(renderer, 20)
    const before = poseRef.current.x
    expect(before, '前置條件：角色要真的在走').toBeGreaterThan(0)
    await ReactThreeTestRenderer.act(async () => panel().openPanel('projects'))
    await frames(renderer, 30)
    expect(poseRef.current.x, '面板開了角色還在走 —— 按著的鍵沒有被清掉').toBeCloseTo(before, 6)
    await key('keyup', 'ArrowRight')
  })

  it('[FE-B01-S17] 關閉之後，人走得動', async () => {
    const { renderer, poseRef } = await mounted()
    await ReactThreeTestRenderer.act(async () => panel().openPanel('projects'))
    await key('keydown', 'ArrowRight')
    await frames(renderer, 10)
    await key('keyup', 'ArrowRight')
    expect(poseRef.current.x, '前置條件：開著的時候不能走').toBe(0)

    await ReactThreeTestRenderer.act(async () => panel().closePanel())
    await key('keydown', 'ArrowRight')
    await frames(renderer, 30)
    expect(
      poseRef.current.x,
      '關掉面板之後人走不動了 —— 鎖沒有被還回去，使用者要用滑鼠點一下畫面',
    ).toBeGreaterThan(0)
    await key('keyup', 'ArrowRight')
  })
})
