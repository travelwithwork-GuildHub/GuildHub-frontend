'use client'

import type { ReactNode } from 'react'
import type { ProfileOut } from '@/api/contract/rest'
import { avatarLook } from '@/design/avatar'
import { Missing } from './Missing'

// 一張名片的**純呈現**：頭像色、名字、四欄的 `<dl>`。規格 `FE-A04`〈顯示我的名片，用同一個呈現元件〉。
//
// 從 `TalentDetail` 抽出來的（design `D2` 的修正）：`TalentDetail` 會打 `GET /api/profiles/{id}`、有 Escape 層、返回鈕、焦點 ——
// 那些是「別人的名片」那條路的事。我的名片同步可得、不另外請求，只要這一塊。
//
// ⚠️ **不知道「是不是我」。** 編輯鈕在面板層（`ProfilePanel`），不在這裡 —— 在這裡加 `editable` 的話，別人的名片也長得出來（`S03`）。
//
// `updated_at` 是**名片更新時間**，標籤叫「名片更新於」—— 不叫「最後上線」「最近活躍」。

export interface TalentFactsProps {
  profile: ProfileOut
  /** 名字那一列最前面的東西（`TalentDetail` 放返回鈕）。 */
  leading?: ReactNode
}

export function TalentFacts({ profile, leading }: TalentFactsProps) {
  const look = avatarLook(profile.avatar_id)
  return (
    <div data-testid="talent-facts" data-profile-id={profile.id} className="flex flex-col gap-gutter">
      <header className="flex items-center gap-3">
        {leading}
        <span
          aria-hidden
          data-testid="talent-look"
          style={{ background: look.body }}
          className="border-control-edge inline-block size-6 rounded-full border"
        />
        <h3 className="text-title">{profile.display_name}</h3>
      </header>
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
    </div>
  )
}
