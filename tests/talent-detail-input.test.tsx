import { describe, expect, it } from 'vitest'
import ReactThreeTestRenderer from '@react-three/test-renderer'
import { useEffect } from 'react'
import { Vector3 } from 'three'
import { InteractionProvider } from '@/world/interaction/InteractionProvider'
import { LocalPlayer } from '@/world/player/LocalPlayer'
import { ListPanelProvider, useListPanel } from '@/list-panel/ListPanelProvider'

// 規格：openspec/changes/fe-b04-talent-directory/specs/talent-directory/spec.md
//   Requirement: 詳情層的鍵盤不驅動世界，Escape 照今天的全域契約 —— S13／S14
//
// 詳情蓋在列表上，面板仍然開著 —— 鎖的是同一把（`FE-B01` 的 `inputLockRef`）。
// 這一份走真的 `LocalPlayer`（含物理）量 pose；DOM 那一半（詳情消失、面板關閉）
// 在 `talent-directory.test.tsx` 與 `board-panel-wiring.test.tsx`，兩邊在 `ListPanelProvider` 上接起來：
// 面板開著（不管列表還是詳情）→ 鎖；Escape → `closePanel` → 鎖放開。
//
// ⚠️ 詳情層的 Escape 是「關整個面板」（今天的 `FE-B01-S16`）。`FE-X06` 改變全域契約的那天，
// `S14` 跟著改 —— 這裡不預先寫一條今天到不了的分支。

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
  const poseRef = { current: { x: 0, z: 0, f: 0 } }
  const renderer = await ReactThreeTestRenderer.create(
    <InteractionProvider>
      <ListPanelProvider>
        <Grab />
        <LocalPlayer targetRef={{ current: new Vector3() }} poseRef={poseRef} />
      </ListPanelProvider>
    </InteractionProvider>,
  )
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

describe('詳情層的鍵盤不驅動世界', () => {
  it('[FE-B04-S13] 人才面板開著（詳情蓋在上面也一樣）按方向鍵，角色不動', async () => {
    const { renderer, poseRef } = await mounted()
    // 開人才面板 = 開詳情所需的前提；詳情是面板內的覆蓋層，鎖是同一把。
    await ReactThreeTestRenderer.act(async () => panel().openPanel('profiles'))
    await key('keydown', 'ArrowRight')
    await frames(renderer, 30)
    expect(poseRef.current.x, '詳情開著角色還在走').toBe(0)
    await key('keyup', 'ArrowRight')
  })

  it('[FE-B04-S14] Escape 之後面板關了，人走得動', async () => {
    const { renderer, poseRef } = await mounted()
    await ReactThreeTestRenderer.act(async () => panel().openPanel('profiles'))
    // Escape 走的是 `ListPanel` 的監聽 → `closePanel`；這裡直接呼叫 `closePanel` 代表那條路的終點，
    // Escape → onClose 那一段在 `board-panel-wiring.test.tsx` 驗過。
    await ReactThreeTestRenderer.act(async () => panel().closePanel())
    expect(panel().open).toBeNull()
    await key('keydown', 'ArrowRight')
    await frames(renderer, 30)
    expect(poseRef.current.x, '面板關了人走不動 —— 鎖沒有還回去').toBeGreaterThan(0)
    await key('keyup', 'ArrowRight')
  })
})
