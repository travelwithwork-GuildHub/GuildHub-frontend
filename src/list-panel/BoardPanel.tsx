'use client'

import { useEffect, useRef, useState } from 'react'
import type { ProfileOut, ProjectOut } from '@/api/contract/rest'
import { PRIMARY } from '@/design/controls'
import { EmptyState } from '@/empty-state/EmptyState'
import { toUiError } from '@/errors/uiError'
import { useIdentity } from '@/identity/IdentityProvider'
import { DiscardConfirm } from '@/profile/DiscardConfirm'
import { CreateProjectForm } from '@/projects/CreateProjectForm'
import { ProjectCard } from '@/projects/ProjectCard'
import { ProjectDetail } from '@/projects/ProjectDetail'
import { TalentCard } from '@/talent/TalentCard'
import { SendMessageButton } from '@/inbox/SendMessageButton'
import { TalentDetail } from '@/talent/TalentDetail'
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
// 人才那一支是真的卡片與詳情（`FE-B04`）：卡片開詳情，詳情蓋在列表上（`overlay`），
// 列表不卸載 —— 返回時頁碼與捲動位置都還在。案件那一支同一種形狀（`FE-B02` 卡片、`FE-B03` 詳情）：卡片開詳情、詳情蓋在列表上；
// 加「發案」（`FE-J01`）：只給已登入的人、表單住在同一個 overlay 插槽、成功後回第 0 頁重取。
// **overlay 一次只放一個**：選中的詳情優先於表單（詳情開著時列表連工具列都 `inert`，按不到「發案」）。
//
// 「開著哪一筆詳情」「第幾頁」住在 `ListPanelProvider`，不在這裡（`FE-B09`：網址要能還原它們）。
// 這裡只留「列表手上那一筆」當詳情的載入中預覽 —— 深連結直達時沒有預覽，詳情自己去載。

const TITLES: Record<ListKind, string> = { projects: '專案看板', profiles: '人才看板' }
const LABELS = { next: '下一頁', close: '關閉' }
const DETAIL_LABELS = { back: '返回' }
const CREATE_LABEL = '發案'
const MESSAGE_OWNER_LABEL = '私訊發案者'

/** 人才那一支：選中的 id 在 provider，列表手上的那一筆（詳情的載入中預覽）在這裡。 */
function TalentBoard({ onClose }: { onClose: () => void }) {
  const { selected, selectProfile, page, reportPage, closePanel } = useListPanel()
  // 只記最後一張點開的卡：詳情的 id 對得上才當預覽，對不上（深連結、上一頁／下一頁）就沒有預覽。
  const [preview, setPreview] = useState<ProfileOut | null>(null)
  // 詳情關閉時焦點回到開它的那張卡（`FE-X06-S12`）。`ListPanel` 自己會把焦點放回列表
  //（給沒有處理焦點的呼叫端用），這裡是父層的 effect、跑得比它晚，所以卡片贏。
  const lastOpenedRef = useRef<string | null>(null)
  useEffect(() => {
    if (selected !== null) {
      lastOpenedRef.current = selected
      return
    }
    const id = lastOpenedRef.current
    if (id === null) return
    lastOpenedRef.current = null
    document.querySelector<HTMLElement>(`[data-testid="talent-card"][data-profile-id="${id}"]`)?.focus()
  }, [selected])
  return (
    <ListPanel
      kind="profiles"
      title={TITLES.profiles}
      labels={LABELS}
      renderItem={(item) => (
        <TalentCard
          profile={item}
          onOpen={() => {
            setPreview(item)
            selectProfile(item.id)
          }}
        />
      )}
      onClose={onClose}
      page={page}
      onShownPage={reportPage}
      empty={<EmptyState kind="first-empty" />}
      exhausted={<EmptyState kind="exhausted" />}
      error={({ retry, cause }) => <EmptyState kind="failure" error={toUiError(cause)} retry={retry} />}
      overlay={
        selected === null ? undefined : (
          <TalentDetail
            id={selected}
            preview={preview?.id === selected ? preview : undefined}
            labels={DETAIL_LABELS}
            onBack={() => selectProfile(null)}
            // 「寄信給他」（`FE-K01`）：關掉這個面板、開收件匣直接進對話。只在已登入、對方不是我、有收件匣 provider 時出現。
            actions={<SendMessageButton to={selected} onBeforeOpen={closePanel} />}
          />
        )
      }
    />
  )
}

/**
 * 案件那一支：列表＋「發案」（`FE-J01`）。入口只在 `signed-in` 時渲染（`S01`；訪客拿到的是 `FE-X04` 的權限阻擋，
 * 身分還沒問完也不放）。表單住在 overlay（列表 `inert`、不卸載）；確認層**疊在仍掛載的表單上**（design D5）——
 * 換掉 overlay 會卸載表單、丟掉還沒送出的值。
 *
 * ⚠️ dirty 與送出中的判斷在表單的 `requestClose`；這裡的 `onClose` 只做顯式分支。**不得寫成 `closeIntentRef.current?.() ?? closePanel()`**：
 * `requestClose()` 回 `void`，`??` 右邊照樣執行，dirty 確認與送出中不可關全部被繞過（codex 審查抓到的；`S07` 對殼的關閉鈕有判準）。
 */
function ProjectBoard() {
  const { closePanel, page, reportPage, selected, selectProject } = useListPanel()
  const identity = useIdentity()
  const signedIn = identity.state === 'signed-in'
  const [composing, setComposing] = useState(false)
  const [confirming, setConfirming] = useState(false)
  // 詳情的載入中預覽：列表手上的那一筆（深連結沒有）。跟 `TalentBoard` 同一招。
  const [preview, setPreview] = useState<ProjectOut | null>(null)
  // 詳情關閉時焦點回到開它的那張卡（`FE-X06-S12`）；父層的 effect 跑得比 `ListPanel` 的晚，所以卡片贏。
  const lastOpenedRef = useRef<string | null>(null)
  useEffect(() => {
    if (selected !== null) {
      lastOpenedRef.current = selected
      return
    }
    const id = lastOpenedRef.current
    if (id === null) return
    lastOpenedRef.current = null
    document.querySelector<HTMLElement>(`[data-testid="project-card"][data-project-id="${id}"]`)?.focus()
  }, [selected])
  const closeIntentRef = useRef<(() => void) | null>(null)
  const focusBeforeConfirm = useRef<HTMLElement | null>(null)
  // 表單開著時身分不再是 signed-in（登出、問不到）：入口沒了，表單跟著收（推導，不另設狀態）。
  const formOpen = composing && signedIn

  const onClose = () => {
    const requestClose = closeIntentRef.current
    if (requestClose) requestClose()
    else closePanel()
  }
  const closeForm = () => {
    setConfirming(false)
    setComposing(false)
  }
  const askDiscard = () => {
    focusBeforeConfirm.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setConfirming(true)
  }
  const keepEditing = () => {
    setConfirming(false)
    const back = focusBeforeConfirm.current
    focusBeforeConfirm.current = null
    // 表單的 `inert` 拿掉之後再還焦點（同一個 commit 之後）。
    queueMicrotask(() => back?.focus())
  }

  return (
    <ListPanel
      kind="projects"
      title={TITLES.projects}
      labels={LABELS}
      renderItem={(item, { fetchedAt }) => (
        <ProjectCard
          project={item}
          now={fetchedAt}
          onOpen={() => {
            setPreview(item)
            selectProject(item.id)
          }}
        />
      )}
      onClose={onClose}
      page={page}
      onShownPage={reportPage}
      toolbar={
        signedIn ? (
          <button type="button" className={PRIMARY} onClick={() => setComposing(true)}>
            {CREATE_LABEL}
          </button>
        ) : undefined
      }
      empty={<EmptyState kind="first-empty" />}
      exhausted={<EmptyState kind="exhausted" />}
      error={({ retry, cause }) => <EmptyState kind="failure" error={toUiError(cause)} retry={retry} />}
      overlay={
        selected !== null ? (
          <ProjectDetail
            id={selected}
            preview={preview?.id === selected ? preview : undefined}
            labels={DETAIL_LABELS}
            onBack={() => selectProject(null)}
            // 「私訊發案者」（`FE-K01` 的同一條路）：關看板、開收件匣直接進對話。`ProjectDetail` 只在已登入的非 owner 時渲染它。
            actions={(project) => <SendMessageButton to={project.owner_id} label={MESSAGE_OWNER_LABEL} onBeforeOpen={closePanel} />}
          />
        ) : formOpen
          ? ({ reload }) => (
              <div className="flex min-h-0 flex-col gap-gutter overflow-y-auto">
                <div inert={confirming}>
                  <CreateProjectForm
                    // 成功：關表單、列表回第 0 頁重取（不插入回應，design D2）；焦點由 `ListPanel` 還給列表。
                    onCreated={() => {
                      closeForm()
                      reload()
                    }}
                    onDismiss={closeForm}
                    closeIntentRef={closeIntentRef}
                    askDiscard={askDiscard}
                  />
                </div>
                {confirming && <DiscardConfirm onDiscard={closeForm} onKeep={keepEditing} />}
              </div>
            )
          : undefined
      }
    />
  )
}

export function BoardPanel() {
  const { open, closePanel } = useListPanel()
  if (open === null) return null
  // 分兩支寫而不是一個 `renderItem: (item: A | B)`：
  // 型別讓「案件面板拿到人才資料」在 typecheck 就紅。
  return open === 'projects' ? <ProjectBoard /> : <TalentBoard onClose={closePanel} />
}
