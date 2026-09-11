'use client'

import { useRef, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react'
import { SECONDARY } from '@/design/controls'
import { layer } from '@/design/layers'
import { useEscapeLayer } from '@/world/interaction/escapeLayers'
import { nextTabStop } from './focusTrap'

// 阻斷式面板的殼。規格 `FE-A04` design `D1`：從 `ListPanel` 抽出來，清單面板與名片面板裝的是同一個殼。
//
// 殼管的：`<section aria-label>`、堆疊層級、Escape 層（`FE-X06`，只在掛載期間在堆疊裡）、focus trap（`FE-X06-S11`）、
// 標題列與關閉鈕、覆蓋層（overlay 蓋住時內容標 `inert`，不卸載 —— `FE-B04-S11`／`S12`／`S16`）。
// 殼**不管**的：世界輸入鎖（呼叫端的 provider 各持各的）、內容、文案（標題與按鈕上的字由呼叫端帶進來）。
//
// ⚠️ **關閉是一個「意圖」，不是一個動作。** Escape 與關閉鈕都只呼叫 `onCloseRequest()`；要不要真的關（有未儲存的修改要先問、
// 送出中不能關）是呼叫端的事 —— 殼不知道裡面裝的是什麼。
//
// ⚠️ 這個檔案裡沒有任何使用者看得到的字（跟 `ListPanel` 同一條規矩）。

export interface PanelShellProps {
  /** 面板的名字（`aria-label` 與標題）。 */
  title: string
  closeLabel: string
  /** `<section>` 的 `data-testid`。 */
  testId: string
  /** 內容區（會被 overlay 標成 `inert` 的那一層）的 `data-testid`；沒給就是 `${testId}-body`。 */
  bodyTestId?: string
  /** 覆蓋層的 `data-testid`；沒給就是 `${testId}-overlay`。 */
  overlayTestId?: string
  /** 額外的 `data-*` 屬性（例如 `data-kind`）。 */
  data?: Record<`data-${string}`, string>
  /** 蓋在內容上的東西。有它的時候內容**不卸載、不 `display: none`**，只標成 `inert`。 */
  overlay?: ReactNode
  /** Escape、關閉鈕。 */
  onCloseRequest: () => void
  children: ReactNode
}

export function PanelShell({ title, closeLabel, testId, bodyTestId, overlayTestId, data, overlay, onCloseRequest, children }: PanelShellProps) {
  // Escape 走層級：這個面板是底下那一層，overlay（詳情、確認層）自己再註冊一層在上面。
  // 帶自己的元素：overlay 在這個 section 裡面，就算跟它同一個 commit 掛載（深連結直達詳情）也在它上面。
  const section = useRef<HTMLElement>(null)
  useEscapeLayer(onCloseRequest, section)

  // focus trap：持有鎖的面板，Tab／Shift+Tab 只在面板內循環。誰算「瀏覽器會 Tab 到」在 `focusTrap.ts`（每次按鍵現算）。
  const onKeyDown = (e: ReactKeyboardEvent<HTMLElement>) => {
    if (e.key !== 'Tab' || section.current === null) return
    const stop = nextTabStop(section.current, document.activeElement, e.shiftKey)
    if (stop === null) return
    e.preventDefault()
    if (stop !== 'stay') stop.focus()
  }

  const overlayOpen = overlay !== undefined && overlay !== null

  return (
    <section
      ref={section}
      onKeyDown={onKeyDown}
      aria-label={title}
      data-testid={testId}
      {...data}
      // 堆疊層級走 `design/layers`，散在各處的 z-index 會互相打架。
      style={{ zIndex: layer('panel') }}
      className="bg-surface-raised border-control-edge text-ink absolute top-gutter right-gutter bottom-gutter flex w-[min(26rem,calc(100vw-2rem))] flex-col gap-gutter rounded border p-gutter"
    >
      {/* 覆蓋層：絕對定位蓋住整個面板內側。內容區在底下照樣活著。 */}
      {overlayOpen && (
        <div data-testid={overlayTestId ?? `${testId}-overlay`} className="bg-surface-raised absolute inset-0 z-10 p-gutter">
          {overlay}
        </div>
      )}
      <div
        data-testid={bodyTestId ?? `${testId}-body`}
        // `inert`：不可聚焦、不可點。jsdom 認得屬性但不實作行為 —— 判準只驗屬性，行為在真瀏覽器。
        inert={overlayOpen}
        className="flex min-h-0 flex-1 flex-col gap-gutter"
      >
        <header className="flex items-center justify-between gap-gutter">
          <h2 className="text-title">{title}</h2>
          <button type="button" className={SECONDARY} onClick={onCloseRequest}>
            {closeLabel}
          </button>
        </header>
        {children}
      </div>
    </section>
  )
}
