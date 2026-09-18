'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { ProjectOut } from '@/api/contract/rest'
import { formTeam } from '@/api/operations'
import { FIELD, FIELD_LABEL, FORM, PRIMARY, SECONDARY } from '@/design/controls'
import { FORM_LIMITS } from '@/forms/limits'
import { SubmitError } from '@/forms/SubmitError'
import { useForm } from '@/forms/useForm'
import { FormTeamSchema } from './projectRules'

// owner 在案件詳情裡的動作：成軍（recruiting）。規格 `FE-J04`〈動作跟著狀態走，只給 owner〉、〈成軍…〉。
// 結案（〈結案要確認…〉）在 `--close` 片、密碼的一次性呈現（〈密碼只在這一次詳情裡呈現…〉）在 `--reveal` 片。
//
// ⚠️ **狀態機就是 `project.status`**（design D1）：沒有「成軍中／已成軍」旗標，成功後呼叫端拿回應 `replace` 詳情，畫面從新的 `status` 推導。
// ⚠️ **三個副作用互相獨立**（design D6）：呼叫端先同步 `replace(response)`，再各自啟動列表 `reload()` 與門 `refreshRooms()`；這裡不等、不看結果。
// ⚠️ 送出中不可關：`onBusyChange` 讓呼叫端把返回／關閉／Escape 擋住（`S04`／`S07`）。

export const OWNER_ACTION_LABELS = {
  formTeam: '成軍',
  password: '房間密碼',
  passwordHint: `${FORM_LIMITS.roomPassword.min}～${FORM_LIMITS.roomPassword.max} 個字（本站的上限）。隊員要拿它進房；後端不會再給你看一次。`,
  submit: '確定成軍',
  cancel: '取消',
} as const

export interface OwnerActionsProps {
  project: ProjectOut
  /** 成軍／結案的回應：呼叫端用它更新詳情，並各自啟動列表與門的重取。 */
  onReplaced: (project: ProjectOut) => void
  /** 送出中（成軍或結案）：呼叫端要擋住返回／關閉／Escape。**在送出的同一個 tick 同步呼叫**（不等 effect），呼叫端要用 ref 收（design D6；審查抓到 effect 有一格空窗）。 */
  onBusyChange?: (busy: boolean) => void
}

export function OwnerActions({ project, onReplaced, onBusyChange }: OwnerActionsProps) {
  const [composing, setComposing] = useState(false)

  const { form, visibleErrors, busy, submitError, onSubmit } = useForm({
    schema: FormTeamSchema,
    defaultValues: { password: '' },
    onSubmit: async ({ password }) => {
      const next = await formTeam(project.id, { password })
      // 關表單，再交回應給呼叫端 —— 它會同步 replace，畫面從 active 推導出「結案」。密碼的一次性呈現在 `--reveal` 片
      setComposing(false)
      onReplaced(next)
    },
  })
  // busy 在 submit **事件的當下**就通知（`useForm` 的 guard 也是這一刻上鎖；resolver 是非同步的，等 handler 才通知會晚幾個 microtask）。
  // 驗證沒過 `onSubmit` 也會 resolve → 解除。**用深度計數**：連按的第二下被 `useForm` 擋掉、立刻 resolve，不能把第一下的 busy 解掉（實測抓到）。
  const busyDepth = useRef(0)
  const enterBusy = useCallback(() => {
    busyDepth.current += 1
    if (busyDepth.current === 1) onBusyChange?.(true)
  }, [onBusyChange])
  const leaveBusy = useCallback(() => {
    busyDepth.current -= 1
    if (busyDepth.current === 0) onBusyChange?.(false)
  }, [onBusyChange])
  const submitGuarded = async (event: React.FormEvent<HTMLFormElement>) => {
    enterBusy()
    try {
      await onSubmit(event)
    } finally {
      leaveBusy()
    }
  }

  const passwordField = useRef<HTMLInputElement | null>(null)
  useEffect(() => {
    if (composing) passwordField.current?.focus()
  }, [composing])

  const registered = form.register('password')
  return (
    <div data-testid="owner-actions-body" className="flex flex-col gap-gutter">
      {project.status === 'recruiting' && !composing && (
        <button type="button" className={PRIMARY} onClick={() => setComposing(true)}>
          {OWNER_ACTION_LABELS.formTeam}
        </button>
      )}

      {project.status === 'recruiting' && composing && (
        <form className={FORM} onSubmit={(e) => void submitGuarded(e)} noValidate data-testid="form-team-form" aria-busy={busy}>
          <label className={FIELD_LABEL}>
            {OWNER_ACTION_LABELS.password}
            <input
              className={FIELD}
              type="password"
              autoComplete="new-password"
              {...registered}
              ref={(el) => {
                registered.ref(el)
                passwordField.current = el
              }}
              aria-invalid={!!visibleErrors.password}
              aria-describedby={visibleErrors.password ? 'form-team-error-password' : 'form-team-hint-password'}
            />
          </label>
          {visibleErrors.password ? (
            <p id="form-team-error-password" data-testid="form-team-error-password" className="text-caption text-danger">
              {visibleErrors.password}
            </p>
          ) : (
            <p id="form-team-hint-password" className="text-caption">
              {OWNER_ACTION_LABELS.passwordHint}
            </p>
          )}
          <SubmitError message={submitError} />
          <div className="flex gap-gutter">
            <button type="submit" className={PRIMARY} disabled={busy}>
              {OWNER_ACTION_LABELS.submit}
            </button>
            <button type="button" className={SECONDARY} disabled={busy} onClick={() => setComposing(false)}>
              {OWNER_ACTION_LABELS.cancel}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
