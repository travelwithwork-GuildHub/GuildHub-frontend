'use client'

import { useEffect, useMemo, useRef, type ReactNode, type RefObject } from 'react'
import type { ResourceType } from '@/api/contract/rest'
import { createResource } from '@/api/operations'
import { CAPTION, FIELD, FIELD_LABEL, FORM, PRIMARY, SECONDARY, withClass } from '@/design/controls'
import { SubmitError } from '@/forms/SubmitError'
import { useForm } from '@/forms/useForm'
import { useEscapeLayer } from '@/world/interaction/escapeLayers'
import { RESOURCE_FORM_COPY, RESOURCE_TYPE_LABELS, RESOURCE_TYPE_OPTIONS, resourceFormSchema, type ResourceFormValues } from './resourceRules'
import type { ResourcesStore } from './resourcesStore'

// 新增資源的表單。規格 `FE-J14`〈新增⋯⋯只送原字串〉、〈鍵盤⋯⋯Escape 每次只關最上層〉；
// 機制全部是 `FE-X05` 的（`useForm` 的兩層時機與連按 guard、`SubmitError` 的 alert 在送出鈕上方）。
//
// ⚠️ **不樂觀更新**（design D1）：`id`、`created_at`、順序都由伺服器決定，201 回來才動清單。
// ⚠️ **Escape 自己註冊一層**（`S21`）：表單在面板的 `overlay` 裡，所以它是上面那一層 ——
//    一下 Escape 關表單、面板還開著、**世界命令鎖仍由面板持有**（鎖在 `PanelHost`，不在這裡）。
// ⚠️ **送出失敗只走 `FE-X05` 的預設呈現**；403／409 要先確認一次專案狀態（D2）—— 那條路徑跟修改、刪除共用，在後半 `--edit-delete`。

/** 表單掛給面板的同步判斷：能不能讓位（`FE-X16-S14`：送出中或有未儲存的修改都不行，而且不問）。 */
export interface ResourceFormIntent {
  canYield: () => boolean
}

export interface ResourceFormProps {
  projectId: string
  store: ResourcesStore
  /** 成功、取消、Escape：回到清單。 */
  onDone: () => void
  intentRef: RefObject<ResourceFormIntent | null>
}

const VISIBILITY_ID = 'resource-form-visibility'

export function ResourceForm({ projectId, store, onDone, intentRef }: ResourceFormProps) {
  const root = useRef<HTMLFormElement>(null)
  // 上限在**渲染時**讀（`resourceFormSchema()` 自己去拿 `LIMITS`）—— 模組層的常數證不了「數字不是寫死的」。
  const schema = useMemo(() => resourceFormSchema(), [])
  const { form, visibleErrors, canSubmit, busy, submitError, onSubmit } = useForm({
    schema,
    defaultValues: { label: '', type: '', url: '' } satisfies ResourceFormValues,
    onSubmit: async (values) => {
      // **原字串**：不 trim、不送 `safeHref` 的正規化結果（後端的網址 check 不分大小寫，前端不正規化）
      store.created(projectId, await createResource(projectId, { label: values.label, type: values.type as ResourceType, url: values.url }))
      onDone()
    },
  })

  useEscapeLayer(onDone, root)
  // 開表單：焦點進第一欄（按「新增」的那顆鈕被 `overlay` 蓋住了，不接的話焦點留在被 `inert` 的那一層）
  const firstField = useRef<HTMLInputElement | null>(null)
  useEffect(() => {
    firstField.current?.focus()
  }, [])
  // 讓位協定（`FE-X16-S14`）：送出中或改過而沒存 → 不讓位，而且不開確認層（讓位不替使用者按下那個問題）
  const dirty = form.formState.isDirty
  useEffect(() => {
    intentRef.current = { canYield: () => !busy && !dirty }
    return () => {
      intentRef.current = null
    }
  }, [intentRef, busy, dirty])

  /** 一欄：說明文字、控制項、以及它自己的錯誤（`aria-invalid` ＋ `aria-describedby`，不各自 `role="alert"`）。 */
  const field = (name: keyof ResourceFormValues, control: (a: { 'aria-invalid': boolean; 'aria-describedby': string | undefined }) => ReactNode, describedBy?: string) => {
    const message = visibleErrors[name]
    const ids = [describedBy, message ? `resource-error-${name}` : undefined].filter(Boolean).join(' ')
    return (
      <>
        <label className={FIELD_LABEL}>
          {RESOURCE_FORM_COPY[name]}
          {control({ 'aria-invalid': !!message, 'aria-describedby': ids === '' ? undefined : ids })}
        </label>
        {message && (
          <p id={`resource-error-${name}`} data-testid={`resource-error-${name}`} {...withClass(CAPTION, 'text-danger')}>
            {message}
          </p>
        )}
      </>
    )
  }
  const labelField = form.register('label')

  return (
    <form ref={root} className={FORM} data-testid="resource-form" onSubmit={onSubmit} noValidate aria-busy={busy}>
      {field('label', (a) => (
        <input
          {...FIELD}
          {...labelField}
          ref={(el) => {
            labelField.ref(el)
            firstField.current = el
          }}
          {...a}
        />
      ))}
      {field('type', (a) => (
        <select {...FIELD} {...form.register('type')} {...a}>
          <option value="">{RESOURCE_FORM_COPY.typeUnset}</option>
          {RESOURCE_TYPE_OPTIONS.map((type) => (
            <option key={type} value={type}>
              {RESOURCE_TYPE_LABELS[type]}
            </option>
          ))}
        </select>
      ))}
      {/* 可見範圍的說明一直掛在網址欄的 `aria-describedby` 上（`S15`）；有錯誤時兩個都指 —— 說明不因為出錯就不見 */}
      {field('url', (a) => <input {...FIELD} {...form.register('url')} {...a} />, VISIBILITY_ID)}
      <p id={VISIBILITY_ID} data-testid={VISIBILITY_ID} {...withClass(CAPTION, 'text-ink-muted')}>
        {RESOURCE_FORM_COPY.visibility}
      </p>
      <SubmitError message={submitError} />
      <div className="flex gap-gutter">
        <button type="submit" {...PRIMARY} disabled={!canSubmit}>
          {RESOURCE_FORM_COPY.submit}
        </button>
        <button type="button" {...SECONDARY} onClick={onDone} disabled={busy}>
          {RESOURCE_FORM_COPY.cancel}
        </button>
      </div>
    </form>
  )
}
