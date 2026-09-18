'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { ProjectOut } from '@/api/contract/rest'
import { closeProject, formTeam } from '@/api/operations'
import { FIELD, FIELD_LABEL, FORM, PRIMARY, SECONDARY } from '@/design/controls'
import { toUiError } from '@/errors/uiError'
import { FORM_LIMITS } from '@/forms/limits'
import { SubmitError } from '@/forms/SubmitError'
import { useForm } from '@/forms/useForm'
import { useEscapeLayer } from '@/world/interaction/escapeLayers'
import { FormTeamSchema } from './projectRules'

// owner 在案件詳情裡的動作：成軍（recruiting）、結案（active）。規格 `FE-J04`〈動作跟著狀態走，只給 owner〉、〈成軍…〉、〈密碼只在這一次詳情裡呈現…〉、〈結案要確認…〉。
//
// ⚠️ **狀態機就是 `project.status`**（design D1）：這裡沒有「成軍中／已成軍」的旗標，成功後呼叫端拿回應 `replace` 詳情，畫面從新的 `status` 推導。
// 這個元件只多兩件自己的事：表單開不開、剛設定的密碩（`revealed`）—— 密碼只活在這裡的 state（design D3）：不進 provider、不進網址、不進 storage。
//
// ⚠️ **三個副作用互相獨立**（design D6）：成功後呼叫端先同步 `replace(response)`，再各自啟動列表 `reload()` 與門 `refreshRooms()`；這裡不等它們、不看它們的結果。
//
// ⚠️ **「寄給隊員」= 草稿進剪貼簿 ＋ 開收件匣清單**（design D4）：寫入成功才交接（關看板、開清單）；失敗就不開、說出來、草稿留著可選取。隊員沒有模型，貼給誰是 owner 的動作。
//
// ⚠️ 送出中（成軍或結案）不可關：`onBusyChange` 讓呼叫端把返回／關閉／Escape 擋住（`S04`／`S07`）。

export const OWNER_ACTION_LABELS = {
  formTeam: '成軍',
  password: '房間密碼',
  passwordHint: `${FORM_LIMITS.roomPassword.min}～${FORM_LIMITS.roomPassword.max} 個字（本站的上限）。隊員要拿它進房；後端不會再給你看一次。`,
  submit: '確定成軍',
  cancel: '取消',
  revealTitle: '房間密碼（只會顯示這一次）',
  revealHint: '離開這個詳情就看不到了；忘了的話沒有地方找回來。',
  copy: '複製密碼',
  copied: '已複製密碼。',
  copyFailed: '這個瀏覽器不允許自動複製，請把上面那一串自己選起來複製。',
  sendToTeam: '寄給隊員',
  sendHint: '會把一段含密碼的訊息放進剪貼簿，然後開收件匣 —— 選一個對話貼上就寄出去了。',
  sendFailed: '這個瀏覽器不允許自動複製，收件匣沒有打開；請把下面那一段自己選起來複製。',
  close: '結案',
  closeTitle: '要結案嗎？',
  closeBody: '結案之後門會消失、座位整批清空，而且不能再成軍。',
  closeConfirm: '確定結案',
} as const

export interface OwnerActionsProps {
  project: ProjectOut
  /** 成軍／結案的回應：呼叫端用它更新詳情，並各自啟動列表與門的重取。 */
  onReplaced: (project: ProjectOut) => void
  /** 送出中（成軍或結案）：呼叫端要擋住返回／關閉／Escape。 */
  onBusyChange?: (busy: boolean) => void
}

export function OwnerActions({ project, onReplaced, onBusyChange }: OwnerActionsProps) {
  const [composing, setComposing] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [closing, setClosing] = useState(false)
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
  const anyBusy = busy || closing
  useEffect(() => {
    onBusyChange?.(anyBusy)
  }, [anyBusy, onBusyChange])

  const passwordField = useRef<HTMLInputElement | null>(null)
  useEffect(() => {
    if (composing) passwordField.current?.focus()
  }, [composing])

  const confirmClose = useCallback(async () => {
    if (closing) return
    setClosing(true)
    setCloseError(null)
    try {
      const next = await closeProject(project.id)
      setConfirming(false)
      onReplaced(next)
    } catch (error) {
      setCloseError(toUiError(error).message)
    } finally {
      setClosing(false)
    }
  }, [closing, project.id, onReplaced])
  const cancelClose = useCallback(() => {
    if (closing) return
    setConfirming(false)
    // 焦點回「結案」（開它的那顆）
    queueMicrotask(() => closeButton.current?.focus())
  }, [closing])

  const registered = form.register('password')
  return (
    <div data-testid="owner-actions-body" className="flex flex-col gap-gutter">
      {project.status === 'recruiting' && !composing && (
        <button type="button" className={PRIMARY} onClick={() => setComposing(true)}>
          {OWNER_ACTION_LABELS.formTeam}
        </button>
      )}

      {project.status === 'recruiting' && composing && (
        <form className={FORM} onSubmit={onSubmit} noValidate data-testid="form-team-form" aria-busy={busy}>
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

/** 結案的確認層（design D6）：`alertdialog`、焦點在安全的「取消」、Escape ＝ 取消；送出中兩顆都鎖、Escape 也擋。 */
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
      aria-modal="true"
      aria-labelledby="close-project-title"
      aria-describedby="close-project-body"
      aria-busy={busy}
      data-testid="close-project-confirm"
      className="bg-surface-raised border-control-edge flex flex-col gap-gutter rounded border p-gutter"
    >
      <p id="close-project-title" className="text-title">
        {OWNER_ACTION_LABELS.closeTitle}
      </p>
      <p id="close-project-body">{OWNER_ACTION_LABELS.closeBody}</p>
      <SubmitError message={error} />
      <div className="flex gap-gutter">
        <button ref={cancel} type="button" className={PRIMARY} disabled={busy} onClick={onCancel}>
          {OWNER_ACTION_LABELS.cancel}
        </button>
        <button type="button" className={SECONDARY} disabled={busy} onClick={onConfirm}>
          {OWNER_ACTION_LABELS.closeConfirm}
        </button>
      </div>
    </div>
  )
}
