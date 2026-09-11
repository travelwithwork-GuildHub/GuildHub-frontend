'use client'

import { z } from 'zod'
import { LIMITS } from '@/api/contract/limits'
import { FIELD, FIELD_LABEL, FORM, PRIMARY } from '@/design/controls'
import { SubmitError } from '@/forms/SubmitError'
import { useForm } from '@/forms/useForm'
import { RecipientGoneError } from './errors'

// 對話底部的寄信表單。規格 `FE-K01`〈寄信是悲觀更新，失敗留值〉；`FE-X05` 的機制。
//
// `body` 1–2000 code point（`LIMITS.messageBody`；Zod 4.5 的 `.max()` 數 code point，`tests/contract-limits.test.ts` 釘著）、原值原樣（不 trim）；
// 太長即時擋、空的送出才說。成功清空（刻意的 reset：內容已在對話裡）；失敗留值、alert 在送出鈕上方。404 的文案由 `describeError` 給，其餘 `toUiError`。
// 送出中**只擋第二次送出**：返回／Escape／關閉照常（請求在 provider 裡繼續，`S12`）。

const ComposeSchema = z.object({
  body: z
    .string()
    .min(LIMITS.messageBody.min, { error: '要寫點什麼才能寄。' })
    .max(LIMITS.messageBody.max as number, { error: `最多 ${LIMITS.messageBody.max} 個字。` }),
})

export const COMPOSE_LABELS = { body: '寫一封信', send: '寄出' }

export function ComposeForm({ onSend, sending }: { onSend: (body: string) => Promise<boolean>; sending: boolean }) {
  const { form, visibleErrors, canSubmit, submitError, onSubmit } = useForm({
    schema: ComposeSchema,
    defaultValues: { body: '' },
    onSubmit: async ({ body }) => {
      // `false` = provider 那層擋掉了（已有一封在送）：什麼都沒寄出去，草稿不能清（審查提醒）。
      if (await onSend(body)) form.reset({ body: '' })
    },
    describeError: (cause) => (cause instanceof RecipientGoneError ? cause.message : null),
  })
  const error = visibleErrors.body
  return (
    <form className={FORM} data-testid="compose-form" onSubmit={onSubmit} noValidate>
      <label className={FIELD_LABEL}>
        {COMPOSE_LABELS.body}
        <textarea className={FIELD} rows={3} {...form.register('body')} aria-invalid={error ? true : undefined} aria-describedby={error ? 'compose-error' : undefined} />
      </label>
      {error && (
        <p id="compose-error" data-testid="compose-error" className="text-caption text-danger">
          {error}
        </p>
      )}
      <SubmitError message={submitError} />
      <button type="submit" className={PRIMARY} disabled={sending || !canSubmit}>
        {COMPOSE_LABELS.send}
      </button>
    </form>
  )
}
