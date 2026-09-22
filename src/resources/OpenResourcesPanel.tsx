'use client'

import { useEffect, useRef, useState } from 'react'
import { LIMITS } from '@/api/contract/limits'
import type { ProjectResourceOut } from '@/api/contract/rest'
import { CAPTION, PRIMARY, SECONDARY, TERTIARY, withClass } from '@/design/controls'
import { EmptyState } from '@/empty-state/EmptyState'
import { useIdentity } from '@/identity/IdentityProvider'
import { PanelShell } from '@/panel/PanelShell'
import { SafeExternalLink } from '@/security/SafeExternalLink'
import { ResourceDeleteConfirm } from './ResourceDeleteConfirm'
import { ResourceForm, type ResourceFormIntent } from './ResourceForm'
import { RESOURCE_FORM_COPY, RESOURCE_TYPE_LABELS } from './resourceRules'
import { RESOURCES_PANEL_TITLE, usePanelProject } from './ResourcesPanel'
import { RESOURCES_PANEL_ID, useProjectResources, useResourcesPanel } from './ResourcesProvider'

// 資源面板的**內容**（被 `PanelHost` lazy 載入）。規格 `FE-J14`〈面板依伺服器順序列出資源〉、
//〈空、載入、失敗三種狀態〉、〈結案與權限失敗〉、〈寫入控制項只給寫入者〉、`output-safety`〈具名元件〉。
//
// ⚠️ **網址一律走 `SafeExternalLink`**：放行才是連結，放行不了的是純文字（`S01`／`S02`）。自己組 `<a href>` 會連 lint 一起紅。
// ⚠️ **寫入控制項是「不存在」不是 `hidden`**（`S10`）：`hidden` 不是權限邊界。
// ⚠️ 失敗的呈現由 `FE-X03` 的 `kind` 決定（`EmptyState` 的 `failureKind`），這裡不讀 status、不自己分類。
// ⚠️ **新增與修改的行為都在 `ResourceForm`**、**刪除在 `ResourceDeleteConfirm`**；這裡只管它們開在哪一筆上。
// ⚠️ **上限是 `disabled` 加一句可及描述**（`S16`）：`disabled` 不是權限邊界也不是閘門，handler 自己再擋一次。
//    數字一律從 `LIMITS` **在渲染時**讀（design `D9`）—— 元件裡寫死 50 的話，把上限換成 3 那一段判準紅。

/** 已達上限時掛在新增鈕的 `aria-describedby` 上（`S16`：說得出為什麼按不下去）。 */
const LIMIT_NOTE_ID = 'resource-create-limit'

export const RESOURCES_PANEL_COPY = { close: '關閉', loading: '正在讀取這個專案的資源⋯⋯', closed: '這個專案已經結案，資源不能再修改。', create: '新增資源', edit: '修改', remove: '刪除' }
/** type 的文字標記搬到 `resourceRules`（表單的選項與清單要同一份）；這裡再匯出一次，呼叫端不必知道搬去哪了。 */
export { RESOURCE_TYPE_LABELS }

type RowAction = (resource: ProjectResourceOut, from: HTMLButtonElement) => void

function Row({ resource, writer, onEdit, onDelete }: { resource: ProjectResourceOut; writer: boolean; onEdit: RowAction; onDelete: RowAction }) {
  return (
    <li data-testid="resource-row" className="border-line rounded-control flex flex-col gap-2 border p-3">
      <span data-testid="resource-type" data-type={resource.type} {...withClass(CAPTION, 'text-ink-muted')}>{RESOURCE_TYPE_LABELS[resource.type]}</span>
      <span data-testid="resource-label" className="text-ink break-words">{resource.label}</span>
      <SafeExternalLink href={resource.url} className="text-ink-muted break-all underline">{resource.url}</SafeExternalLink>
      {/* 一列裡兩個動作都不是主要動作（`FE-X16-S09`：每個操作區至多一個主要動作 —— 那一個是「新增」）。 */}
      {writer && (
        <div className="flex gap-2">
          <button type="button" data-testid="resource-edit" onClick={(e) => onEdit(resource, e.currentTarget)} {...SECONDARY}>{RESOURCES_PANEL_COPY.edit}</button>
          <button type="button" data-testid="resource-delete" onClick={(e) => onDelete(resource, e.currentTarget)} {...TERTIARY}>{RESOURCES_PANEL_COPY.remove}</button>
        </div>
      )}
    </li>
  )
}

export default function OpenResourcesPanel() {
  const { projectId, project } = usePanelProject()
  const { closePanel, yieldPanel, store } = useResourcesPanel()
  const { state, retry } = useProjectResources(projectId)
  const identity = useIdentity()
  const root = useRef<HTMLDivElement>(null)
  const [creating, setCreating] = useState(false)
  /** 不是 `null` 就是**在修改這一筆**。存整筆而不是 id：表單要它現在的值當初始值與差集基準。 */
  const [editing, setEditing] = useState<ProjectResourceOut | null>(null)
  /** 不是 `null` 就是**正在確認要不要刪這一筆**。存整筆：確認層要呈現它的名稱（`S20`）。 */
  const [deleting, setDeleting] = useState<ProjectResourceOut | null>(null)
  // 伺服器說「沒有權限」（而且確認過專案仍不是 closed）：收掉寫入控制項。**住在面板不住在 store** ——
  // 它是這一次開著的面板的事，關掉再開會重讀，那時該由伺服器重新說話。
  const [writeDenied, setWriteDenied] = useState(false)
  const formIntent = useRef<ResourceFormIntent | null>(null)
  const createButton = useRef<HTMLButtonElement>(null)
  /** 表單是從哪一顆鈕開的 —— 關掉之後焦點回那一顆（表單被卸載，不接的話焦點掉到 body）。 */
  const opener = useRef<HTMLButtonElement | null>(null)

  // 焦點進面板：Tab 從這裡開始在面板內循環。載入殼先取得焦點，內容掛上來後在同一個 commit 接過來。
  useEffect(() => {
    root.current?.focus()
  }, [])

  // 已結案有兩個來源：開面板時就知道（`S09`），或 403／409 之後確認出來（`S05`）。
  const closed = state.phase === 'closed' || project?.status === 'closed'
  const owner = identity.state === 'signed-in' && project !== null && identity.profile.id === project.owner_id
  // 寫入者＝`me.id === owner_id` ∧ `status === 'active'`（design D6）。身分或專案還沒到就不是。
  const writer = owner && project?.status === 'active' && !closed && !writeDenied
  // 結案之後 owner 留著已經讀到的清單，非 owner 不顯示（closed 只有 owner 讀得到）。
  const items = state.phase === 'ready' || (state.phase === 'closed' && owner) ? state.items : null

  // 已結案：開著的表單也是寫入控制項，一起收掉（`S07`）。**用推導的，不在 effect 裡 setState**
  //（`react-hooks/set-state-in-effect`：那會多一輪串聯渲染，而且「已結案」本來就是一個推導得出來的事實）。
  // ⚠️ **「沒有權限」不收表單**：規格要求那一句呈現**在表單上**，同時只收掉新增／修改／刪除的控制項 ——
  // 連表單一起收的話，使用者按了送出之後畫面只是靜靜地少了幾顆按鈕，沒有人告訴他為什麼。
  const formOpen = (creating || editing !== null) && !closed
  const confirmOpen = deleting !== null && !closed
  // 上限（`S16`）：清單還沒到手（`null`）時不算滿 —— 那是「還不知道」，不是「滿了」。
  const full = items !== null && items.length >= (LIMITS.resourcesPerProject.max as number)
  const closeForm = () => {
    setCreating(false)
    setEditing(null)
  }
  const openEdit = (resource: ProjectResourceOut, from: HTMLButtonElement) => {
    opener.current = from
    setEditing(resource)
  }
  const openDelete = (resource: ProjectResourceOut, from: HTMLButtonElement) => {
    opener.current = from
    setDeleting(resource)
  }
  // 表單／確認層收起來之後焦點回開啟它的那一顆鈕。刪掉的那一列連同它的鈕都不在了（`isConnected` 是 false）——
  // 那時退回「新增」，不然焦點會掉到 body。
  const layerOpen = formOpen || confirmOpen
  const wasOpen = useRef(false)
  useEffect(() => {
    if (!layerOpen && wasOpen.current) (opener.current?.isConnected === true ? opener.current : createButton.current)?.focus()
    wasOpen.current = layerOpen
  }, [layerOpen])

  return (
    <PanelShell
      title={formOpen ? (editing === null ? RESOURCE_FORM_COPY.createTitle : RESOURCE_FORM_COPY.editTitle) : RESOURCES_PANEL_TITLE}
      closeLabel={RESOURCES_PANEL_COPY.close}
      testId={RESOURCES_PANEL_ID}
      back={formOpen ? { label: RESOURCE_FORM_COPY.back, onBack: closeForm } : undefined}
      overlay={
        formOpen && (
          <ResourceForm
            key={editing?.id ?? 'create'}
            projectId={projectId}
            store={store}
            resource={editing ?? undefined}
            onDone={closeForm}
            onWriteDenied={() => setWriteDenied(true)}
            intentRef={formIntent}
          />
        )
      }
      // 讓位協定（`FE-X16-S14`）：沒有表單時隨時可以；表單開著時問它（送出中或改過沒存 → 不行）
      panel={{ id: RESOURCES_PANEL_ID, canYield: () => formIntent.current?.canYield() ?? true, onYield: yieldPanel }}
      onCloseRequest={closePanel}
    >
      {confirmOpen && deleting !== null && (
        <ResourceDeleteConfirm
          key={deleting.id}
          projectId={projectId}
          store={store}
          resource={deleting}
          onDone={() => setDeleting(null)}
          onWriteDenied={() => setWriteDenied(true)}
        />
      )}
      {/* 只是捲動容器與初始焦點，不是第二個 landmark（殼的 section 已經叫「專案資源」）。 */}
      <div ref={root} tabIndex={-1} data-testid="resources-panel-root" data-phase={state.phase} className="flex min-h-0 flex-1 flex-col gap-gutter overflow-y-auto outline-none">
        {closed && <p data-testid="resources-closed" role="status" {...withClass(CAPTION, 'text-ink-muted')}>{RESOURCES_PANEL_COPY.closed}</p>}
        {state.phase === 'loading' && <p data-testid="resources-loading" role="status" className="text-ink-muted">{RESOURCES_PANEL_COPY.loading}</p>}
        {state.phase === 'failed' && <EmptyState kind="failure" error={state.error} retry={retry} />}
        {items !== null && items.length === 0 && <EmptyState kind="first-empty" />}
        {items !== null && items.length > 0 && (
          <ul className="flex flex-col gap-gutter">{items.map((resource) => <Row key={resource.id} resource={resource} writer={writer} onEdit={openEdit} onDelete={openDelete} />)}</ul>
        )}
        {writer && (
          <>
            {/* `disabled` 不是權限邊界，也不是閘門：handler 自己再擋一次。
                ⚠️ **那一行沒有判準壓著**：React 不會把 click 派送給 `disabled` 的鈕，jsdom 裡量不到它
                （`25b2e97` 原本的註解說「測試可以直接對 disabled 的鈕發 click」—— 實測是錯的）。
                擋下 `POST` 的是 `disabled` 本身；這一行是它被拿掉時的第二道。 */}
            <button
              ref={createButton}
              type="button"
              data-testid="resource-create"
              disabled={full}
              aria-describedby={full ? LIMIT_NOTE_ID : undefined}
              onClick={() => {
                if (full) return
                opener.current = createButton.current
                setCreating(true)
              }}
              {...withClass(PRIMARY, 'self-start')}
            >
              {RESOURCES_PANEL_COPY.create}
            </button>
            {full && (
              <p id={LIMIT_NOTE_ID} data-testid={LIMIT_NOTE_ID} {...withClass(CAPTION, 'text-ink-muted')}>
                {RESOURCE_FORM_COPY.limitReached(LIMITS.resourcesPerProject.max as number)}
              </p>
            )}
          </>
        )}
      </div>
    </PanelShell>
  )
}
