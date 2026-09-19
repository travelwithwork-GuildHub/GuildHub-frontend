'use client'

import type { ReactNode } from 'react'
import type { ProjectOut, ProjectStatus } from '@/api/contract/rest'
import { CAPTION, withClass } from '@/design/controls'
import { EmptyState } from '@/empty-state/EmptyState'
import { toUiError } from '@/errors/uiError'
import { MY_PROJECTS_MAX_PAGES } from './myProjectsScan'
import { PAGE_SIZE } from '@/api/contract/limits'
import type { MyProjectsState } from './useMyProjects'
import { PROJECT_STATUS_LABEL } from './projectStatus'

// 「我的案件」視圖的畫面（規格 `FE-J03`）。純呈現：狀態來自 `useMyProjects`（住在 `BoardPanel`，成軍／結案回來要 `patch`），卡片由呼叫端給（跟 `ListPanel.renderItem` 同一種形狀）。
// 三種狀態各自可辨識（`S03`）：載入中 `aria-busy`、空 → `EmptyState`（`first-empty`，仍標看過幾個）、失敗 → `EmptyState`（`failure`：500 有重試、401 是權限阻擋）。
// **誠實標明**（`S02`）：看過幾個案子、哪些狀態只看了前 100 個、到期的後端不回 —— 一份不完整的清單不能長得像完整的。
// 這是 `ListPanel` 的 `body`：住在內容區、詳情蓋上來時跟著 inert、不卸載（返回時捲動位置還在，`S04`）。

export const MY_PROJECTS_LABELS = {
  seen: (n: number) => `看過 ${n} 個案子`,
  capped: (status: ProjectStatus) => `${PROJECT_STATUS_LABEL[status]}只看了前 ${MY_PROJECTS_MAX_PAGES * PAGE_SIZE} 個`,
  expired: '已到期的案子後端不會回，這裡看不到。',
} as const

export function MyProjects({
  state,
  retry,
  renderItem,
}: {
  state: MyProjectsState
  retry: () => void
  renderItem: (item: ProjectOut, ctx: { fetchedAt: number }) => ReactNode
}) {
  const ready = state.phase === 'ready' ? state : null
  return (
    <div data-testid="my-projects" aria-busy={state.phase === 'loading'} className="flex min-h-0 flex-1 flex-col gap-2">
      {ready !== null && (
        <p data-testid="my-projects-summary" {...withClass(CAPTION, 'text-ink-muted')}>
          {MY_PROJECTS_LABELS.seen(ready.seen)}。{MY_PROJECTS_LABELS.expired}
        </p>
      )}
      {ready?.capped.map((status) => (
        <p key={status} data-testid="my-projects-capped" data-status={status} {...withClass(CAPTION, 'text-ink-muted')}>
          {MY_PROJECTS_LABELS.capped(status)}
        </p>
      ))}
      {ready !== null && ready.items.length > 0 && (
        <ul className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
          {ready.items.map((item) => (
            <li key={item.id}>{renderItem(item, { fetchedAt: ready.fetchedAt })}</li>
          ))}
        </ul>
      )}
      {ready !== null && ready.items.length === 0 && <EmptyState kind="first-empty" />}
      {state.phase === 'failed' && <EmptyState kind="failure" error={toUiError(state.cause)} retry={retry} />}
    </div>
  )
}
