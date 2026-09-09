'use client'

import { LAYOUT } from '../layout/guildHallLayout'
import type { LayoutItem } from '../layout/types'
import { Interactable } from '../interaction/Interactable'
import { BOARD_LABELS, type BoardKind } from './labels'

// 兩塊看板的互動登記。規格 `FE-W12-S14`。
//
// ⚠️⚠️ **為什麼不寫在 `GuildHall` 裡面。**
// `spatial-interaction` 的文件示範的是「把 `<Interactable>` 放進渲染那個東西的
// `<group>`」，而那在這裡會讓**環境層依賴互動層** ——
// `GuildHall` 與 `WorldShell` 目前都可以單獨渲染來驗幾何，
// 加進去之後它們就非得包一層 `<InteractionProvider>` 不可（實測：三條既有測試變紅）。
// `FE-W10`／`FE-W11` 一路把「造型」「配置」「物理」分開，不在這裡回頭把它們黏起來。
//
// ⚠️ **座標仍然只有一份** —— 這裡走 `LAYOUT`，不自己寫座標。
//
// ⚠️ **看板不接任何 API。** 板上的卡片數不反映資料：卡片上沒有字，
// 「四張卡代表四個專案」在畫面上讀不出來。它們在這一項只做一件事 ——
// 從「一塊死掉的幾何體」變成「空間裡認得出來的地標」。

/** 這個配置項是不是一塊看板。**看 `kind` 不是 `id`** —— 改名字就靜默失效。 */
function boardKindOf(item: LayoutItem): BoardKind | null {
  if (item.kind === 'projectBoard' || item.kind === 'talentBoard') return item.kind
  return null
}

/** 配置裡的每一塊看板。**匯出給測試用** —— 它是「有幾塊看板」的唯一來源。 */
export function boardItems(): { item: LayoutItem; kind: BoardKind }[] {
  return LAYOUT.flatMap((item) => {
    const kind = boardKindOf(item)
    return kind === null ? [] : [{ item, kind }]
  })
}

export function BoardTargets() {
  return (
    <>
      {boardItems().map(({ item, kind }) => (
        <Interactable
          key={item.id}
          id={item.id}
          x={item.x}
          z={item.z}
          label={BOARD_LABELS[kind]}
        />
      ))}
    </>
  )
}
