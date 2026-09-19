'use client'

import { useRef, type ReactNode, type RefObject } from 'react'
import type { SeatIndex } from '../layout/projectRoomLayout'
import type { SeatAnchor } from './anchors'

// 工位的投影錨點：Canvas 外面的 DOM，每個工位一個。規格 `FE-W16-S06`（`FE-J13` 修訂：可以容納一個座位標籤）。
//
// 錨點是一個**位置**（0×0），真瀏覽器驗收（`S08`）拿它當尺量「桌子在哪」與「撞桌子會停」。
// `render(seatIndex)` 給內容（`FE-J13` 的座位標籤）：**有內容才**進無障礙樹、接指標事件；回 null 的錨點照舊
// `aria-hidden`、`pointer-events-none`。容器的 `aria-hidden` 也跟著推導 —— 容器藏了，裡面的標籤全部從無障礙樹消失。
//
// ⚠️ **位置由 `SeatAnchorProjector` 每幀直接寫進 style**（`CONTEXT.md`：高頻資料不進 React）；
// 這裡只負責「有哪幾個、裡面放什麼」。元素的**中心**對齊投影點：0×0 的元素，`translate3d` 到哪裡中心就在哪裡；
// 標籤自己用 `absolute` 從中心偏出去（design D1），不動錨點的中心（`S08` 的尺不變）。

/** 錨點節點的登記，鍵是 `seat_index`。**身分穩定，不進 React state** —— 跟門標籤同一個做法。 */
export type SeatAnchorNodes = Map<number, HTMLElement>

export function useSeatAnchorNodes(): RefObject<SeatAnchorNodes> {
  return useRef<SeatAnchorNodes>(new Map())
}

export function SeatAnchors({
  anchors,
  nodesRef,
  render,
}: {
  anchors: readonly SeatAnchor[]
  nodesRef: RefObject<SeatAnchorNodes>
  /** 這一格的內容；null ＝ 沒有內容（錨點只是位置）。 */
  render?: (seatIndex: SeatIndex) => ReactNode
}) {
  const contents = anchors.map((anchor) => ({ anchor, content: render?.(anchor.seatIndex) ?? null }))
  const any = contents.some(({ content }) => content !== null)
  return (
    <div data-testid="seat-anchors" aria-hidden={any ? undefined : 'true'} className="pointer-events-none absolute inset-0 overflow-hidden">
      {contents.map(({ anchor, content }) => (
        <div
          key={anchor.seatIndex}
          data-testid="seat-anchor"
          data-seat-index={anchor.seatIndex}
          aria-hidden={content === null ? 'true' : undefined}
          ref={(node) => {
            const nodes = nodesRef.current
            if (node === null) nodes.delete(anchor.seatIndex)
            else nodes.set(anchor.seatIndex, node)
          }}
          // 還沒被投影過之前先藏起來 —— 投影器第一幀才知道它在哪。
          style={{ visibility: 'hidden', width: 0, height: 0 }}
          className={content === null ? 'pointer-events-none absolute top-0 left-0' : 'pointer-events-auto absolute top-0 left-0'}
        >
          {content}
        </div>
      ))}
    </div>
  )
}
