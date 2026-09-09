'use client'

import { useEffect } from 'react'
import { useInteraction } from './InteractionProvider'

// 可互動物件的 contract。規格 `FE-W06`。
//
// ⚠️ **它不渲染任何東西，也不畫任何 3D。** 物件長什麼樣是 `FE-W12`（W3）的事；
// 這裡只負責「我在哪、我叫什麼、按 E 要做什麼」。
//
// 把註冊做成一個元件而不是一個 hook，是為了讓它可以直接放在場景的 JSX 裡：
//
//     <group position={[3, 0, -2]}>
//       <ProjectBoardMesh />
//       <Interactable id="board:main" x={3} z={-2} label="專案看板" onInteract={open} />
//     </group>

export interface InteractableProps {
  /** **穩定鍵。** 重複的話會拋錯（`FE-W06-S16`）。 */
  id: string
  x: number
  z: number
  /** 提示上會出現的名字。**不能只寫「按 E」** —— 見規格 `FE-W06-S13`。 */
  label: string
  onInteract?: () => void
}

export function Interactable({ id, x, z, label, onInteract }: InteractableProps) {
  const { registry } = useInteraction()

  useEffect(() => {
    registry.register({ id, x, z, label, onInteract })
    return () => registry.unregister(id)
    // `onInteract` 進依賴：換 callback 要重新註冊，否則按 E 觸發的是舊的那一個。
  }, [registry, id, x, z, label, onInteract])

  return null
}
