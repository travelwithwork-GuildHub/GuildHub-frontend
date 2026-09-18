'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import type { ProjectOut } from '@/api/contract/rest'
import { closeProject, formTeam } from '@/api/operations'
import { FIELD, FIELD_LABEL, FORM, PRIMARY, SECONDARY } from '@/design/controls'
import { toUiError } from '@/errors/uiError'
import { FORM_LIMITS } from '@/forms/limits'
import { SubmitError } from '@/forms/SubmitError'
import { useForm } from '@/forms/useForm'
import { useEscapeLayer } from '@/world/interaction/escapeLayers'
import { FormTeamSchema } from './projectRules'

// owner 在案件詳情裡的動作：成軍（recruiting）、結案（active）。規格 `FE-J04`〈動作跟著狀態走，只給 owner〉、〈成軍…〉、〈結案要確認…〉。
// 密碼的一次性呈現（〈密碼只在這一次詳情裡呈現…〉）在 `--reveal` 片。
//
// ⚠️ **狀態機就是 `project.status`**（design D1）：沒有「成軍中／已成軍」旗標，成功後呼叫端拿回應 `replace` 詳情，畫面從新的 `status` 推導。
// ⚠️ **三個副作用互相獨立**（design D6）：呼叫端先同步 `replace(response)`，再各自啟動列表 `reload()` 與門 `refreshRooms()`；這裡不等、不看結果。
// ⚠️ 送出中（成軍或結案）不可關：`onBusyChange` 讓呼叫端把返回／關閉／Escape 擋住（`S04`／`S07`）。

export const OWNER_ACTION_LABELS = {
  formTeam: '成軍',
  password: '房間密碼',
  passwordHint: `${FORM_LIMITS.roomPassword.min}～${FORM_LIMITS.roomPassword.max} 個字（本站的上限）。隊員要拿它進房；後端不會再給你看一次。`,
  submit: '確定成軍',
  cancel: '取消',
  close: '結案',
  closeTitle: '要結案嗎？',
  closeBody: '結案之後門會消失、座位整批清空，而且不能再成軍。',
  closeConfirm: '確定結案',
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
  const [confirming, setConfirming] = useState(false)
  const [closing, setClosing] = useState(false)
  // 連按的 guard 用 ref：同一批次裡的第二下 click 看到的 `closing` 是舊的 closure（`useForm` 的 `inFlightRef` 同一個理由）
  const closingRef = useRef(false)
  const [closeError, setCloseError] = useState<string | null>(null)
  const closeButton = useRef<HTMLButtonElement>(null)

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

  const confirmClose = useCallback(async () => {
    if (closingRef.current) return
    closingRef.current = true
    enterBusy()
    setClosing(true)
    setCloseError(null)
    try {
      const next = await closeProject(project.id)
      setConfirming(false)
      onReplaced(next)
    } catch (error) {
      setCloseError(toUiError(error).message)
    } finally {
      closingRef.current = false
      setClosing(false)
      leaveBusy()
    }
  }, [project.id, onReplaced, enterBusy, leaveBusy])
  const cancelClose = useCallback(() => {
    if (closingRef.current) return
    // 同步提交這一格，「結案」那顆才在 DOM 上可以接焦點（microtask 會跑在 re-render 之前 —— 審查抓到）
    flushSync(() => setConfirming(false))
    closeButton.current?.focus()
  }, [])

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

      {project.status === 'active' && !confirming && (
        <button ref={closeButton} type="button" className={SECONDARY} onClick={() => setConfirming(true)}>
          {OWNER_ACTION_LABELS.close}
        </button>
      )}
      {project.status === 'active' && confirming && (
        <CloseConfirm busy={closing} error={closeError} onConfirm={() => void confirmClose()} onCancel={cancelClose} />
      )}
    </div>
  )
}

/**
 * 結案的確認層（design D6）：`alertdialog`、焦點在安全的「取消」、Escape ＝ 取消；送出中兩顆都擋（`aria-disabled`：`disabled` 會把焦點丟回 body）、Escape 也擋。
 * **不是 modal**（沒有 `aria-modal`、不圈焦點）：它住在詳情裡，詳情的返回／面板關閉在送出中由呼叫端擋。
 */
function CloseConfirm({ busy, error, onConfirm, onCancel }: { busy: boolean; error: string | null; onConfirm: () => void; onCancel: () => void }) {
  const root = useRef<HTMLDivElement>(null)
  const cancel = useRef<HTMLButtonElement>(null)
  useEscapeLayer(onCancel, root)
  useEffect(() => {
    cancel.current?.focus()
  }, [])
  return (
    <div
      ref={root}
      role="alertdialog"
      aria-labelledby="close-project-title"
      aria-describedby="close-project-body"
      aria-busy={busy}
      data-testid="close-project-confirm"
      className="bg-surface-raised border-line flex flex-col gap-gutter rounded border p-gutter"
    >
      <p id="close-project-title" className="text-title">
        {OWNER_ACTION_LABELS.closeTitle}
      </p>
      <p id="close-project-body">{OWNER_ACTION_LABELS.closeBody}</p>
      <SubmitError message={error} />
      <div className="flex gap-gutter">
        <button ref={cancel} type="button" className={PRIMARY} aria-disabled={busy} onClick={onCancel}>
          {OWNER_ACTION_LABELS.cancel}
        </button>
        <button type="button" className={SECONDARY} aria-disabled={busy} onClick={onConfirm}>
          {OWNER_ACTION_LABELS.closeConfirm}
        </button>
      </div>
    </div>
  )
}
