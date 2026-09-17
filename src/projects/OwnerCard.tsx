'use client'

import { useId } from 'react'
import { avatarLook } from '@/design/avatar'
import { EmptyState } from '@/empty-state/EmptyState'
import { toUiError } from '@/errors/uiError'
import { useProfileDetail } from '@/talent/useProfileDetail'

// 發案者名片：案件詳情裡「誰發的」那一塊。規格 `FE-B03`〈發案者名片是獨立的載入單元〉。
//
// ⚠️ **獨立的載入單元**（design D2）：自己的 `data-phase`、自己的失敗、自己的重試 —— 它載不到不能把整份詳情畫成失敗。
// 載入沿用 `useProfileDetail`（**直接重用**，不複製）；呈現只要名字、外觀色、技能 —— `bio`、時數、更新時間是人才詳情的事，
// 這裡要回答的是「誰發的」（`S08`）。

export function OwnerCard({ ownerId }: { ownerId: string }) {
  const detail = useProfileDetail(ownerId, undefined)
  const profile = detail.profile
  // 每個實例自己的標題 id：同一頁兩張名片（之後 `FE-J03`）不能共用一個 id，`aria-labelledby` 會指錯
  const headingId = useId()
  return (
    <section
      data-testid="owner-card"
      data-profile-id={ownerId}
      data-phase={detail.phase}
      aria-busy={detail.phase === 'loading'}
      aria-labelledby={headingId}
      className="flex flex-col gap-2"
    >
      <h4 id={headingId} className="text-caption text-ink-muted">
        發案者
      </h4>
      {detail.phase === 'error' && <EmptyState kind="failure" error={toUiError(detail.error)} retry={detail.retry} />}
      {profile !== undefined && (
        <div className="flex items-start gap-3">
          <span
            aria-hidden
            data-testid="talent-look"
            style={{ background: avatarLook(profile.avatar_id).body }}
            className="border-control-edge mt-1 inline-block size-5 shrink-0 rounded-full border"
          />
          <span className="flex min-w-0 flex-1 flex-col gap-1">
            <span data-testid="owner-name" className="text-ink font-medium">
              {profile.display_name}
            </span>
            {profile.skills.length > 0 && (
              <span className="flex flex-wrap gap-1">
                {profile.skills.map((skill) => (
                  <span key={skill} data-testid="talent-skill" className="bg-surface text-caption rounded px-1.5 py-0.5">
                    {skill}
                  </span>
                ))}
              </span>
            )}
          </span>
        </div>
      )}
    </section>
  )
}
