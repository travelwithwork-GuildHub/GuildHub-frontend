'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import type { ProjectOut } from '@/api/contract/rest'
import { SECONDARY } from '@/design/controls'
import { EmptyState } from '@/empty-state/EmptyState'
import { toUiError } from '@/errors/uiError'
import { useIdentity } from '@/identity/IdentityProvider'
import { Missing } from '@/talent/Missing'
import { useEscapeLayer } from '@/world/interaction/escapeLayers'
import { OwnerCard } from './OwnerCard'
import { PROJECT_STATUS_LABEL, daysLeft } from './projectStatus'
import { useProjectDetail } from './useProjectDetail'

// 案件詳情。規格 `FE-B03`〈詳情在同一個面板裡，案子本體一律來自 `GET /api/projects/{id}`〉、〈動作列只放做得到的〉。
//
// 蓋在列表上（`ListPanel` 的 `overlay` 插槽），列表不卸載 —— 返回時頁碼與捲動位置才還在。形狀跟 `TalentDetail` 同一種：
// 載入中／失敗看 `phase`（`data-phase`、`aria-busy`），預覽不得冒充成功（`S04`）：**預覽只出標題**（讓人知道是哪一筆在載／載不到），
// 狀態、座位、技能、內容、剩幾天、發案者全部等 `ready`（審查抓到「狀態／座位／技能在 error 時還畫著」會讓失敗看起來像半個成功）；失敗用 `FE-X04` 的 `EmptyState`（401 權限阻擋、
// 404 是 `FE-X03` 的 `not-found` 語彙、其餘載入失敗可重試）；Escape 先關它、面板留著；焦點進詳情。
//
// ⚠️ **發案者名片是獨立的載入單元**（`OwnerCard`，design D2）：案子本體 `ready` 之後才掛它（沒有 `owner_id` 就不打），它的失敗不碰這裡的 `phase`。
//
// ⚠️ **動作列只放做得到的**（design D3）：
// - `actions(project)`：呼叫端決定（`BoardPanel` 放「私訊發案者」= `SendMessageButton`）；**只給已登入且不是 owner 的人** —— 這裡就擋，不依賴呼叫端的元件自己藏
//   （訪客拿到 200 的話 `!isOwner` 是 true，審查抓到的）。
// - owner（`owner_id` 等於自己的 `id`，推導、不另設狀態）：「這是你發的案子」的標示＋ `ownerActions` 插槽（`FE-J04` 把成軍／結案接進來）。
//   **這一份不渲染成軍／結案／應徵／收藏／檢舉** —— 沒有 handler 的控制項對鍵盤與螢幕閱讀器使用者是騙人的（`S12`）。

export interface ProjectDetailProps {
  id: string
  /** 列表手上的那一筆，當載入中的預覽。深連結（`FE-B09`）沒有它。 */
  preview: ProjectOut | undefined
  onBack: () => void
  labels: { back: string }
  /** 案子上的動作（例如「私訊發案者」）：由呼叫端決定，這裡只給位置；拿到載入完成的案子。 */
  actions?: (project: ProjectOut) => ReactNode
  /** 只在 owner 時渲染的插槽（`FE-J04` 用）。 */
  ownerActions?: ReactNode
}

export const OWNER_MARK = '這是你發的案子'

export function ProjectDetail({ id, preview, onBack, labels, actions, ownerActions }: ProjectDetailProps) {
  const detail = useProjectDetail(id, preview)
  const identity = useIdentity()
  const root = useRef<HTMLElement>(null)
  // 詳情是蓋在面板上的那一層：Escape 先關它、面板留著（`FE-X06-S01`、`FE-B04-S14`）。帶自己的元素：跟面板同一個 commit 掛載時也在上面。
  useEscapeLayer(onBack, root)
  useEffect(() => {
    root.current?.focus()
  }, [])
  const project = detail.project
  // `ready` 把三個一起收窄：之後的分支裡 `project`、`fetchedAt` 都是有值的
  const fetchedAt = detail.fetchedAt
  const ready = detail.phase === 'ready' && project !== undefined && fetchedAt !== null
  const signedIn = identity.state === 'signed-in' ? identity.profile.id : null
  const isOwner = ready && signedIn !== null && signedIn === project.owner_id
  const isVisitor = ready && signedIn !== null && signedIn !== project.owner_id
  const back = (
    <button type="button" className={SECONDARY} onClick={onBack}>
      {labels.back}
    </button>
  )

  return (
    <article
      ref={root}
      tabIndex={-1}
      data-testid="project-detail"
      data-project-id={id}
      data-phase={detail.phase}
      aria-busy={detail.phase === 'loading'}
      className="bg-surface-raised flex h-full flex-col gap-gutter overflow-y-auto"
    >
      <header className="flex items-center gap-3">
        {back}
        {project !== undefined && (
          <h3 data-testid="project-detail-title" className="text-title min-w-0 break-words">
            {project.title}
          </h3>
        )}
      </header>

      {detail.phase === 'error' && <EmptyState kind="failure" error={toUiError(detail.error)} retry={detail.retry} />}

      {ready && (
        <p className="text-caption text-ink-muted flex flex-wrap items-center gap-x-3 gap-y-1">
          <span data-testid="project-status">{PROJECT_STATUS_LABEL[project.status]}</span>
          {/* 時鐘是回應到達那一刻（`fetchedAt`），不是這一格 render 的時刻 */}
          <time data-testid="project-expires" dateTime={project.expires_at}>
            {expiry(project.expires_at, fetchedAt)}
          </time>
          <span data-testid="project-seats">{project.seat_count} 個座位</span>
        </p>
      )}

      {ready &&
        (project.needed_skills.length > 0 ? (
          <span className="flex flex-wrap gap-1">
            {project.needed_skills.map((skill) => (
              <span key={skill} data-testid="project-skill" className="bg-surface text-caption whitespace-nowrap rounded px-1.5 py-0.5">
                {skill}
              </span>
            ))}
          </span>
        ) : (
          <span className="text-caption">
            <Missing field="needed_skills" label="未指定" />
          </span>
        ))}

      {/* 完整內容只在 ready 之後（`S03`：畫的是回應，不是列表那一筆） */}
      {ready && (
        <p data-testid="project-body" className="max-w-prose leading-relaxed whitespace-pre-wrap break-words">
          {project.body}
        </p>
      )}

      {ready && <OwnerCard ownerId={project.owner_id} />}

      {isOwner && (
        <div data-testid="owner-actions" className="flex flex-col gap-2">
          <p data-testid="owner-mark" className="text-caption text-ink-muted">
            {OWNER_MARK}
          </p>
          {ownerActions}
        </div>
      )}
      {isVisitor && actions?.(project)}
    </article>
  )
}

/** 「剩 N 天（絕對日期）」／「已到期（絕對日期）」：同一條 `daysLeft` 規則，加本地化的日期讓人知道是哪一天。 */
function expiry(expiresAt: string, now: number): string {
  const days = daysLeft(expiresAt, now)
  const date = new Date(expiresAt).toLocaleDateString('zh-TW')
  return `${days <= 0 ? '已到期' : `剩 ${days} 天`}（${date}）`
}
