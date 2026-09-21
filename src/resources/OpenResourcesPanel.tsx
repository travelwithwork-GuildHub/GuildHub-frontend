'use client'

import { useEffect, useRef } from 'react'
import type { ProjectResourceOut, ResourceType } from '@/api/contract/rest'
import { CAPTION, PRIMARY, SECONDARY, TERTIARY, withClass } from '@/design/controls'
import { EmptyState } from '@/empty-state/EmptyState'
import { useIdentity } from '@/identity/IdentityProvider'
import { PanelShell } from '@/panel/PanelShell'
import { SafeExternalLink } from '@/security/SafeExternalLink'
import { RESOURCES_PANEL_TITLE, usePanelProject } from './ResourcesPanel'
import { RESOURCES_PANEL_ID, useProjectResources, useResourcesPanel } from './ResourcesProvider'

// 資源面板的**內容**（被 `PanelHost` lazy 載入）。規格 `FE-J14`〈面板依伺服器順序列出資源〉、
//〈空、載入、失敗三種狀態〉、〈結案與權限失敗〉、〈寫入控制項只給寫入者〉、`output-safety`〈具名元件〉。
//
// ⚠️ **網址一律走 `SafeExternalLink`**：放行才是連結，放行不了的是純文字（`S01`／`S02`）。自己組 `<a href>` 會連 lint 一起紅。
// ⚠️ **寫入控制項是「不存在」不是 `hidden`**（`S10`）：`hidden` 不是權限邊界。
// ⚠️ 失敗的呈現由 `FE-X03` 的 `kind` 決定（`EmptyState` 的 `failureKind`），這裡不讀 status、不自己分類。
// ⚠️ 新增／修改／刪除的**行為**在第 7 片（`--form`）。這一片只負責它們在不在 —— `S03`／`S10` 驗的正是這件事。

export const RESOURCES_PANEL_COPY = { close: '關閉', loading: '正在讀取這個專案的資源⋯⋯', closed: '這個專案已經結案，資源不能再修改。', create: '新增資源', edit: '修改', remove: '刪除' }
/** type 的可辨識標記**是文字**，不是只靠顏色或形狀（`S01`：輔助技術讀得到是哪一種）。 */
export const RESOURCE_TYPE_LABELS: Record<ResourceType, string> = { github: 'GitHub', figma: 'Figma', notion: 'Notion', drive: '雲端硬碟', meeting: '會議' }

function Row({ resource, writer }: { resource: ProjectResourceOut; writer: boolean }) {
  return (
    <li data-testid="resource-row" className="border-line rounded-control flex flex-col gap-2 border p-3">
      <span data-testid="resource-type" data-type={resource.type} {...withClass(CAPTION, 'text-ink-muted')}>{RESOURCE_TYPE_LABELS[resource.type]}</span>
      <span data-testid="resource-label" className="text-ink break-words">{resource.label}</span>
      <SafeExternalLink href={resource.url} className="text-ink-muted break-all underline">{resource.url}</SafeExternalLink>
      {/* 一列裡兩個動作都不是主要動作（`FE-X16-S09`：每個操作區至多一個主要動作 —— 那一個是「新增」）。 */}
      {writer && (
        <div className="flex gap-2">
          <button type="button" data-testid="resource-edit" {...SECONDARY}>{RESOURCES_PANEL_COPY.edit}</button>
          <button type="button" data-testid="resource-delete" {...TERTIARY}>{RESOURCES_PANEL_COPY.remove}</button>
        </div>
      )}
    </li>
  )
}

export default function OpenResourcesPanel() {
  const { projectId, project } = usePanelProject()
  const { closePanel, yieldPanel } = useResourcesPanel()
  const { state, retry } = useProjectResources(projectId)
  const identity = useIdentity()
  const root = useRef<HTMLDivElement>(null)

  // 焦點進面板：Tab 從這裡開始在面板內循環。載入殼先取得焦點，內容掛上來後在同一個 commit 接過來。
  useEffect(() => {
    root.current?.focus()
  }, [])

  // 已結案有兩個來源：開面板時就知道（`S09`），或 403／409 之後確認出來（`S05`）。
  const closed = state.phase === 'closed' || project?.status === 'closed'
  const owner = identity.state === 'signed-in' && project !== null && identity.profile.id === project.owner_id
  // 寫入者＝`me.id === owner_id` ∧ `status === 'active'`（design D6）。身分或專案還沒到就不是。
  const writer = owner && project?.status === 'active' && !closed
  // 結案之後 owner 留著已經讀到的清單，非 owner 不顯示（closed 只有 owner 讀得到）。
  const items = state.phase === 'ready' || (state.phase === 'closed' && owner) ? state.items : null

  return (
    <PanelShell
      title={RESOURCES_PANEL_TITLE}
      closeLabel={RESOURCES_PANEL_COPY.close}
      testId={RESOURCES_PANEL_ID}
      panel={{ id: RESOURCES_PANEL_ID, canYield: () => true, onYield: yieldPanel }}
      onCloseRequest={closePanel}
    >
      {/* 只是捲動容器與初始焦點，不是第二個 landmark（殼的 section 已經叫「專案資源」）。 */}
      <div ref={root} tabIndex={-1} data-testid="resources-panel-root" data-phase={state.phase} className="flex min-h-0 flex-1 flex-col gap-gutter overflow-y-auto outline-none">
        {closed && <p data-testid="resources-closed" role="status" {...withClass(CAPTION, 'text-ink-muted')}>{RESOURCES_PANEL_COPY.closed}</p>}
        {state.phase === 'loading' && <p data-testid="resources-loading" role="status" className="text-ink-muted">{RESOURCES_PANEL_COPY.loading}</p>}
        {state.phase === 'failed' && <EmptyState kind="failure" error={state.error} retry={retry} />}
        {items !== null && items.length === 0 && <EmptyState kind="first-empty" />}
        {items !== null && items.length > 0 && (
          <ul className="flex flex-col gap-gutter">{items.map((resource) => <Row key={resource.id} resource={resource} writer={writer} />)}</ul>
        )}
        {writer && <button type="button" data-testid="resource-create" {...withClass(PRIMARY, 'self-start')}>{RESOURCES_PANEL_COPY.create}</button>}
      </div>
    </PanelShell>
  )
}
