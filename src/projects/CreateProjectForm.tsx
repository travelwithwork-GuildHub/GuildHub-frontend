'use client'

import { useCallback, useEffect, useRef, type RefObject } from 'react'
import { useWatch } from 'react-hook-form'
import type { ProjectOut } from '@/api/contract/rest'
import { createProject } from '@/api/operations'
import { FIELD, FIELD_LABEL, FORM, PRIMARY, SECONDARY } from '@/design/controls'
import { FORM_LIMITS } from '@/forms/limits'
import { SubmitError } from '@/forms/SubmitError'
import { useForm } from '@/forms/useForm'
import { joinSkills, normalizeSkills } from '@/profile/normalizeSkills'
import { CreateProjectSchema, INITIAL, isDirty, toPayload, type CreateProjectInput } from './projectRules'

// 發案表單。規格 `FE-J01`。機制全部是 `FE-X05` 的（`useForm`、`SubmitError`），形狀跟 `ProfileForm` 一樣。
// ⚠️ **恰好四個欄位**（`S02`）：後端的 `ProjectCreate` 只有這四個；Open Role、期程、預算、截止日連 disabled 的都不放。
// ⚠️ **成功之後不把回應交給列表插入** —— 呼叫端讓列表回第 0 頁重取（design D2）；`onCreated` 只是「關掉我」的訊號。
// ⚠️ dirty 與送出中的判斷**留在這裡**（design D5）：殼的 Escape／關閉鈕與自己的取消鈕都走 `requestClose`。

export interface CreateProjectFormProps {
  onCreated: (created: ProjectOut) => void
  /** 沒有建就關（乾淨的取消、丟棄）。 */
  onDismiss: () => void
  /** 面板把殼的關閉意圖（Escape、關閉鈕）接到這裡。 */
  closeIntentRef: RefObject<(() => void) | null>
  /** dirty 時的關閉意圖 → 面板開確認層。 */
  askDiscard: () => void
}

export const CREATE_PROJECT_LABELS = {
  title: '標題',
  body: '內容',
  skills: '需要的技能',
  skillsHint: `用逗號分開，最多 ${FORM_LIMITS.skillCount.max} 項、每項 ${FORM_LIMITS.skillLength.max} 個字以內（本站的上限）。`,
  seats: '座位數',
  seatsHint: `${FORM_LIMITS.seatCount.min} 到 ${FORM_LIMITS.seatCount.max} 個（房間有幾個工位就最多幾個）。`,
  submit: '送出',
  cancel: '取消',
}

export function CreateProjectForm({ onCreated, onDismiss, closeIntentRef, askDiscard }: CreateProjectFormProps) {
  const { form, visibleErrors, canSubmit, busy, submitError, onSubmit } = useForm({
    schema: CreateProjectSchema,
    defaultValues: INITIAL,
    onSubmit: async (values) => {
      form.setValue('skills', joinSkills(values.skills))
      onCreated(await createProject(toPayload(values)))
    },
  })
  const dirty = isDirty(useWatch({ control: form.control }))

  const requestClose = useCallback(() => {
    if (busy) return // 送出中任何關閉意圖都無效（`S07`）
    if (dirty) askDiscard()
    else onDismiss()
  }, [busy, dirty, onDismiss, askDiscard])
  useEffect(() => {
    closeIntentRef.current = requestClose
    return () => {
      closeIntentRef.current = null
    }
  }, [closeIntentRef, requestClose])

  // 進表單：焦點到第一欄（按「發案」的那顆鈕在 inert 的列表裡，不接的話焦點掉到 body）。
  const firstField = useRef<HTMLInputElement | null>(null)
  useEffect(() => {
    firstField.current?.focus()
  }, [])
  const titleField = form.register('title')
  const skillsField = form.register('skills')
  const onSkillsBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    void skillsField.onBlur(e)
    form.setValue('skills', joinSkills(normalizeSkills(e.target.value)), { shouldValidate: true })
  }

  // 錯誤在、就指錯誤；不在、就指說明（有說明的欄位）。一個表單只有 `SubmitError` 那一個 alert（`FE-X05`）。
  const describedBy = (name: keyof CreateProjectInput, hint?: string) => (visibleErrors[name] ? `project-error-${name}` : hint)
  const fieldError = (name: keyof CreateProjectInput) =>
    visibleErrors[name] ? (
      <p id={`project-error-${name}`} data-testid={`project-error-${name}`} className="text-caption text-danger">
        {visibleErrors[name]}
      </p>
    ) : null

  return (
    <form className={FORM} onSubmit={onSubmit} noValidate data-testid="create-project-form" aria-busy={busy}>
      <label className={FIELD_LABEL}>
        {CREATE_PROJECT_LABELS.title}
        <input
          className={FIELD}
          {...titleField}
          ref={(el) => {
            titleField.ref(el)
            firstField.current = el
          }}
          aria-invalid={!!visibleErrors.title}
          aria-describedby={describedBy('title')}
        />
      </label>
      {fieldError('title')}
      <label className={FIELD_LABEL}>
        {CREATE_PROJECT_LABELS.body}
        <textarea className={FIELD} rows={5} {...form.register('body')} aria-invalid={!!visibleErrors.body} aria-describedby={describedBy('body')} />
      </label>
      {fieldError('body')}
      <label className={FIELD_LABEL}>
        {CREATE_PROJECT_LABELS.skills}
        <input className={FIELD} {...skillsField} onBlur={onSkillsBlur} aria-invalid={!!visibleErrors.skills} aria-describedby={describedBy('skills', 'project-hint-skills')} />
      </label>
      {fieldError('skills') ?? <p id="project-hint-skills" className="text-caption">{CREATE_PROJECT_LABELS.skillsHint}</p>}
      <label className={FIELD_LABEL}>
        {CREATE_PROJECT_LABELS.seats}
        <input
          className={FIELD}
          type="number"
          inputMode="numeric"
          min={FORM_LIMITS.seatCount.min}
          max={FORM_LIMITS.seatCount.max}
          step={1}
          {...form.register('seat_count')}
          aria-invalid={!!visibleErrors.seat_count}
          aria-describedby={describedBy('seat_count', 'project-hint-seats')}
        />
      </label>
      {fieldError('seat_count') ?? <p id="project-hint-seats" className="text-caption">{CREATE_PROJECT_LABELS.seatsHint}</p>}

      <SubmitError message={submitError} />
      <div className="flex gap-gutter">
        <button type="submit" className={PRIMARY} disabled={!canSubmit}>
          {CREATE_PROJECT_LABELS.submit}
        </button>
        <button type="button" className={SECONDARY} onClick={requestClose} disabled={busy}>
          {CREATE_PROJECT_LABELS.cancel}
        </button>
      </div>
    </form>
  )
}
