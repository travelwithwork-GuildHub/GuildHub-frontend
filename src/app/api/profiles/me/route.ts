import { z } from 'zod'
import { UNAUTHENTICATED } from '@/server/http/errors'
import { handle } from '@/server/http/handle'
import { updateProfile } from '@/server/profiles'

// `PATCH /api/profiles/me`。規格 `FE-O03`〈我的名片：讀與部分更新〉—— 照真後端 `ProfileUpdate`：
// 五個欄位皆選填、給 `null` 也算有給（Pydantic 的 `exclude_unset`）、未知欄位靜默忽略（Zod 預設就 strip）、
// **沒有長度**（`display_name` 21 字、`bio` 301 字由資料庫的 check 擋 → 500）。
const ProfileUpdateBody = z.object({
  display_name: z.string().nullable().optional(),
  avatar_id: z.number().int().nullable().optional(),
  skills: z.array(z.string()).nullable().optional(),
  hours_per_week: z.number().int().nullable().optional(),
  bio: z.string().nullable().optional(),
})

export const PATCH = handle({ auth: 'required', body: ProfileUpdateBody }, async ({ me, body }) => {
  const row = await updateProfile(me as string, body)
  if (row === null) throw UNAUTHENTICATED()
  return row
})
