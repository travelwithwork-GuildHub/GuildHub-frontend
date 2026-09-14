'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
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
// 動態只有淡出一件事（出現是直接出現：過場開始的那一刻畫面本來就在換），而且 `prefers-reduced-motion` 時不動
// （同一份指引「Reduced Motion」）。

export const OVERLAY_MIN_MS = 300
/** 淡出的長度。跟 `motion-safe:duration-200` 是同一個數字 —— 改一個要改另一個。 */
export const FADE_MS = 200

export function SceneTransitionOverlay() {
  const { scene, transition, transitionSeq, destinationTitle } = useScene()
  const { holdInputLock } = useInteraction()

  // 過場期間鎖住移動輸入：角色不該在舊配置裡繼續走、出生在新配置的牆裡。提交（`transition` 變 null）就放開。
  // `useLayoutEffect`：在瀏覽器畫下一幀之前就持有鎖 —— 用 passive effect 的話，render 與 effect 之間可能跑過一幀移動。
  const inTransition = transition !== null
  useLayoutEffect(() => {
    if (!inTransition) return undefined
    return holdInputLock('scene-transition')
  }, [inTransition, holdInputLock])

  // 深連結直達房間（design〈重新整理〉：「有票 → 直接進房間（過場照 D3）」）：那場過場不是 `enterRoom` 發起的，
  // 代號還是 0。只看代號的話它沒有覆蓋層 —— 瀏覽器 e2e 抓到的。記住「代號 0 的過場開始過」，提交之後它才留得住、淡得出。
  // 大廳的第一次載入從沒進過過場（`committed` 一開始就是大廳），所以不會誤把它畫成「回到 Guild Hall⋯⋯」。
  const [deepLinkStarted, setDeepLinkStarted] = useState(false)
  useLayoutEffect(() => {
    if (inTransition && transitionSeq === 0) setDeepLinkStarted(true)
  }, [inTransition, transitionSeq])

  if (transitionSeq === 0 && !deepLinkStarted) return null
  // 提交之後 `transition` 已是 null；最短顯示期間的目的地就是現在所在的場景。
  const to = transition?.to ?? scene
  const text = to.id === 'hall' ? '回到 Guild Hall⋯⋯' : `前往 ${destinationTitle ?? '專案房間'}⋯⋯`
  // `key`：每一場過場一個新的 `Linger`，它自己記掛載時刻、自己算還要留多久。
  return <Linger key={transitionSeq} active={inTransition} text={text} />
}

/**
 * 一場過場的顯示期：從掛載起，`active` 結束後再撐到滿 `OVERLAY_MIN_MS`，然後**淡出 `FADE_MS` 才卸載**。
 * 淡出期間它已經不是 status（沒有 role、`aria-hidden`、不吃 pointer）—— 對無障礙樹與規格的「消失」來說它已經不在了，
 * 只剩視覺上的一層在變透明。`prefers-reduced-motion` 時 `motion-safe:` 不給 transition，那 200 ms 就是直接透明。
 */
function Linger({ active, text }: { active: boolean; text: string }) {
  const [phase, setPhase] = useState<'shown' | 'fading' | 'gone'>('shown')
  const mountedAt = useRef(0)
  useEffect(() => {
    mountedAt.current = Date.now()
  }, [])
  useEffect(() => {
    if (active) return undefined
    const remaining = Math.max(0, OVERLAY_MIN_MS - (Date.now() - mountedAt.current))
    const timer = setTimeout(() => setPhase('fading'), remaining)
    return () => clearTimeout(timer)
  }, [active])
  useEffect(() => {
    if (phase !== 'fading') return undefined
    const timer = setTimeout(() => setPhase('gone'), FADE_MS)
    return () => clearTimeout(timer)
  }, [phase])

  if (phase === 'gone') return null
  const shown = phase === 'shown'
  return (
    <div
      data-testid="scene-transition"
      data-state={phase}
      role={shown ? 'status' : undefined}
      aria-busy={shown ? 'true' : undefined}
      aria-hidden={shown ? undefined : true}
      aria-label={shown ? text : undefined}
      style={{ zIndex: layer('hud') }}
      className={`bg-surface/90 text-ink absolute inset-0 flex items-center justify-center motion-safe:transition-opacity motion-safe:duration-200 ${
        shown ? 'opacity-100' : 'pointer-events-none opacity-0'
      }`}
    >
      <p className="text-body">{text}</p>
    </div>
  )
}
