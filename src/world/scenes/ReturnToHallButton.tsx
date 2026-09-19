'use client'

import { SECONDARY } from '@/design/controls'
import { useScene } from './SceneProvider'

// 「回到 Guild Hall」。規格 `FE-V01-S13`。
//
// **只在房間有**，常駐在標題列（`<Canvas>` 的兄弟，天生不會被 3D 畫面蓋住）。按下是 push 一層（`deep-link` 那條），
// 不是 `history.back()`：深連結直達的人沒有上一層可退。票留著 —— 再走到門前可以直接進。
// 外觀走 `design/controls` 的 `SECONDARY`（`FE-X13`：邊界對比 3:1 用 `control-edge`，`line` 只有 1.27:1 不夠）。
// ⚠️ **不要另外加高**（原本有 `min-h-11`）：標題列的高度由裡面最高的控制決定，這顆只在房間出現，
// 多 2px 就讓房間的標題列比大廳高 —— `FE-X16-S19` 量到三種身分的 rect 不同（e2e 抓到的）。高度下限由 `globals.css` 的 base 層統一給。

export function ReturnToHallButton() {
  const { scene, returnToHall } = useScene()
  if (scene.id !== 'room') return null
  return (
    <button type="button" onClick={() => returnToHall()} {...SECONDARY}>
      回到 Guild Hall
    </button>
  )
}
