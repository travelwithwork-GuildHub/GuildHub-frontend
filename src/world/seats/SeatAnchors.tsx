'use client'

import { useRef, type RefObject } from 'react'
import type { SeatAnchor } from './anchors'

// 工位的投影錨點：Canvas 外面的 DOM，每個工位一個。規格 `FE-W16-S06`。
//
// **今天沒有可見內容**（`aria-hidden`、沒有文字、0×0）：它是一個位置 —— `FE-J13` 的座位標籤之後掛在這裡，
// 真瀏覽器驗收（`S08`）拿它當尺量「桌子在哪」與「撞桌子會停」。不是提示、不是按鈕，所以不進無障礙樹。
//
// ⚠️ **位置由 `SeatAnchorProjector` 每幀直接寫進 style**（`CONTEXT.md`：高頻資料不進 React）；
// 這裡只負責「有哪幾個」。元素的**中心**對齊投影點：0×0 的元素，`translate3d` 到哪裡中心就在哪裡。

/** 錨點節點的登記，鍵是 `seat_index`。**身分穩定，不進 React state** —— 跟門標籤同一個做法。 */
export type SeatAnchorNodes = Map<number, HTMLElement>

export function useSeatAnchorNodes(): RefObject<SeatAnchorNodes> {
  return useRef<SeatAnchorNodes>(new Map())
}

export function SeatAnchors({
  anchors,
  nodesRef,
}: {
  anchors: readonly SeatAnchor[]
  nodesRef: RefObject<SeatAnchorNodes>
}) {
  return (
    <div data-testid="seat-anchors" aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      {anchors.map((anchor) => (
        <div
          key={anchor.seatIndex}
          data-testid="seat-anchor"
          data-seat-index={anchor.seatIndex}
          aria-hidden="true"
          ref={(node) => {
            const nodes = nodesRef.current
            if (node === null) nodes.delete(anchor.seatIndex)
            else nodes.set(anchor.seatIndex, node)
          }}
          // 還沒被投影過之前先藏起來 —— 投影器第一幀才知道它在哪。
          style={{ visibility: 'hidden', width: 0, height: 0 }}
          className="absolute top-0 left-0"
        />
      ))}
    </div>
  )
}
