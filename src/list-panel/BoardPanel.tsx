'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { ProfileOut, ProjectOut } from '@/api/contract/rest'
import { EmptyState } from '@/empty-state/EmptyState'
import { toUiError } from '@/errors/uiError'
import { TalentCard } from '@/talent/TalentCard'
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
// 列表不卸載 —— 返回時頁碼與捲動位置都還在。案件那一支仍是佔位（`FE-B02`，W6）。
//
// 「開著哪一筆詳情」「第幾頁」住在 `ListPanelProvider`，不在這裡（`FE-B09`：網址要能還原它們）。
// 這裡只留「列表手上那一筆」當詳情的載入中預覽 —— 深連結直達時沒有預覽，詳情自己去載。

const TITLES: Record<ListKind, string> = { projects: '專案看板', profiles: '人才看板' }
const LABELS = { next: '下一頁', close: '關閉' }
const DETAIL_LABELS = { back: '返回' }

const LINE = 'block overflow-hidden text-ellipsis whitespace-nowrap'

function projectLine(item: ProjectOut): ReactNode {
  return <span className={LINE}>{item.title}</span>
}
/** 人才那一支：選中的 id 在 provider，列表手上的那一筆（詳情的載入中預覽）在這裡。 */
function TalentBoard({ onClose }: { onClose: () => void }) {
  const { selected, selectProfile, page, reportPage } = useListPanel()
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
      initialPage={page}
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
          />
        )
      }
    />
  )
}

export function BoardPanel() {
  const { open, closePanel, page, reportPage } = useListPanel()
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
      initialPage={page}
      onShownPage={reportPage}
      empty={<EmptyState kind="first-empty" />}
      exhausted={<EmptyState kind="exhausted" />}
      error={({ retry, cause }) => <EmptyState kind="failure" error={toUiError(cause)} retry={retry} />}
    />
  ) : (
    <TalentBoard onClose={closePanel} />
  )
}
