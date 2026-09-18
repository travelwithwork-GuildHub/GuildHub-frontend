import { z } from 'zod'
import type { ProjectCreate } from '@/api/contract/rest'
import { codePointLength } from '@/api/contract/limits'
import { effectiveLimit } from '@/forms/limits'
import { normalizeSkills } from '@/profile/normalizeSkills'

// 發案表單的規則：schema、payload、dirty。規格 `FE-J01`〈上限由前端守，數字有出處，時機照全站規則〉、〈送出的是白名單 payload⋯⋯〉。
//
// 四個上限全部是 `FORM_LIMITS` 的（後端對這個端點什麼都不驗，`FE-O08` 的 `create-unvalidated`），文案說是**本站的**上限。
// 長度單位是 code point（`FE-O06`）：`.max()` 數的是 UTF-16，所以上限用 `refine`＋`codePointLength`。
//
// 驗證時機照 `FE-X05`：必填（`too_small`）送出才說；其餘（`custom`、`invalid_type`）即時。座位數的範圍也是 `refine`（即時）——
// `.min()` 是 `too_small`、會被延到送出才說，而規格要它即時。技能欄沿用名片的 `normalizeSkills`（design D4）。

const title = effectiveLimit('projectTitle')
const body = effectiveLimit('projectBody')
const skillCount = effectiveLimit('skillCount')
const skillLength = effectiveLimit('skillLength')
const seat = effectiveLimit('seatCount')

const within = (max: number) => (s: string) => codePointLength(s) <= max

export const CreateProjectSchema = z.object({
  title: z
    .string()
    .transform((v) => v.trim())
    .pipe(z.string().min(title.min, { error: '標題不能空白。' }).refine(within(title.max as number), { error: `標題最多 ${title.max} 個字（本站的上限）。` })),
  body: z
    .string()
    .transform((v) => v.trim())
    .pipe(z.string().min(body.min, { error: '內容不能空白。' }).refine(within(body.max as number), { error: `內容最多 ${body.max} 個字（本站的上限）。` })),
  skills: z
    .string()
    .transform(normalizeSkills)
    .pipe(
      z
        .array(z.string())
        .refine((items) => items.length <= (skillCount.max as number), { error: `技能最多 ${skillCount.max} 項（本站的上限）。` })
        .refine((items) => items.every(within(skillLength.max as number)), { error: `每個技能最多 ${skillLength.max} 個字（本站的上限）。` }),
    ),
  // 空白是「必填空白」（`too_small`，送出才說）—— 把 4 刪掉準備打 6 的那一瞬間不該被罵（Gemini 審查抓到的）；
  // 第一段 `.min(1)` 沒過就不會進第二段，不會有 `Number('')` 變 0 的漏洞。
  seat_count: z
    .string()
    .transform((v) => v.trim())
    .pipe(
      z
        .string()
        .min(1, { error: '座位數不能空白。' })
        .transform(Number)
        .pipe(
          z
            .number({ error: '座位數要是整數。' })
            .int({ error: '座位數要是整數。' })
            .refine((n) => n >= seat.min && n <= (seat.max as number), { error: `座位數要在 ${seat.min} 到 ${seat.max} 之間（本站的上限）。` }),
        ),
    ),
})

export type CreateProjectInput = z.input<typeof CreateProjectSchema>

// ── 成軍（`FE-J04`）：房間密碼 4～64 個 code point，**不 trim**（密碼的空白是密碼的一部分）。
// 下限也用 code point（`.min()` 數的是 UTF-16：三個 emoji 會被當成 6 個字放行 —— 審查抓到）；但 issue 的 `code` 仍是 `too_small`，
// `useForm` 才會把它延到送出才說（打到第 3 個字不該被罵）。上限是 `refine`（`custom`，即時）—— 跟上面同一套時機。
const roomPassword = effectiveLimit('roomPassword')
export const FormTeamSchema = z.object({
  password: z
    .string()
    .check((ctx) => {
      if (codePointLength(ctx.value) < roomPassword.min) {
        ctx.issues.push({ code: 'too_small', minimum: roomPassword.min, origin: 'string', inclusive: true, input: ctx.value, message: `房間密碼至少 ${roomPassword.min} 個字（本站的上限）。` })
      }
    })
    .refine(within(roomPassword.max as number), { error: `房間密碼最多 ${roomPassword.max} 個字（本站的上限）。` }),
})
export type FormTeamInput = z.input<typeof FormTeamSchema>
export type CreateProjectOutput = z.output<typeof CreateProjectSchema>

export const INITIAL: CreateProjectInput = { title: '', body: '', skills: '', seat_count: '4' }

/** 送出的 body：**只有這四個鍵**（`S05`）。逐鍵抄，不 spread。 */
export function toPayload(values: CreateProjectOutput): ProjectCreate {
  return { title: values.title, body: values.body, needed_skills: values.skills, seat_count: values.seat_count }
}

/** 任一欄跟初始值不同就算有輸入（座位數留 4 不算）。`useWatch` 回的是 DeepPartial：還沒同步的欄位當初始值。 */
export function isDirty(current: Partial<CreateProjectInput> | undefined): boolean {
  if (current === undefined) return false
  return (Object.keys(INITIAL) as (keyof CreateProjectInput)[]).some((k) => (current[k] ?? INITIAL[k]) !== INITIAL[k])
}
