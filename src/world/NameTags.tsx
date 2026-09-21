'use client'

import { useRef, type RefObject } from 'react'
import type { RemoteIdentity } from '@/realtime/remotePlayers'
import { useStatusIfProvided } from '@/realtime/StatusProvider'
import { CAPTION, withClass } from '@/design/controls'
import { layer } from '@/design/layers'
import { NAME_TAG_SIZE, SELF_TAG_ID, hasName } from './player/nameTag'

// 狀態（`FE-K05`，design D3）：`st` 非空的人牌子裡多一個 **往上長** 的子節點（`bottom-full`），名字盒 176×28 與 translate 都不動 ——
// `FE-W08-S04`／`S07` 的尺不變、真瀏覽器的 `name-tags.mjs` 不變。位置照舊由 `RemotePlayer` 寫在牌子節點上，狀態跟著走。

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

/** 一塊牌子（遠端或自己共用；`FE-X17`：自己與遠端 SHALL 走同一套渲染）。 */
function PlayerTag({
  id,
  name,
  st,
  isSelf,
  nodesRef,
}: {
  id: string
  name: string
  st: string
  isSelf: boolean
  nodesRef: RefObject<NameTagNodes>
}) {
  // ⚠️ **自己用獨立的 testid（`self-name-tag`）。** 遠端名牌的枚舉（`queryAllByTestId('name-tag')`，
  // 遍布 `remote-world-reconnect`、e2e `reconnect`／`player-status`／`name-tags`）數的是**名單**；
  // 自己不是名單的一員，跟遠端共用 testid 會被那些斷言算進去。獨立 testid 讓自己名牌**零污染**地存在。
  const testid = isSelf ? 'self-name-tag' : 'name-tag'
  return (
    // `name-tag`（登記進 `nodesRef`、每幀被寫 `transform`、176×28、底邊中點對錨點）是**槽**：
    // `-translate-x-1/2 -translate-y-full`（CSS 的 `translate` 屬性）把底邊中點對到錨點；每幀寫的是 `transform`，兩者相加。
    // 槽不裁（狀態要從它上方長出來，`overflow-hidden` 會把狀態切掉 —— 截圖抓到的）；名字盒在裡面，自己裁、自己截字（`S07` 的尺量它）。
    <div
      data-testid={testid}
      data-player={id}
      data-self={isSelf ? 'true' : undefined}
      ref={(node) => {
        const nodes = nodesRef.current
        if (node === null) nodes.delete(id)
        else nodes.set(id, node)
      }}
      style={{ width: NAME_TAG_SIZE.width, height: NAME_TAG_SIZE.height, visibility: 'hidden' }}
      className="absolute top-0 left-0 -translate-x-1/2 -translate-y-full"
    >
      {/* 名字盒：跟槽同尺寸、`leading-7` 撐滿 28 px；單行、超出裁掉、省略記號（`S07`）。
          自己（`FE-X17`）：邊界用 `accent`（而不是 `line`），一眼在人群裡找到自己。 */}
      <div
        data-testid={`${testid}-name`}
        style={{ width: NAME_TAG_SIZE.width, height: NAME_TAG_SIZE.height }}
        {...withClass(
          CAPTION,
          `bg-surface text-ink overflow-hidden border px-2 text-center leading-7 text-ellipsis whitespace-nowrap ${isSelf ? 'border-accent' : 'border-line'}`,
        )}
      >
        {name}
      </div>
      {st !== '' && (
        <span data-testid={`${testid}-status`} {...withClass(CAPTION, 'bg-surface/90 border-line text-ink-muted absolute bottom-full left-0 mb-0.5 w-full overflow-hidden rounded-sm border px-1 text-center leading-5 text-ellipsis whitespace-nowrap')}>
          {st}
        </span>
      )}
    </div>
  )
}

export function NameTags({
  roster,
  nodesRef,
  self,
}: {
  roster: ReadonlyMap<string, RemoteIdentity>
  nodesRef: RefObject<NameTagNodes>
  /** 自己（`FE-X17`）：`id` 一律是 `SELF_TAG_ID`；`name` 是身分的 `display_name`。狀態由這裡自己訂閱（低頻，只有這個元件重繪）。 */
  self?: { readonly name: string }
}) {
  // 自己的狀態（`FE-K05`）：顯示使用者的意圖 —— 打了還沒回聲的（`pending`）優先，否則已確認的（`text`）。
  // 沒有 provider（測試、預覽）就是空字串 —— 跟遠端「狀態空就不顯示那一段」同一條規則。
  const status = useStatusIfProvided()?.snapshot
  const selfStatus = status ? (status.pending ?? status.text) : ''
  return (
    // 容器 `overflow-hidden`：錨點在畫面內、牌子矩形越出畫面的部分由它裁（規格〈畫面外不呈現〉—— 跟門標籤刻意不同）。
    // `pointer-events-none`：點牌子等於點它底下的世界（`S09`）。`hud` 層：面板（`panel`）蓋得住它。
    <div data-testid="name-tags" style={{ zIndex: layer('hud') }} className="pointer-events-none absolute inset-0 overflow-hidden">
      {[...roster.values()].filter((who) => hasName(who.name)).map((who) => (
        <PlayerTag key={who.id} id={who.id} name={who.name} st={who.st} isSelf={false} nodesRef={nodesRef} />
      ))}
      {/* 自己（`FE-X17-S01`／`S02`）：有合法名字才有牌子（跟遠端同一條 `hasName`）；`LocalPlayer` 每幀寫它的位置。 */}
      {self !== undefined && hasName(self.name) && (
        <PlayerTag key={SELF_TAG_ID} id={SELF_TAG_ID} name={self.name} st={selfStatus} isSelf nodesRef={nodesRef} />
      )}
    </div>
  )
}
