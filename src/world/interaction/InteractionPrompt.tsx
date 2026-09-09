'use client'

import { layer } from '@/design/layers'
import { useInteraction } from './InteractionProvider'

// 「按 E」的提示。規格 `FE-W06-S13`／`S14`。
//
// ⚠️ **這是 DOM，不是 3D 物件**（`CONTEXT.md`：3D 負責空間，DOM 負責產品操作）。
// 3D 裡的文字在固定的 Orthographic 相機下有可讀性與縮放問題，
// 而那不是這一層要解決的事。
//
// ⚠️ **提示要指名物件。** 只寫「按 E」的話，兩個物件靠很近時
// 它沒有回答使用者真正在問的問題：**按下去會發生什麼。**

export function InteractionPrompt() {
  const { target } = useInteraction()

  if (target.id === null) return null

  return (
    <div
      data-testid="interaction-prompt"
      role="status"
      style={{ zIndex: layer('hud') }}
      className="border-line bg-surface text-ink absolute bottom-gutter left-1/2 -translate-x-1/2 border px-gutter py-2"
    >
      按 <kbd>E</kbd> {target.label}
    </div>
  )
}
