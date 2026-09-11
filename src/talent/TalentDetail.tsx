'use client'

import type { ProfileOut } from '@/api/contract/rest'
import { SECONDARY } from '@/design/controls'
import { EmptyState } from '@/empty-state/EmptyState'
import { toUiError } from '@/errors/uiError'
import { useEscapeLayer } from '@/world/interaction/escapeLayers'
import { useEffect, useRef } from 'react'
import { TalentFacts } from './TalentFacts'
import { useProfileDetail } from './useProfileDetail'

// 人才詳情。規格 `FE-B04`〈詳情在同一個面板裡，內容一律來自 `GET /api/profiles/{id}`〉。
//
// 蓋在列表上（`ListPanel` 的 `overlay` 插槽），列表不卸載 —— 返回時頁碼與捲動位置才還在。
//
// ⚠️ **載入中／失敗看 `phase`，不看有沒有資料。** `loading` 時畫的是列表那一筆（預覽），
// 但 `data-phase="loading"` 與 `aria-busy` 都在；`error` 時失敗節點在預覽旁邊。
// 預覽**不得**冒充成功取得的詳情（`S07`／`S08`）。
//
// ⚠️ 失敗直接用 `FE-X04` 的 `EmptyState` —— 不另寫一句「載入失敗」，那是第二份語彙。
//
// 名片本身的呈現（頭像色、名字、四欄）是 `TalentFacts`（`FE-A04` 抽出去的，我的名片也用它）；這裡是「別人的名片」那條路：
// 打 API、載入中／失敗、返回、Escape 層、焦點。

export interface TalentDetailProps {
  id: string
  /** 列表手上的那一筆，當載入中的預覽。深連結（`FE-B09`）沒有它。 */
  preview: ProfileOut | undefined
  onBack: () => void
  labels: { back: string }
}

export function TalentDetail({ id, preview, onBack, labels }: TalentDetailProps) {
  const detail = useProfileDetail(id, preview)
  // 焦點進詳情（`FE-X06-S11`）：開它的那張卡在 `inert` 的列表區裡 —— 焦點留在那裡的話，
  // Tab 的 keydown 不會派送（inert 的元素收不到事件），面板的 focus trap 接不到，焦點就跑出去了。
  // 真瀏覽器的 e2e 抓到的。
  const root = useRef<HTMLElement>(null)
  // 詳情是蓋在面板上的那一層：Escape 先關它、面板留著（`FE-X06-S01`、`FE-B04-S14`）。
  // 帶自己的元素：跟面板同一個 commit 掛載時（深連結直達）也還是在面板上面。
  useEscapeLayer(onBack, root)
  useEffect(() => {
    root.current?.focus()
  }, [])
  const profile = detail.profile
  const back = (
    <button type="button" className={SECONDARY} onClick={onBack}>
      {labels.back}
    </button>
  )

  return (
    <article
      ref={root}
      tabIndex={-1}
      data-testid="talent-detail"
      data-profile-id={id}
      data-phase={detail.phase}
      aria-busy={detail.phase === 'loading'}
      className="bg-surface-raised flex h-full flex-col gap-gutter overflow-y-auto"
    >
      {/* 還沒有任何資料（深連結、還在載入或失敗）：只有返回鈕那一列。 */}
      {profile === undefined && <header className="flex items-center gap-3">{back}</header>}

      {detail.phase === 'error' && (
        <EmptyState kind="failure" error={toUiError(detail.error)} retry={detail.retry} />
      )}

      {profile !== undefined && <TalentFacts profile={profile} leading={back} />}
    </article>
  )
}
