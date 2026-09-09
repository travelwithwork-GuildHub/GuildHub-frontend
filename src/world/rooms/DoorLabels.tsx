'use client'

import { useRef, type RefObject } from 'react'
import { layer } from '@/design/layers'
import { LABEL_SIZE } from './labelProjection'
import type { LabelAnchor } from './anchors'

// 門上的名稱與在線數。規格 `FE-W12-S09`／`S12`／`S13`。
//
// ⚠️⚠️ **這是 DOM，不是 3D 文字。** 在 3D 裡畫字的三條路
//（troika／drei／`CanvasTexture`）都會建立 GPU texture 與 material，
// 直接違反 `FE-W09`／`FE-W10` 選定的資源所有權契約 ——
// 要改那份契約要另外提案，MUST NOT 偷渡進來。
//
// ⚠️⚠️ **為什麼不是「走到門前才顯示」。** `CONTEXT.md` 那條鏈是
// 「看見 → 靠近 → 旁聽 → 打招呼 → 正式申請」，而在線數如果只在
// 走到門前才出現，第一環就不成立 —— 那已經是第二環「靠近」了。
// 互動提示仍然重複同樣的資訊當降級。
//
// ⚠️ **位置由 `DoorLabelProjector` 每幀直接寫進 DOM**（`CONTEXT.md`：
// 高頻資料不進 React）。這裡只負責「有哪些標籤、上面寫什麼」。

/** 標籤節點的登記。**身分穩定，不進 React state** —— 跟互動註冊表同一個做法。 */
export type LabelNodes = Map<string, HTMLElement>

export function useLabelNodes(): RefObject<LabelNodes> {
  const nodesRef = useRef<LabelNodes>(new Map())
  return nodesRef
}

export function DoorLabels({
  anchors,
  nodesRef,
}: {
  anchors: readonly LabelAnchor[]
  nodesRef: RefObject<LabelNodes>
}) {
  return (
    <div data-testid="door-labels" className="pointer-events-none absolute inset-0 overflow-hidden">
      {anchors.map((anchor) => (
        <div
          key={anchor.id}
          data-testid="door-label"
          data-target={anchor.id}
          ref={(node) => {
            const nodes = nodesRef.current
            if (node === null) nodes.delete(anchor.id)
            else nodes.set(anchor.id, node)
          }}
          style={{
            zIndex: layer('hud'),
            width: LABEL_SIZE.width,
            height: LABEL_SIZE.height,
            // 還沒被投影過之前先藏起來 —— 不然第一幀會閃在左上角。
            visibility: 'hidden',
          }}
          className="border-line bg-surface text-ink text-caption absolute top-0 left-0 flex items-center justify-center overflow-hidden border px-2 whitespace-nowrap"
        >
          {/* 規格 `FE-W12-S12`：名稱過長**截字**，MUST NOT 把相鄰的標籤擠開。
              名稱的長度由後端決定 —— 讓它影響版面等於把版面交給不可控的輸入。 */}
          <span className="overflow-hidden text-ellipsis">{anchor.text}</span>
        </div>
      ))}
    </div>
  )
}
