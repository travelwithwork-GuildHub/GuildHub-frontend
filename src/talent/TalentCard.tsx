'use client'

import type { ProfileOut } from '@/api/contract/rest'
import { avatarLook } from '@/design/avatar'

// 人才卡。規格 `FE-B04`〈人才卡讓人一眼判斷「會不會我要的」與「有沒有時間」〉、〈卡片是控制項〉。
//
// ⚠️ **是 `<button>`，不是 `div role="button"`。** 可聚焦、Enter／Space 原生就會觸發 `click`、
// 螢幕閱讀器認得。做成 `div` 的話滑鼠使用者完全正常，鍵盤使用者 Tab 不到、Enter 沒反應 ——
// 畫面上看不出來（`S05`）。
//
// ⚠️ **`bio` 與 `updated_at` 不上卡片**（`S03`）。前者長度不定會把卡片高度弄亂；
// 後者是名片更新時間，放上來會被讀成「最近活躍」—— 那是騙人。
//
// ⚠️ **`hours_per_week: null` 不是 0**（`S02`）。「沒填」跟「零小時」是兩件事。

/** 「未提供」的節點。**機器可辨識**（`data-missing`），不是空白也不是 0。 */
export function Missing({ field }: { field: 'hours_per_week' | 'bio' }) {
  return (
    <span data-missing={field} className="text-ink-muted">
      未提供
    </span>
  )
}

export function TalentCard({ profile, onOpen }: { profile: ProfileOut; onOpen: (id: string) => void }) {
  const look = avatarLook(profile.avatar_id)
  return (
    <button
      type="button"
      data-testid="talent-card"
      data-profile-id={profile.id}
      onClick={() => onOpen(profile.id)}
      className="border-control-edge hover:bg-surface flex w-full items-start gap-3 rounded border p-3 text-left"
    >
      {/* 外觀色跟世界裡同一個 `avatar_id` 的角色一致 —— 同一份 `avatarLook`，不自己寫一份。 */}
      <span
        aria-hidden
        data-testid="talent-look"
        style={{ background: look.body }}
        className="border-control-edge mt-1 inline-block size-5 shrink-0 rounded-full border"
      />
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-ink font-medium">{profile.display_name}</span>
        <span data-testid="talent-hours" className="text-caption text-ink-muted">
          {profile.hours_per_week === null ? <Missing field="hours_per_week" /> : `每週 ${profile.hours_per_week} 小時`}
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
    </button>
  )
}
