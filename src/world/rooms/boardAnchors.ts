import type { ListKind } from '@/list-panel/paging'
import { boardItems, BOARD_LIST_KIND } from './BoardTargets'
import type { BoardKind } from './labels'

// 兩塊看板的**投影錨點**（`FE-W20`）：看板面上要釘摘要 overlay 的那個世界座標點。
//
// ⚠️ **座標只有一份** —— x／z 走 `boardItems()`（讀 `LAYOUT`），不自己寫；跟 `BoardTargets` 的互動註冊同一個來源。
// y 是看板面的高度（`BOARD_FACE_Y`）：門標籤／工位錨點在地面（y≈0），看板摘要在**板面上**，所以要抬高。
//
// ⚠️ **overlay 是一塊釘在錨點上的 DOM 清單，不是每張實體卡各自投影**（design D5）：
// 專案看板的 4 張卡是橫排、人才看板的 3 顆徽章是直排（`semantic.tsx`）—— 兩者幾何不同，逐卡投影會漂、會游移，
// 而且 0.3 寬的卡塞不下字。實體卡／徽章留作**裝飾背板**（跟門的造型是裝飾、字在 DOM 標籤上同一個道理），
// 摘要的字在這一塊 DOM 清單上。

/**
 * 看板面的高度（世界單位）。對齊 `semantic.tsx`：專案看板的卡片排在 y=1.45、人才看板徽章在 y∈[0.91,1.75]、
 * 兩塊的橫板中心在 `0.9 + height/2 - 0.1`（專案 1.35、人才 1.55）。取 **1.45** 讓清單坐在兩塊板面上都合適。
 */
export const BOARD_FACE_Y = 1.45

export interface BoardAnchor {
  /** `LAYOUT` 裡的看板 id（`board-project`／`board-talent`）—— overlay 節點與投影器用它對應。 */
  readonly id: string
  readonly kind: BoardKind
  /** 這塊看板開哪一種清單（決定摘要打哪個端點）。 */
  readonly listKind: ListKind
  readonly x: number
  readonly y: number
  readonly z: number
}

/** 兩塊看板的錨點。**「有幾塊看板」的唯一來源是 `boardItems()`** —— 這裡只補上 y 與 listKind。 */
export const BOARD_ANCHORS: readonly BoardAnchor[] = boardItems().map(({ item, kind }) => ({
  id: item.id,
  kind,
  listKind: BOARD_LIST_KIND[kind],
  x: item.x,
  y: BOARD_FACE_Y,
  z: item.z,
}))
