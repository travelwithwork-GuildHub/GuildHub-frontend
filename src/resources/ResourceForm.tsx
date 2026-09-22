'use client'

import { useEffect, useMemo, useRef, type ReactNode, type RefObject } from 'react'
import type { ProjectResourceOut, ProjectResourceUpdate, ResourceType } from '@/api/contract/rest'
import { createResource, updateResource } from '@/api/operations'
import { CAPTION, FIELD, FIELD_LABEL, FORM, PRIMARY, SECONDARY, withClass } from '@/design/controls'
import { SubmitError } from '@/forms/SubmitError'
import { useForm } from '@/forms/useForm'
import { useEscapeLayer } from '@/world/interaction/escapeLayers'
import { RESOURCE_FORM_COPY, RESOURCE_TYPE_LABELS, RESOURCE_TYPE_OPTIONS, ResourceWriteRejected, resourceFormSchema, type ResourceFormValues } from './resourceRules'
import type { ResourcesStore } from './resourcesStore'

// 新增與修改資源的表單。規格 `FE-J14`〈新增⋯⋯只送原字串〉、〈修改：只送改了的欄位，位置不變〉、
//〈結案與權限失敗〉、〈鍵盤⋯⋯Escape 每次只關最上層〉；
// 機制全部是 `FE-X05` 的（`useForm` 的兩層時機與連按 guard、`SubmitError` 的 alert 在送出鈕上方）。
//
// **一個元件做兩件事**，不是兩份表單：驗證規則、可見範圍說明、Escape 層、讓位協定逐條相同，
// 兩份的話規格改一次要改兩處，而第二處遲早會漏（`resource` 給了就是修改，沒給就是新增）。
//
// ⚠️ **不樂觀更新**（design D1）：`id`、`created_at`、順序都由伺服器決定，201／200 回來才動清單。
// ⚠️ **修改只送改過的鍵**（design D8）：`ProjectResourceUpdate` 三個欄位都是 `.optional()`，
//    整份表單丟進去會連沒改的一起送，而那會蓋掉別人在這期間改的欄位（`S17`）。沒有任何鍵改變就不送（`S18`）。
// ⚠️ **Escape 自己註冊一層**（`S21`）：表單在面板的 `overlay` 裡，所以它是上面那一層 ——
//    一下 Escape 關表單、面板還開著、**世界命令鎖仍由面板持有**（鎖在 `PanelHost`，不在這裡）。
// ⚠️ **失敗一律先走 `store.writeFailed()`**（design D2）：403／409 不只有「結案」一個意思，要確認一次專案狀態。
//    確認出來是 `closed` 就什麼都不用顯示 —— 面板會換成「已結案」，這個表單跟著被卸載。

/** 表單掛給面板的同步判斷：能不能讓位（`FE-X16-S14`：送出中或有未儲存的修改都不行，而且不問）。 */
export interface ResourceFormIntent {
  canYield: () => boolean
}

export interface ResourceFormProps {
  projectId: string
  store: ResourcesStore
  /** 給了就是**修改**這一筆（初始值帶入、只送改過的鍵）；沒給就是新增。 */
  resource?: ProjectResourceOut
  /** 成功、取消、Escape、以及「沒改任何東西就送出」：回到清單。 */
  onDone: () => void
  /** 伺服器說沒有權限（而且專案仍不是 closed）：呼叫端要收掉寫入控制項（〈寫入控制項只給寫入者〉）。 */
  onWriteDenied: () => void
  intentRef: RefObject<ResourceFormIntent | null>
}

/**
 * 跟初始值**不同**的那些鍵（design D8）。全都沒變回 `null` —— 那是「不送」，不是「送一個空 body」。
 *
 * `type` 的 `as` 由 schema 擔保：`resourceFormSchema()` 擋掉不在 `RESOURCE_TYPE_OPTIONS` 裡的值，
 * 所以走到這裡的 `values.type` 必定是那五種之一（沒有那一段的話這個 cast 就是謊話）。
 */
function changedFields(values: ResourceFormValues, initial: ResourceFormValues): ProjectResourceUpdate | null {
  const patch: ProjectResourceUpdate = {}
  if (values.label !== initial.label) patch.label = values.label
  if (values.type !== initial.type) patch.type = values.type as ResourceType
  if (values.url !== initial.url) patch.url = values.url
  return Object.keys(patch).length === 0 ? null : patch
}

const VISIBILITY_ID = 'resource-form-visibility'

export function ResourceForm({ projectId, store, resource, onDone, onWriteDenied, intentRef }: ResourceFormProps) {
  const root = useRef<HTMLFormElement>(null)
  // 上限在**渲染時**讀（`resourceFormSchema()` 自己去拿 `LIMITS`）—— 模組層的常數證不了「數字不是寫死的」。
  const schema = useMemo(() => resourceFormSchema(), [])
  // 修改的初始值是那一筆**目前的值**；差集也拿它當基準（`useForm` 的 `defaultValues` 只吃第一次）。
  const initial = useMemo<ResourceFormValues>(
    () => (resource === undefined ? { label: '', type: '', url: '' } : { label: resource.label, type: resource.type, url: resource.url }),
    [resource],
  )
  const { form, visibleErrors, canSubmit, busy, submitError, onSubmit } = useForm({
    schema,
    defaultValues: initial,
    onSubmit: async (values) => {
      try {
        // **原字串**：不 trim、不送 `safeHref` 的正規化結果（後端的網址 check 不分大小寫，前端不正規化）
        if (resource === undefined) {
          store.created(projectId, await createResource(projectId, { label: values.label, type: values.type as ResourceType, url: values.url }))
          onDone()
          return
        }
        const patch = changedFields(values, initial)
        if (patch === null) {
          onDone() // `S18`：沒改任何東西 —— 直接結束修改，一個請求都不送
          return
        }
        store.updated(projectId, await updateResource(projectId, resource.id, patch))
        onDone()
      } catch (cause) {
        const outcome = await store.writeFailed(projectId, cause)
        if (outcome === 'closed') return // 面板換成「已結案」，表單被卸載 —— 沒有東西要顯示
        // **重讀的時機是封閉列舉**（規格〈讀取的時機是封閉的〉第 4 點）：只有新增的 409（別處已經新增到上限，`S08`）
        // 與修改的 404（這一筆已經被刪掉，`S19`）。在這裡多加一個「順便也重讀」就是在列舉外自己加時機。
        if (outcome.kind === (resource === undefined ? 'conflict' : 'not-found')) store.read(projectId)
        if (outcome.kind === 'permission-denied') onWriteDenied()
        throw new ResourceWriteRejected(outcome.message)
      }
    },
    describeError: (cause) => (cause instanceof ResourceWriteRejected ? cause.message : null),
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
          {resource === undefined ? RESOURCE_FORM_COPY.submit : RESOURCE_FORM_COPY.save}
        </button>
        <button type="button" {...SECONDARY} onClick={onDone} disabled={busy}>
          {RESOURCE_FORM_COPY.cancel}
        </button>
      </div>
    </form>
  )
}
