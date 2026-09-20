'use client'

import { layer } from '@/design/layers'

// 首屏的連續載入層。規格 `FE-X15-S01`（load-order；design D2）。
//
// 它跨過**兩段**空窗：(A) `WorldCanvas` 的 chunk 還在抓、(B) chunk 到了但
// Canvas／WebGL 還沒建好。由 `WorldBoundary` 持有、`onReady` 之前一直在、
// 之後才卸載 —— **同一個元素跨過 A 與 B，不卸載重掛**（否則會閃白）。
//
// `role="status"` ＋ `aria-busy`：無障礙樹知道「這裡正在忙」。
// 動態是脈動骨架（`motion-safe:animate-pulse`），`prefers-reduced-motion`
// 時不動（`ui-ux-pro-max` ux「Loading Indicators」「Reduced Motion」）。
// **不用進度條** —— chunk＋shader＋GLTF 合不出一個可信的整體百分比（design D2）。
export function WorldLoadSequence() {
  return (
    <div
      data-testid="world-load-sequence"
      role="status"
      aria-busy="true"
      style={{ zIndex: layer('panel') }}
      className="bg-surface absolute inset-0 flex flex-col items-center justify-center gap-6"
    >
      {/* 世界區的骨架：一塊「舞台」＋兩個「角色」的低語。純裝飾，不進無障礙樹。 */}
      <div aria-hidden className="flex flex-col items-center gap-4">
        <div className="flex items-end gap-3">
          <span className="bg-surface-sunken motion-safe:animate-pulse h-10 w-10 rounded-full" />
          <span className="bg-surface-sunken motion-safe:animate-pulse h-14 w-14 rounded-full [animation-delay:150ms]" />
          <span className="bg-surface-sunken motion-safe:animate-pulse h-10 w-10 rounded-full [animation-delay:300ms]" />
        </div>
        <span className="bg-surface-sunken motion-safe:animate-pulse h-24 w-56 rounded-2xl" />
      </div>
      <p className="text-ink-muted text-sm">正在載入世界⋯⋯</p>
    </div>
  )
}
