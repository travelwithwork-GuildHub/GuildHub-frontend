'use client'

import type {} from '@react-three/fiber'
import { useFrame, useThree } from '@react-three/fiber'
import type { RefObject } from 'react'
import { cameraOffset } from '../camera'
import type { LabelAnchor } from './anchors'
import type { LabelNodes } from './DoorLabels'
import { labelRectFor } from './labelProjection'

// 把門的標籤釘在門上。規格 `FE-W12-S10`／`S13`。
//
// ⚠️ **它在 Canvas 裡面，因為它要 `useFrame`；它渲染的是 `null`。**
// 標籤本身是 Canvas 外面的 DOM（`DoorLabels`）—— 跟互動提示同一個做法。
//
// ⚠️⚠️ **每幀直接寫 DOM，不進 React**（`CONTEXT.md`：高頻資料不進 React）。
// 相機每幀都在追角色，所以標籤每幀都要動 ——
// 走 state 的話一次移動會觸發幾十次整棵樹重繪，而**那不會有錯誤訊息，只會變慢**。

export function DoorLabelProjector({
  anchors,
  nodesRef,
}: {
  anchors: readonly LabelAnchor[]
  nodesRef: RefObject<LabelNodes>
}) {
  const camera = useThree((state) => state.camera)
  const size = useThree((state) => state.size)

  useFrame(() => {
    const nodes = nodesRef.current
    if (nodes.size === 0) return
    // 相機在 target 的固定偏移上，所以 target 是它的位置減掉那個偏移。
    const offset = cameraOffset()
    const target = { x: camera.position.x - offset.x, z: camera.position.z - offset.z }

    for (const anchor of anchors) {
      const node = nodes.get(anchor.id)
      if (node === undefined) continue
      const rect = labelRectFor(anchor, target, size)
      if (rect === null) {
        // 規格 `FE-W12-S13`：投影落在畫面外時**不呈現**。
        node.style.visibility = 'hidden'
        continue
      }
      node.style.visibility = 'visible'
      node.style.transform = `translate3d(${rect.left}px, ${rect.top}px, 0)`
    }
  })

  return null
}
