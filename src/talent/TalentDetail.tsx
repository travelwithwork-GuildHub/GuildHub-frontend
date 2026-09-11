'use client'

import type { ProfileOut } from '@/api/contract/rest'
import { avatarLook } from '@/design/avatar'
import { SECONDARY } from '@/design/controls'
import { EmptyState } from '@/empty-state/EmptyState'
import { toUiError } from '@/errors/uiError'
import { Missing } from './Missing'
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
// `updated_at` 是**名片更新時間**，標籤叫「名片更新於」—— 不叫「最後上線」「最近活躍」。

export interface TalentDetailProps {
  id: string
  /** 列表手上的那一筆，當載入中的預覽。深連結（`FE-B09`）沒有它。 */
  preview: ProfileOut | undefined
  onBack: () => void
  labels: { back: string }
}

export function TalentDetail({ id, preview, onBack, labels }: TalentDetailProps) {
  const detail = useProfileDetail(id, preview)
  const profile = detail.profile
  const look = profile === undefined ? undefined : avatarLook(profile.avatar_id)

  return (
    <article
      data-testid="talent-detail"
      data-profile-id={id}
      data-phase={detail.phase}
      aria-busy={detail.phase === 'loading'}
      className="bg-surface-raised flex h-full flex-col gap-gutter overflow-y-auto"
    >
      <header className="flex items-center gap-3">
        <button type="button" className={SECONDARY} onClick={onBack}>
          {labels.back}
        </button>
        {look !== undefined && (
          <span
            aria-hidden
            data-testid="talent-look"
            style={{ background: look.body }}
            className="border-control-edge inline-block size-6 rounded-full border"
          />
        )}
        {profile !== undefined && <h3 className="text-title">{profile.display_name}</h3>}
      </header>

      {detail.phase === 'error' && (
        <EmptyState kind="failure" error={toUiError(detail.error)} retry={detail.retry} />
      )}

      {profile !== undefined && (
        <dl className="flex flex-col gap-2">
          <dt className="text-caption text-ink-muted">技能</dt>
          <dd className="flex flex-wrap gap-1">
            {profile.skills.map((skill) => (
              <span key={skill} data-testid="talent-skill" className="bg-surface text-caption rounded px-1.5 py-0.5">
                {skill}
              </span>
            ))}
          </dd>
          <dt className="text-caption text-ink-muted">每週可投入</dt>
          <dd data-testid="talent-hours">
            {profile.hours_per_week === null ? <Missing field="hours_per_week" /> : `${profile.hours_per_week} 小時`}
          </dd>
          <dt className="text-caption text-ink-muted">自我介紹</dt>
          <dd data-testid="talent-bio" className="whitespace-pre-wrap">
            {profile.bio === null ? <Missing field="bio" /> : profile.bio}
          </dd>
          <dt className="text-caption text-ink-muted">名片更新於</dt>
          <dd>
            <time dateTime={profile.updated_at}>{new Date(profile.updated_at).toLocaleString('zh-TW')}</time>
          </dd>
        </dl>
      )}
    </article>
  )
}
