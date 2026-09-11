'use client'

import { useCallback, useEffect, useRef, type RefObject } from 'react'
import { useWatch } from 'react-hook-form'
import type { ProfileOut } from '@/api/contract/rest'
import { FIELD, FIELD_LABEL, FORM, PRIMARY, SECONDARY } from '@/design/controls'
import { SubmitError } from '@/forms/SubmitError'
import { useForm } from '@/forms/useForm'
import { useAdoptIdentity } from '@/identity/IdentityProvider'
import { joinSkills, normalizeSkills } from './normalizeSkills'
import { ProfileFormSchema, initialValues, isDirty, type ProfileFormInput } from './profileRules'
import { saveProfile } from './saveProfile'

// 名片的編輯表單。規格 `FE-A04`〈編輯四欄，payload 白名單，悲觀更新〉、〈未儲存就關要確認；送出中不可關；重開從身分初始化〉。
//
// 機制全部是 `FE-X05` 的：`useForm`（兩層時機、guard、失敗留值）、`SubmitError`（alert 在送出鈕上方）。這裡只有名片自己的事：
// 四欄、skills 的 blur 正規化、payload 白名單（`saveProfile`）、成功 `adopt` 伺服器回的那份、關閉意圖的攔截。
//
// ⚠️ **關閉意圖不是這裡發起的** —— Escape 與殼的關閉鈕在 `PanelShell`，「取消」在這裡；三種都走同一個 `requestClose`：
// 送出中 → 無效；dirty → 問（確認層）；否則 → 回到顯示。殼要呼叫它，所以掛在 `closeIntentRef` 上給面板。
//
// ⚠️ **每次掛載從身分初始化**（`S11`）：這個元件在面板關掉時被卸載，沒有草稿可沿用。

export interface ProfileFormProps {
  profile: ProfileOut
  /** 回到顯示（成功、丟棄、乾淨的取消）。 */
  onDone: () => void
  /** 面板把殼的關閉意圖（Escape、關閉鈕）接到這裡。 */
  closeIntentRef: RefObject<(() => void) | null>
  /** dirty 時的關閉意圖 → 面板開確認層（殼的 overlay，表單變 inert）。 */
  askDiscard: () => void
}

export const PROFILE_FORM_LABELS = {
  displayName: '在世界裡顯示的名字',
  skills: '技能（用逗號分開）',
  hours: '每週可投入的小時數',
  bio: '自我介紹',
  save: '儲存',
  cancel: '取消',
}

export function ProfileForm({ profile, onDone, closeIntentRef, askDiscard }: ProfileFormProps) {
  const adopt = useAdoptIdentity()
  const { form, visibleErrors, canSubmit, busy, submitError, onSubmit } = useForm({
    schema: ProfileFormSchema,
    defaultValues: initialValues(profile),
    onSubmit: async (values) => {
      // 送出時 input 裡的 skills 字串也換成正規化形式（規格：blur／送出）—— 失敗留在表單時看到的是洗過的（審查抓到只做了 blur）。
      form.setValue('skills', joinSkills(values.skills))
      // 悲觀更新：成功才動身分，而且動的是**伺服器回的那份**（design `D2b`；`S05`／`S07`）。
      const saved = await saveProfile(values)
      adopt({ state: 'signed-in', profile: saved })
      onDone()
    },
  })
  // dirty 看的是正規化後的 payload（`S09`），每次輸入算一次 —— 便宜。
  const current = useWatch({ control: form.control })
  const dirty = isDirty(current, profile)

  const requestClose = useCallback(() => {
    if (busy) return // `S10`：送出中任何關閉意圖都無效
    if (dirty) askDiscard()
    else onDone()
  }, [busy, dirty, onDone, askDiscard])
  useEffect(() => {
    closeIntentRef.current = requestClose
    return () => {
      closeIntentRef.current = null
    }
  }, [closeIntentRef, requestClose])

  // 進編輯：焦點到第一欄（按「編輯」的那顆鈕被卸載了，不接的話焦點掉到 body —— 審查抓到的）。
  const firstField = useRef<HTMLInputElement | null>(null)
  useEffect(() => {
    firstField.current?.focus()
  }, [])
  const displayNameField = form.register('display_name')

  // skills 的 input 字串只在 blur 時洗（打字中不動游標）；驗證每次輸入都對正規化後的結果算（schema 的 transform）。
  const skillsField = form.register('skills')
  const onSkillsBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    void skillsField.onBlur(e)
    form.setValue('skills', joinSkills(normalizeSkills(e.target.value)), { shouldValidate: true })
  }

  const errorId = (name: keyof ProfileFormInput) => (visibleErrors[name] ? `profile-error-${name}` : undefined)
  const fieldError = (name: keyof ProfileFormInput) =>
    visibleErrors[name] ? (
      <p id={`profile-error-${name}`} data-testid={`profile-error-${name}`} className="text-caption text-danger">
        {visibleErrors[name]}
      </p>
    ) : null

  return (
    <form className={FORM} onSubmit={onSubmit} noValidate data-testid="profile-form" aria-busy={busy}>
      <label className={FIELD_LABEL}>
        {PROFILE_FORM_LABELS.displayName}
        <input
          className={FIELD}
          {...displayNameField}
          ref={(el) => {
            displayNameField.ref(el)
            firstField.current = el
          }}
          aria-invalid={!!visibleErrors.display_name}
          aria-describedby={errorId('display_name')}
        />
      </label>
      {fieldError('display_name')}
      <label className={FIELD_LABEL}>
        {PROFILE_FORM_LABELS.skills}
        <input className={FIELD} {...skillsField} onBlur={onSkillsBlur} aria-invalid={!!visibleErrors.skills} aria-describedby={errorId('skills')} />
      </label>
      {fieldError('skills')}
      <label className={FIELD_LABEL}>
        {PROFILE_FORM_LABELS.hours}
        <input className={FIELD} type="number" inputMode="numeric" {...form.register('hours_per_week')} aria-invalid={!!visibleErrors.hours_per_week} aria-describedby={errorId('hours_per_week')} />
      </label>
      {fieldError('hours_per_week')}
      <label className={FIELD_LABEL}>
        {PROFILE_FORM_LABELS.bio}
        <textarea className={FIELD} rows={4} {...form.register('bio')} aria-invalid={!!visibleErrors.bio} aria-describedby={errorId('bio')} />
      </label>
      {fieldError('bio')}

      <SubmitError message={submitError} />
      <div className="flex gap-gutter">
        <button type="submit" className={PRIMARY} disabled={!canSubmit}>
          {PROFILE_FORM_LABELS.save}
        </button>
        <button type="button" className={SECONDARY} onClick={requestClose} disabled={busy}>
          {PROFILE_FORM_LABELS.cancel}
        </button>
      </div>
    </form>
  )
}
