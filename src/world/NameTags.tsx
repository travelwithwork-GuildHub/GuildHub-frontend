'use client'

import { useRef, type RefObject } from 'react'
import type { RemoteIdentity } from '@/realtime/remotePlayers'
import { CAPTION, withClass } from '@/design/controls'
import { layer } from '@/design/layers'
import { NAME_TAG_SIZE, hasName } from './player/nameTag'

// 遠端玩家頭上的名字牌。規格 `name-tag`（`FE-W08-S01`～`S03`、`S07`～`S09`）。
//
// ⚠️⚠️ **這是 DOM，不是 3D 文字**（ADR 0012；理由同門標籤：3D 裡畫字會建 GPU texture，違反 ADR 0003）。
// 這裡只負責「有哪些牌子、上面寫什麼」—— 名單是低頻的（join／leave 才變），進 React 是對的。
//
// ⚠️⚠️ **位置不在這裡。** 每個牌子的 `transform`／`visibility` 由那個人的 `RemotePlayer` 在自己的 `useFrame` 裡
// 每幀直接寫（design D2：同一幀、同一次求值），不進 React。這裡把節點登記進 `nodesRef`，跟門標籤的 `useLabelNodes` 同一個做法。
// 兩半靠 ref 接，忘了任一半不會報錯（DOM 在、不動）—— 那條由 e2e `S05` 守。
//
// 初始 `visibility: hidden`：還沒被投影過的牌子會在左上角閃一幀（design D8）；`inside` 為 false 的人也是 hidden（`S08`）。

/** 牌子節點的登記。**身分穩定，不進 React state。** */
export type NameTagNodes = Map<string, HTMLElement>

export function useNameTagNodes(): RefObject<NameTagNodes> {
  return useRef<NameTagNodes>(new Map())
}

export function NameTags({ roster, nodesRef }: { roster: ReadonlyMap<string, RemoteIdentity>; nodesRef: RefObject<NameTagNodes> }) {
  return (
    // 容器 `overflow-hidden`：錨點在畫面內、牌子矩形越出畫面的部分由它裁（規格〈畫面外不呈現〉—— 跟門標籤刻意不同）。
    // `pointer-events-none`：點牌子等於點它底下的世界（`S09`）。`hud` 層：面板（`panel`）蓋得住它。
    <div data-testid="name-tags" style={{ zIndex: layer('hud') }} className="pointer-events-none absolute inset-0 overflow-hidden">
      {[...roster.values()].filter((who) => hasName(who.name)).map((who) => (
        <div
          key={who.id}
          data-testid="name-tag"
          data-player={who.id}
          ref={(node) => {
            const nodes = nodesRef.current
            if (node === null) nodes.delete(who.id)
            else nodes.set(who.id, node)
          }}
          style={{ width: NAME_TAG_SIZE.width, height: NAME_TAG_SIZE.height, visibility: 'hidden' }}
          // `-translate-x-1/2 -translate-y-full`（CSS 的 `translate` 屬性）把底邊中點對到錨點；每幀寫的是 `transform`，兩者相加。
          // `leading-7` 撐滿 28 px 的高度；單行、超出裁掉、省略記號（`S07`）。
          {...withClass(CAPTION, 'border-line bg-surface text-ink absolute top-0 left-0 -translate-x-1/2 -translate-y-full overflow-hidden border px-2 text-center leading-7 text-ellipsis whitespace-nowrap')}
        >
          {who.name}
        </div>
      ))}
    </div>
  )
}
