'use client'

import { useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react'
import { SECONDARY, TITLE, withClass } from '@/design/controls'
import { layer } from '@/design/layers'
import { useEscapeLayer } from '@/world/interaction/escapeLayers'
import { nextTabStop } from './focusTrap'
import { DialogHostContext } from './PanelDialog'

// 阻斷式面板的殼。規格 `FE-A04` design `D1`：從 `ListPanel` 抽出來，清單面板與名片面板裝的是同一個殼。
//
// 殼管的：`<section aria-label>`、堆疊層級、Escape 層（`FE-X06`，只在掛載期間在堆疊裡）、focus trap（`FE-X06-S11`）、
// 標題列（返回｜標題｜關閉，`FE-X16-S07`：在捲動容器**外面**、永遠不 inert）、內容區的捲動（`S08`）、
// 覆蓋層（子畫面蓋住內容區時內容標 `inert`，不卸載 —— `FE-B04-S11`／`S12`／`S16`）、確認視窗的層（`PanelDialog` 的 portal 目標；`S06`）。
// 外觀（不透明的底、邊界、陰影、圓角、寬度）全部是 token（`S05`）。
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
  /** 蓋在內容區上的子畫面（詳情、表單）。有它的時候內容**不卸載、不 `display: none`**，只標成 `inert`；標題列留著、關閉留在原位。 */
  overlay?: ReactNode
  /** 子畫面的返回（`S07`：標題列第一個可聚焦的）。`title` 由呼叫端同時換成子畫面的標題。 */
  back?: { label: string; onBack: () => void }
  /** Escape、關閉鈕。 */
  onCloseRequest: () => void
  children: ReactNode
}

export function PanelShell({ title, closeLabel, testId, bodyTestId, overlayTestId, data, overlay, back, onCloseRequest, children }: PanelShellProps) {
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

  // `overlay={open && <X />}` 的 `false` 也算沒有（審查提醒：不然內容區被 inert 鎖死、還多一個空殼）。
  const overlayOpen = overlay !== undefined && overlay !== null && overlay !== false

  // 確認視窗的層：`PanelDialog` 把視窗 portal 到內容區的容器上，開著時內容區（連子畫面）都 inert。host 用 state 不用 ref：portal 要在它掛好之後才畫。
  const [host, setHost] = useState<HTMLDivElement | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const dialogHost = useMemo(() => ({ host, setOpen: setDialogOpen }), [host])

  return (
    <section
      ref={section}
      onKeyDown={onKeyDown}
      aria-label={title}
      data-testid={testId}
      {...data}
      // 堆疊層級走 `design/layers`，散在各處的 z-index 會互相打架。
      style={{ zIndex: layer('panel') }}
      // 過渡只動 opacity（`FE-X16-S12`：不動寬高、不用 all）。底不透明、邊界 3:1、陰影 —— 三個都是 token（`S05`）；寬度一個 token（`S07`）
      className="bg-surface-raised border-control-edge text-ink shadow-panel rounded-panel w-panel absolute top-gutter right-gutter bottom-gutter flex flex-col gap-gutter border p-gutter transition-opacity"
    >
      {/* 標題列：面板的第一個區塊，在內容區外面，任何覆蓋層都不蓋它。返回（子畫面才有）第一個、關閉最後一個（`S07`）。 */}
      <header className="flex shrink-0 items-center gap-gutter">
        {back !== undefined && (
          <button type="button" {...withClass(SECONDARY, 'shrink-0 whitespace-nowrap')} onClick={back.onBack}>
            {back.label}
          </button>
        )}
        <h2 {...withClass(TITLE, 'min-w-0 flex-1 truncate')}>{title}</h2>
        <button type="button" {...withClass(SECONDARY, 'shrink-0 whitespace-nowrap')} onClick={onCloseRequest}>
          {closeLabel}
        </button>
      </header>
      {/* 內容區的容器：子畫面與確認視窗的定位基準（兩者都只蓋這裡）。 */}
      <div ref={setHost} data-testid={`${testId}-content`} className="relative flex min-h-0 flex-1 flex-col">
        <DialogHostContext.Provider value={dialogHost}>
          <div
            data-testid={bodyTestId ?? `${testId}-body`}
            // `inert`：不可聚焦、不可點。jsdom 認得屬性但不實作行為 —— 判準只驗屬性，行為在真瀏覽器。
            inert={overlayOpen || dialogOpen}
            // 溢出時捲的是這裡，標題列不走（`S08`）
            className="flex min-h-0 flex-1 flex-col gap-gutter overflow-y-auto"
          >
            {children}
          </div>
          {/* 子畫面：蓋住整個內容區，底下的內容區照樣活著。它自己帶不透明的底。 */}
          {overlayOpen && (
            <div data-testid={overlayTestId ?? `${testId}-overlay`} inert={dialogOpen} className="bg-surface-raised absolute inset-0 z-10 flex flex-col">
              {overlay}
            </div>
          )}
        </DialogHostContext.Provider>
      </div>
    </section>
  )
}
