'use client'

import type { ReactNode } from 'react'
import type { ProfileOut, ProjectOut } from '@/api/contract/rest'
import { ListPanel } from './ListPanel'
import { useListPanel } from './ListPanelProvider'
import type { ListKind } from './paging'

// 兩塊看板開出來的面板：`ListPanel` 的第一個呼叫端。規格 `FE-B01-S01`／`S02`。
//
// ⚠️ **這裡刻意沒有給「首次無資料」「翻到底」「錯誤」三種節點。**
// 那三種狀態的文案歸 `FE-X04`／`FE-X03`（都標著「唯一一份」），在它們做完之前
// 這個面板在那三種狀態下什麼都不顯示 —— 這是 `design.md` `D4` 明寫的代價，
// 不是漏掉。**不要在這裡補一句「暫時的」** —— 那就是第二份。
//
// ⚠️ **卡片上放哪些欄位不是這一列決定的**（`design.md` 待答問題 2）。
// 下面只印一個認得出來的名字，讓「開的是案件還是人才」在畫面上讀得出來。
// 案件卡是 `FE-B02`（W6）、人才卡是 `FE-B04`（W2）的事。

const TITLES: Record<ListKind, string> = { projects: '專案看板', profiles: '人才看板' }
const LABELS = { next: '下一頁', close: '關閉' }
const LINE = 'block overflow-hidden text-ellipsis whitespace-nowrap'

function projectLine(item: ProjectOut): ReactNode {
  return <span className={LINE}>{item.title}</span>
}
function profileLine(item: ProfileOut): ReactNode {
  return <span className={LINE}>{item.display_name}</span>
}

export function BoardPanel() {
  const { open, closePanel } = useListPanel()
  if (open === null) return null
  // 分兩支寫而不是一個 `renderItem: (item: A | B)`：
  // 型別讓「案件面板拿到人才資料」在 typecheck 就紅。
  return open === 'projects' ? (
    <ListPanel
      kind="projects"
      title={TITLES.projects}
      labels={LABELS}
      renderItem={projectLine}
      onClose={closePanel}
    />
  ) : (
    <ListPanel
      kind="profiles"
      title={TITLES.profiles}
      labels={LABELS}
      renderItem={profileLine}
      onClose={closePanel}
    />
  )
}
