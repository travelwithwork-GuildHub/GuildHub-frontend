'use client'

import { useScene } from './SceneProvider'

// 「回到 Guild Hall」。規格 `FE-V01-S13`。
//
// **只在房間有**，常駐在標題列（`<Canvas>` 的兄弟，天生不會被 3D 畫面蓋住）。按下是 push 一層（`deep-link` 那條），
// 不是 `history.back()`：深連結直達的人沒有上一層可退。票留著 —— 再走到門前可以直接進。
// 觸控目標 ≥ 44px（`ui-ux-pro-max` ux「Touch Target Size」）。

export function ReturnToHallButton() {
  const { scene, returnToHall } = useScene()
  if (scene.id !== 'room') return null
  return (
    <button type="button" onClick={() => returnToHall()} className="border-line min-h-11 rounded border px-3">
      回到 Guild Hall
    </button>
  )
}
