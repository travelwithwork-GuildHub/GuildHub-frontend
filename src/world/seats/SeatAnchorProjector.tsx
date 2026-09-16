'use client'

import type {} from '@react-three/fiber'
import { useFrame, useThree } from '@react-three/fiber'
import type { RefObject } from 'react'
import { cameraOffset } from '../camera'
import { screenPixelFor } from '../rooms/labelProjection'
import type { SeatAnchor } from './anchors'
import type { SeatAnchorNodes } from './SeatAnchors'

// 把工位錨點釘在桌面中心的投影上。規格 `FE-W16-S06`（design D5 補記；ADR 0010）。
//
// 跟 `DoorLabelProjector` 同一條邊界：**它在 Canvas 裡面（要 `useFrame`）、渲染 `null`、每幀直接寫 Canvas 外面的 DOM**。
// 差別只有對齊點：門標籤對齊的是扣掉標籤尺寸的左上角，錨點對齊的是**中心**（0×0 的元素，位置就是中心）。
//
// ⚠️ **畫面外是 hidden，元素仍在、位置仍寫**（`S06`：座標永遠是有限數）—— 里程計走到通道中點時要八個都讀得到。
// ⚠️ **NaN 不寫進 DOM**：`translate3d(NaNpx…)` 瀏覽器會整條丟掉、元素留在上一幀的位置 —— 那看起來像「錨點沒跟上」，
// 而不是像壞掉。座標算不出來就藏起來。

export function SeatAnchorProjector({
  anchors,
  nodesRef,
}: {
  anchors: readonly SeatAnchor[]
  nodesRef: RefObject<SeatAnchorNodes>
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
      const node = nodes.get(anchor.seatIndex)
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
