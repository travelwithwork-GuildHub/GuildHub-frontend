'use client'

import { useEffect, useRef } from 'react'
import { PRIMARY, SECONDARY, TITLE } from '@/design/controls'
import { PanelDialog } from '@/panel/PanelDialog'
import { useEscapeLayer } from '@/world/interaction/escapeLayers'

export const DISCARD_LABELS = {
  confirmTitle: '有還沒儲存的修改',
  confirmBody: '丟棄的話，剛剛改的內容就不見了。',
  discard: '丟棄',
  keepEditing: '繼續編輯',
}

/**
 * 未儲存就關的確認層（design `D5`：自己做一個小的，不用 `window.confirm`）。走 `PanelDialog`（`FE-X16-S06`）：遮罩蓋住面板內容區、
 * 底下的表單變 `inert`，Tab 只在這兩個按鈕之間；表單的值都還在（不卸載）。
 * Escape 層再疊一層：Escape 關它 ＝「繼續編輯」（`S09`）。鍵盤可操作：掛載時焦點到「繼續編輯」（安全的那個）。
 */
export function DiscardConfirm({ onDiscard, onKeep }: { onDiscard: () => void; onKeep: () => void }) {
  const root = useRef<HTMLDivElement>(null)
  const keep = useRef<HTMLButtonElement>(null)
  useEscapeLayer(onKeep, root)
  useEffect(() => {
    keep.current?.focus()
  }, [])
  return (
    <PanelDialog>
      <div
        ref={root}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="profile-discard-title"
        aria-describedby="profile-discard-body"
        data-testid="profile-discard-confirm"
        className="bg-surface-raised border-control-edge shadow-dialog rounded-panel w-dialog flex max-w-full flex-col gap-gutter border p-gutter"
      >
      <p id="profile-discard-title" {...TITLE}>
        {DISCARD_LABELS.confirmTitle}
      </p>
      <p id="profile-discard-body">{DISCARD_LABELS.confirmBody}</p>
      <div className="flex gap-gutter">
        <button ref={keep} type="button" {...PRIMARY} onClick={onKeep}>
          {DISCARD_LABELS.keepEditing}
        </button>
        <button type="button" {...SECONDARY} onClick={onDiscard}>
          {DISCARD_LABELS.discard}
        </button>
      </div>
      </div>
    </PanelDialog>
  )
}
