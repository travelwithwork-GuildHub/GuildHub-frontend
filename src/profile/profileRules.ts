import { z } from 'zod'
import type { ProfileOut } from '@/api/contract/rest'
import { codePointLength } from '@/api/contract/limits'
import { effectiveLimit } from '@/forms/limits'
import { joinSkills, normalizeSkills, skillKey } from './normalizeSkills'

// 名片表單的規則：schema、payload、dirty。規格 `FE-A04`〈編輯四欄，payload 白名單，悲觀更新〉、〈未儲存就關要確認⋯⋯〉。
//
// 上限一律 `effectiveLimit(field)`：後端有 check 的（`displayName`、`bio`）用 `LIMITS`；後端沒有的（技能數、每項長度、每週時數）
// 用 `FORM_LIMITS`，文案要說是**本站的**上限（`FE-X05`）。
//
// ⚠️ **驗證時機跟 `FE-X05` 一樣分兩層**：太短／必填（`too_small`）送出才說；其餘即時。
// 所以「超出數值範圍」不能用 `.min()`（那是 `too_small`，會被延後）—— 用 `refine`（`custom`，即時）。
//
// ⚠️ `hours_per_week` 的 `<input type="number">` 清空時值是 `""`，schema **先轉再驗**：`""` → `null`，不然永遠清不掉（審查抓到的）。

const displayName = effectiveLimit('displayName')
const bio = effectiveLimit('bio')
const skillCount = effectiveLimit('skillCount')
const skillLength = effectiveLimit('skillLength')
const hours = effectiveLimit('hoursPerWeek')

export const ProfileFormSchema = z.object({
  display_name: z
    .string()
    .min(displayName.min, { error: `名字要 ${displayName.min} 到 ${displayName.max} 個字。` })
    .max(displayName.max as number, { error: `名字最多 ${displayName.max} 個字。` }),
  skills: z
    .string()
    .transform(normalizeSkills)
    .pipe(
      z
        .array(z.string())
        .max(skillCount.max as number, { error: `技能最多 ${skillCount.max} 項（本站的上限）。` })
        // 每項長度：即時說，所以是 refine（custom），不是 `.max()` 放在項目上（那會把錯誤掛在 `skills.3` 這種路徑上，欄位對不回去）。
        .refine((items) => items.every((s) => codePointLength(s) <= (skillLength.max as number)), {
          error: `每個技能最多 ${skillLength.max} 個字（本站的上限）。`,
        }),
    ),
  hours_per_week: z
    .string()
    .transform((v) => (v.trim() === '' ? null : Number(v)))
    .pipe(
      z
        .number({ error: '每週時數要是數字。' })
        .int({ error: '每週時數要是整數。' })
        .nullable()
        // 範圍：即時（refine → custom）。`.min(0)` 是 too_small，會被延到送出才說。
        .refine((n) => n === null || (n >= hours.min && n <= (hours.max as number)), {
          error: `每週時數要在 ${hours.min} 到 ${hours.max} 之間（本站的上限）。`,
        }),
    ),
  bio: z
    .string()
    .max(bio.max as number, { error: `自我介紹最多 ${bio.max} 個字。` })
    .transform((v) => (v === '' ? null : v)),
})

export type ProfileFormInput = z.input<typeof ProfileFormSchema>
export type ProfileFormOutput = z.output<typeof ProfileFormSchema>

/** 送出的 body：**只有這四個鍵**（`S04`、`S07` —— 永遠沒有 `avatar_id`）。 */
export type ProfilePayload = {
  display_name: string
  skills: string[]
  hours_per_week: number | null
  bio: string | null
}

export function toPayload(values: ProfileFormOutput): ProfilePayload {
  // 白名單：逐鍵抄，不 spread —— schema 多一個欄位這裡也不會多送。
  return { display_name: values.display_name, skills: values.skills, hours_per_week: values.hours_per_week, bio: values.bio }
}

/** 表單的預填：`skills` 以「, 」接、`hours_per_week` 空值是空字串。 */
export function initialValues(profile: ProfileOut): ProfileFormInput {
  return {
    display_name: profile.display_name,
    skills: joinSkills(profile.skills),
    hours_per_week: profile.hours_per_week === null ? '' : String(profile.hours_per_week),
    bio: profile.bio ?? '',
  }
}

/**
 * 不經 schema 的正規化（dirty 用）：值可能過不了 schema（太長），但「有沒有改」跟「合不合法」是兩件事。
 * skills 比的是去重鍵（NFC＋小寫）：`TypeScript` → `typescript` 正規化後算同一個（`S09`）。
 */
function dirtyKey(input: Partial<ProfileFormInput>): string {
  // `useWatch` 回的是 DeepPartial：欄位還沒同步時可能是 undefined —— 當成空字串，不炸（審查抓到的）。
  const hours = (input.hours_per_week ?? '').trim()
  const bio = input.bio ?? ''
  return JSON.stringify({
    display_name: input.display_name ?? '',
    skills: normalizeSkills(input.skills ?? '').map(skillKey),
    hours_per_week: hours === '' ? null : Number(hours),
    bio: bio === '' ? null : bio,
  })
}

/**
 * dirty ＝ **正規化後的 payload 與初始 payload 不同**（不是 RHF 的 `isDirty`、不是原始字串差異）：
 * 只改空白、全形逗號、大小寫重複的 skills 正規化後一樣，就不算修改（`S09`）。
 */
export function isDirty(current: Partial<ProfileFormInput> | undefined, profile: ProfileOut): boolean {
  if (current === undefined) return false
  return dirtyKey(current) !== dirtyKey(initialValues(profile))
}
