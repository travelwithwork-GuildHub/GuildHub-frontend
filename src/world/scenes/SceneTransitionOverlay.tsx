'use client'

import { useEffect, useRef, useState } from 'react'
import { layer } from '@/design/layers'
import { useInteraction } from '@/world/interaction/InteractionProvider'
import { useScene } from './SceneProvider'

// 過場的覆蓋層。規格 `FE-V01-S05`／`S17`（design D3）。
//
// 「前往 ○○⋯⋯」／「回到 Guild Hall⋯⋯」，`role="status"` ＋ `aria-busy`，蓋在 Canvas 上（`hud` 層）。
// **至少顯示 `OVERLAY_MIN_MS`**：本機 `hello` 在 1 ms 內到，沒有最短顯示的話它是一幀的閃爍
// （`ui-ux-pro-max` ux「Loading Indicators：avoid flashing for near-instant work」）。
// 最短顯示只延後**覆蓋層的消失**：狀態在 `ready` 當下就提交、輸入鎖也在那一刻放開（`S17`）。
//
// 動態只有淡入淡出一件事，而且 `prefers-reduced-motion` 時不動（同一份指引「Reduced Motion」）。

export const OVERLAY_MIN_MS = 300

export function SceneTransitionOverlay() {
  const { scene, transition, transitionSeq, destinationTitle } = useScene()
  const { holdInputLock } = useInteraction()

  // 過場期間鎖住移動輸入：角色不該在舊配置裡繼續走、出生在新配置的牆裡。提交（`transition` 變 null）就放開。
  const inTransition = transition !== null
  useEffect(() => {
    if (!inTransition) return undefined
    return holdInputLock('scene-transition')
  }, [inTransition, holdInputLock])

  if (transitionSeq === 0) return null
  // 提交之後 `transition` 已是 null；最短顯示期間的目的地就是現在所在的場景。
  const to = transition?.to ?? scene
  const text = to.id === 'hall' ? '回到 Guild Hall⋯⋯' : `前往 ${destinationTitle ?? '專案房間'}⋯⋯`
  // `key`：每一場過場一個新的 `Linger`，它自己記掛載時刻、自己算還要留多久。
  return <Linger key={transitionSeq} active={inTransition} text={text} />
}

/** 一場過場的顯示期：從掛載起，`active` 結束後再撐到滿 `OVERLAY_MIN_MS`。 */
function Linger({ active, text }: { active: boolean; text: string }) {
  const [visible, setVisible] = useState(true)
  const mountedAt = useRef(0)
  useEffect(() => {
    mountedAt.current = Date.now()
  }, [])
  useEffect(() => {
    if (active) return undefined
    const remaining = Math.max(0, OVERLAY_MIN_MS - (Date.now() - mountedAt.current))
    const timer = setTimeout(() => setVisible(false), remaining)
    return () => clearTimeout(timer)
  }, [active])

  if (!visible) return null
  return (
    <div
      data-testid="scene-transition"
      role="status"
      aria-busy="true"
      aria-label={text}
      style={{ zIndex: layer('hud') }}
      className="bg-surface/90 text-ink absolute inset-0 flex items-center justify-center motion-safe:transition-opacity motion-safe:duration-200"
    >
      <p className="text-body">{text}</p>
    </div>
  )
}
