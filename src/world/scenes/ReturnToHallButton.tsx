'use client'

import { HUD_ICON_BUTTON } from '@/design/controls'
import { useScene } from './SceneProvider'

// 「回到 Guild Hall」。規格 `FE-V01-S13`（動作）＋ `FE-X17-S06`（降級）。
//
// **只在房間有**，常駐在標題列（`<Canvas>` 的兄弟，天生不會被 3D 畫面蓋住）。按下是 push 一層（`deep-link` 那條），
// 不是 `history.back()`：深連結直達的人沒有上一層可退。票留著 —— 再走到門前可以直接進。
//
// ⚠️ **降級成 icon-only 後備（`FE-X17-S06`）。** 產品負責人 2026-09-23：在 3D 世界裡把「離開」綁在右上角一顆
// 搶眼的具名網頁大鈕上，蓋過門的空間語彙。主要、可發現的離開方式是**走到門前的情境提示按 E**（`FE-V01-S21`／`FE-X17-S05`）
// 與穿門即走（`FE-V01-S20`）。這顆保留為**純鍵盤／讀屏／卡住時的後備**：icon-only、低顯著、但有 `aria-label`（讀屏念得出、
// 鍵盤 focus 得到），觸發的仍是同一個 `returnToHall`。**動作不變，只降顯著度** —— `world-scenes` 那串「按回到 Guild Hall」
// 的 scenario 指的是動作不是位置，不受影響。
//
// ⚠️ **不要另外加高**：標題列高度由裡面最高的控制決定，這顆只在房間出現；高度下限由 `globals.css` base 層統一給（跟其他控制一致）。

/** 讀屏／測試看得到的名字（icon-only，畫面上沒有可見文字）。 */
export const RETURN_TO_HALL_LABEL = '回到 Guild Hall'

export function ReturnToHallButton() {
  const { scene, returnToHall } = useScene()
  if (scene.id !== 'room') return null
  return (
    <button
      type="button"
      onClick={() => returnToHall()}
      aria-label={RETURN_TO_HALL_LABEL}
      data-testid="return-to-hall"
      className={HUD_ICON_BUTTON}
    >
      {/* 門＋往外的箭頭（Heroicons「arrow-left-on-rectangle」風）。`aria-hidden`：名字由按鈕的 `aria-label` 給。 */}
      <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
        <polyline points="16 17 21 12 16 7" />
        <line x1="21" y1="12" x2="9" y2="12" />
      </svg>
    </button>
  )
}
