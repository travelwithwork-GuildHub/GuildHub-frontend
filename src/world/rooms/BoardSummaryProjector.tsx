'use client'

import type {} from '@react-three/fiber'
import { useFrame, useThree } from '@react-three/fiber'
import type { RefObject } from 'react'
import { cameraOffset } from '../camera'
import { screenPixelFor } from './labelProjection'
import { BOARD_ANCHORS } from './boardAnchors'
import type { BoardSummaryNodes } from './BoardSummary'

// 把看板摘要釘在板面上的投影（`FE-W20`；ADR 0015）。
//
// 跟 `SeatAnchorProjector`／`DoorLabelProjector` 同一條邊界：**它在 Canvas 裡面（要 `useFrame`）、渲染 `null`、
// 每幀直接寫 Canvas 外面的 DOM**。錨點是**靜態**的（看板不動）—— 落在門標籤／工位錨點那一族，不是名字牌那種每幀求值錨（ADR 0015）。
// 對齊點是**中心**（0×0 的錨點元素，卡片自己往四周撐開）。
//
// ⚠️ **NaN 不寫進 DOM**：`translate3d(NaNpx…)` 瀏覽器會整條丟掉、元素留在上一幀 —— 看起來像「沒跟上」而不是壞掉。座標算不出來就藏起來。
// ⚠️ **畫面外是 `visibility: hidden`** —— 元素還在、位置仍寫，但移出無障礙樹（`FE-W20-S09`：走出畫面整塊消失、不留半截給螢幕閱讀器）。

export function BoardSummaryProjector({ nodesRef }: { nodesRef: RefObject<BoardSummaryNodes> }) {
  const camera = useThree((state) => state.camera)
  const size = useThree((state) => state.size)

  useFrame(() => {
    const nodes = nodesRef.current
    if (nodes.size === 0) return
    // 相機在 target 的固定偏移上，所以 target 是它的位置減掉那個偏移（跟工位錨點同一份推導）。
    const offset = cameraOffset()
    const target = { x: camera.position.x - offset.x, z: camera.position.z - offset.z }

    for (const anchor of BOARD_ANCHORS) {
      const node = nodes.get(anchor.id)
      if (node === undefined) continue
      const { x, y, inside } = screenPixelFor(anchor, target, size)
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        node.style.visibility = 'hidden'
        continue
      }
      node.style.transform = `translate3d(${x}px, ${y}px, 0)`
      node.style.visibility = inside ? 'visible' : 'hidden'
    }
  })

  return null
}
