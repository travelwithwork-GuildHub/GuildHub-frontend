'use client'

import type { ReactNode } from 'react'
import type { ProfileOut, ProjectOut } from '@/api/contract/rest'
import { EmptyState } from '@/empty-state/EmptyState'
import { toUiError } from '@/errors/uiError'
import { ListPanel } from './ListPanel'
import { useListPanel } from './ListPanelProvider'
import type { ListKind } from './paging'

// 兩塊看板開出來的面板：`ListPanel` 的第一個呼叫端。規格 `FE-B01-S01`／`S02`；
// 三個插槽接的是 `FE-X04` 的 `EmptyState`（`FE-X04-S11`）。
//
// ⚠️ **翻譯在這裡，不在容器裡。** 容器把原始的失敗交出來，這裡 `toUiError`，
// `EmptyState` 再依 `kind` 決定畫成載入失敗還是權限阻擋（`FE-X04` design `D3`）。
// 訪客按 E 拿到 401 → 「要先登入才看得到這裡。」——不再是一片空白。
//
// 權限阻擋的動作刻意沒給：標題列已經有「建立你的身分」的入口，登入／登出還沒做
//（`FE-A08`／`FE-A02`）。要不要、去哪裡是之後的事。
//
// ⚠️ 三個插槽**直接寫在 JSX 裡**、兩塊看板各寫一次 —— 不抽成變數。
// `FE-X04-S12` 的 lint 規則看的是插槽裡直接寫的元素；抽成變數是它擋不住的那一種寫法，
// 這個檔案是第一個呼叫端，不該自己先示範繞過。
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
      empty={<EmptyState kind="first-empty" />}
      exhausted={<EmptyState kind="exhausted" />}
      error={({ retry, cause }) => <EmptyState kind="failure" error={toUiError(cause)} retry={retry} />}
    />
  ) : (
    <ListPanel
      kind="profiles"
      title={TITLES.profiles}
      labels={LABELS}
      renderItem={profileLine}
      onClose={closePanel}
      empty={<EmptyState kind="first-empty" />}
      exhausted={<EmptyState kind="exhausted" />}
      error={({ retry, cause }) => <EmptyState kind="failure" error={toUiError(cause)} retry={retry} />}
    />
  )
}
