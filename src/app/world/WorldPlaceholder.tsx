'use client'

import { layer } from '@/design/layers'

// **這是 FE-W01 要換掉的東西。**
//
// FE-W01「WorldCanvas」的範圍逐字是「R3F Canvas、Renderer、Lighting、
// Soft Shadow、Resize；Suspense / Loading fallback 與資源清理」——
// 那一項會把這個檔案的內容換成真的 Canvas。
//
// **它上面那層殼（WorldBoundary）不需要動。** 殼與內容分離是刻意的：
// 3D 進來的時候不必動路由層。
export default function WorldPlaceholder() {
  return (
    <div
      data-testid="world-placeholder"
      style={{ zIndex: layer('canvas') }}
      className="bg-surface-raised border-line text-ink-muted border p-gutter"
    >
      世界還沒有內容 —— 3D Canvas 由 FE-W01 接手。
    </div>
  )
}
