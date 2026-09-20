'use client'

import { useEffect, useRef } from 'react'
import { CAPTION, PRIMARY, SECONDARY, TITLE, withClass } from '@/design/controls'
import { layer } from '@/design/layers'

// 面板重模組（chunk）抓取失敗時的錯誤殼（FE-X15-S06；design D3）。
//
// 關鍵語意（S06）：**世界輸入鎖與焦點已經被 host 釋放** —— 使用者不被困在一個永遠載不出來的殼裡，
// 世界可以動了。這個殼只是一個可辨識的錯誤提示＋兩條出路：重試（換一個新的 loader 再抓一次）、回到世界。
// `role="alert"`：立刻朗讀。掛載時取得焦點：鍵盤使用者不迷航（焦點被釋放後要有個明確落點）。
//
// 為什麼重試是「新的 loader」而不是「重新渲染」：`React.lazy` 會把 rejected 的 promise 快取起來，
// 重試只重繪的話會拿到同一個失敗（跟 `WorldBoundary` 那課同源）—— 換 key 由 host 負責，這裡只發意圖。
export function PanelErrorShell({ panelId, title, onRetry, onExit }: { panelId: string; title: string; onRetry: () => void; onExit: () => void }) {
  const root = useRef<HTMLElement>(null)
  useEffect(() => {
    root.current?.focus()
  }, [])
  return (
    <section
      ref={root}
      tabIndex={-1}
      role="alert"
      data-testid={`${panelId}-error`}
      aria-label={`${title}載入失敗`}
      style={{ zIndex: layer('panel') }}
      className="bg-surface-raised border-danger text-ink shadow-panel rounded-panel w-panel absolute top-gutter right-gutter bottom-gutter flex flex-col gap-gutter border p-gutter outline-none"
    >
      <h2 {...withClass(TITLE, 'shrink-0')}>{title}</h2>
      <p {...withClass(CAPTION, 'text-danger flex-1')}>面板載入失敗，可能是網路不穩。</p>
      <div className="flex shrink-0 gap-gutter">
        <button type="button" {...PRIMARY} onClick={onRetry}>
          重試
        </button>
        <button type="button" {...SECONDARY} onClick={onExit}>
          回到世界
        </button>
      </div>
    </section>
  )
}
