'use client'

import { useEffect, useRef } from 'react'
import { CAPTION, SECONDARY, TITLE, withClass } from '@/design/controls'
import { layer } from '@/design/layers'

// 面板形的載入殼（FE-X15-S04；design D3）。開啟意圖成立、面板重模組（chunk）還沒到那段空窗顯示它。
//
// 為什麼「面板形」而不是一個轉圈：殼佔的是**跟真面板同一個框**（同位置、同寬、同 token）——
// chunk 到達、內容換上來時不位移（reserve layout，避免 CLS；`ui-ux-pro-max`）。
// `role="status"`／`aria-busy`：輔助技術知道「這裡在載入、等一下有內容」。掛載時取得焦點：
// 面板是阻斷式的，焦點先落在殼裡（而不是掉在被鎖住的世界上），Tab 到「取消」。
//
// ⚠️ 骨架塊是 `aria-hidden`：它們是視覺佔位，不是內容 —— 讀出來只會是噪音。
export function PanelLoadingShell({ panelId, title, onCancel }: { panelId: string; title: string; onCancel: () => void }) {
  const root = useRef<HTMLElement>(null)
  useEffect(() => {
    root.current?.focus()
  }, [])
  return (
    <section
      ref={root}
      tabIndex={-1}
      role="status"
      aria-busy="true"
      aria-label={`${title}載入中`}
      data-testid={`${panelId}-loading`}
      style={{ zIndex: layer('panel') }}
      className="bg-surface-raised border-control-edge text-ink shadow-panel rounded-panel w-panel absolute top-gutter right-gutter bottom-gutter flex flex-col gap-gutter border p-gutter outline-none"
    >
      <header className="flex shrink-0 items-center gap-gutter">
        <h2 {...withClass(TITLE, 'min-w-0 flex-1 truncate')}>{title}</h2>
        {/* 取消：慢到不想等時的出口（殼佔著世界輸入鎖，得有一條退出）。 */}
        <button type="button" {...withClass(SECONDARY, 'shrink-0 whitespace-nowrap')} onClick={onCancel}>
          取消
        </button>
      </header>
      {/* 骨架：標題塊＋一段內容塊＋一條動作塊，脈動。高度撐住內容區、換內容時不跳。 */}
      <div aria-hidden="true" className="flex min-h-0 flex-1 flex-col gap-gutter">
        <div className="bg-surface-sunken rounded-control h-6 w-2/3 motion-safe:animate-pulse" />
        <div className="bg-surface-sunken rounded-control h-28 w-full motion-safe:animate-pulse" />
        <div className="bg-surface-sunken rounded-control h-6 w-1/2 motion-safe:animate-pulse" />
      </div>
      <p {...withClass(CAPTION, 'shrink-0')}>載入中⋯⋯</p>
    </section>
  )
}
