'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import type { ProjectOut } from '@/api/contract/rest'
import { closeProject, formTeam } from '@/api/operations'
import { CAPTION, FIELD, FIELD_LABEL, FORM, PRIMARY, SECONDARY, TITLE, withClass } from '@/design/controls'
import { toUiError } from '@/errors/uiError'
import { FORM_LIMITS } from '@/forms/limits'
import { SubmitError } from '@/forms/SubmitError'
import { PanelDialog } from '@/panel/PanelDialog'
import { useForm } from '@/forms/useForm'
import { browserClipboard, type ClipboardPort } from '@/identity/clipboard'
import { useEscapeLayer } from '@/world/interaction/escapeLayers'
import { FormTeamSchema } from './projectRules'

// owner 在案件詳情裡的動作：成軍（recruiting）、結案（active）、剛成軍的密碼一次性呈現。
// 規格 `FE-J04`〈動作跟著狀態走，只給 owner〉、〈成軍…〉、〈密碼只在這一次詳情裡呈現…〉、〈結案要確認…〉。
//
// ⚠️ **狀態機就是 `project.status`**（design D1）：沒有「成軍中／已成軍」旗標，成功後呼叫端拿回應 `replace` 詳情，畫面從新的 `status` 推導。
// 這裡只多兩件自己的事：表單開不開、剛設定的密碼（`revealed`）。
// ⚠️ **密碼只活在這個元件的 state**（design D3）：不進 provider、不進網址、不進 storage、不送 logging；詳情關掉它就沒了（後端不回、前端不留）。
// ⚠️ **三個副作用互相獨立**（design D6）：呼叫端先同步 `replace(response)`，再各自啟動列表 `reload()` 與門 `refreshRooms()`；這裡不等、不看結果。
// ⚠️ **「寄給隊員」＝草稿進剪貼簿＋開收件匣清單**（design D4）：寫入**成功才**交接（`onSendToTeam`：關看板、開清單）；失敗就不開、說出來、草稿留著可選取。
// 隊員沒有模型，貼給誰是 owner 的動作 —— 草稿不進收件匣的狀態。
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

/** 「寄給隊員」放進剪貼簿的那段話（規格逐字）。 */
export const passwordDraft = (project: ProjectOut, password: string) => `「${project.title}」的房間密碼：${password}`

export interface OwnerActionsProps {
  project: ProjectOut
  /** 成軍／結案的回應：呼叫端用它更新詳情，並各自啟動列表與門的重取。 */
  onReplaced: (project: ProjectOut) => void
  /** 「寄給隊員」的草稿已進剪貼簿：呼叫端關看板、開收件匣**清單**。沒給（沒有收件匣）就不長那顆按鈕 —— 跟 `SendMessageButton` 同一條規則。 */
  onSendToTeam?: () => void
  /** 送出中（成軍或結案）：呼叫端要擋住返回／關閉／Escape。**在送出的同一個 tick 同步呼叫**（不等 effect），呼叫端要用 ref 收（design D6；審查抓到 effect 有一格空窗）。 */
  onBusyChange?: (busy: boolean) => void
  /** 判準注入「會成功／會失敗」的剪貼簿（`FE-A06` design D4）；真的由 e2e 讀回來比對（`S09`）。 */
  clipboard?: ClipboardPort
}

export function OwnerActions({ project, onReplaced, onSendToTeam, onBusyChange, clipboard = browserClipboard() }: OwnerActionsProps) {
  const [composing, setComposing] = useState(false)
  const [revealed, setRevealed] = useState<string | null>(null)
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const [sendFailed, setSendFailed] = useState(false)
  // 剪貼簿一次只寫一件：兩顆按鈕共用一把同步的 guard（ref：同一批次的第二下看到的 state 是舊的）。
  // 沒有它的話「複製」與「寄給隊員」可以交錯 —— 慢的那次晚回來覆蓋快的那次的結果，甚至舊的成功把看板關掉（兩個審查者都抓到）
  const writing = useRef(false)
  const [writingNow, setWritingNow] = useState(false)
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
      // 先記密碼（只在這裡）、關表單，再交回應給呼叫端 —— 它會同步 replace，畫面從 active 推導出密碼區塊與「結案」
      setRevealed(password)
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

  // ⚠️ 兩個都要在 `await` **之後**才改狀態：放在前面的話寫入失敗畫面照樣說「已複製」／照樣開收件匣（`S05`／`S06` 要擋的假實作）
  const copy = useCallback(async () => {
    if (revealed === null || writing.current) return
    writing.current = true
    setWritingNow(true)
    // 再按一次先收掉上一次的結果：寫入還沒回報之前不能還掛著「已複製」
    setCopyState('idle')
    try {
      await clipboard.write(revealed)
      setCopyState('copied')
    } catch {
      setCopyState('failed')
    } finally {
      writing.current = false
      setWritingNow(false)
    }
  }, [clipboard, revealed])
  const sendToTeam = useCallback(async () => {
    if (revealed === null || writing.current) return
    writing.current = true
    setWritingNow(true)
    setSendFailed(false)
    try {
      await clipboard.write(passwordDraft(project, revealed))
      onSendToTeam?.()
    } catch {
      setSendFailed(true)
    } finally {
      writing.current = false
      setWritingNow(false)
    }
  }, [clipboard, project, revealed, onSendToTeam])

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
        <button type="button" {...PRIMARY} onClick={() => setComposing(true)}>
          {OWNER_ACTION_LABELS.formTeam}
        </button>
      )}

      {project.status === 'recruiting' && composing && (
        <form className={FORM} onSubmit={(e) => void submitGuarded(e)} noValidate data-testid="form-team-form" aria-busy={busy}>
          <label className={FIELD_LABEL}>
            {OWNER_ACTION_LABELS.password}
            <input
              {...FIELD}
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
            <p id="form-team-error-password" data-testid="form-team-error-password" {...withClass(CAPTION, 'text-danger')}>
              {visibleErrors.password}
            </p>
          ) : (
            <p id="form-team-hint-password" {...CAPTION}>
              {OWNER_ACTION_LABELS.passwordHint}
            </p>
          )}
          <SubmitError message={submitError} />
          <div className="flex gap-gutter">
            <button type="submit" {...PRIMARY} disabled={busy}>
              {OWNER_ACTION_LABELS.submit}
            </button>
            <button type="button" {...SECONDARY} disabled={busy} onClick={() => setComposing(false)}>
              {OWNER_ACTION_LABELS.cancel}
            </button>
          </div>
        </form>
      )}

      {/* 剛成軍：密碼只在這一次呈現 —— `status` 已是 active 才有意義（回應還沒 replace 進來前不畫） */}
      {project.status === 'active' && revealed !== null && (
        <section aria-labelledby="room-password-reveal-heading" className="flex flex-col gap-2">
          <h4 id="room-password-reveal-heading" {...withClass(CAPTION, 'text-ink-muted')}>
            {OWNER_ACTION_LABELS.revealTitle}
          </h4>
          <p>
            <code data-testid="room-password-reveal" className="select-all">
              {revealed}
            </code>
          </p>
          <p {...withClass(CAPTION, 'text-ink-muted')}>{OWNER_ACTION_LABELS.revealHint}</p>
          <div className="flex flex-wrap gap-gutter">
            <button type="button" {...SECONDARY} aria-disabled={writingNow} onClick={() => void copy()}>
              {OWNER_ACTION_LABELS.copy}
            </button>
            {onSendToTeam && (
              <button type="button" {...SECONDARY} aria-disabled={writingNow} onClick={() => void sendToTeam()}>
                {OWNER_ACTION_LABELS.sendToTeam}
              </button>
            )}
          </div>
          {onSendToTeam && <p {...CAPTION}>{OWNER_ACTION_LABELS.sendHint}</p>}
          {copyState === 'copied' && <p role="status">{OWNER_ACTION_LABELS.copied}</p>}
          {copyState === 'failed' && (
            <p role="alert" className="text-danger">
              {OWNER_ACTION_LABELS.copyFailed}
            </p>
          )}
          {sendFailed && (
            <div role="alert" className="text-danger flex flex-col gap-1">
              <p>{OWNER_ACTION_LABELS.sendFailed}</p>
              <code data-testid="room-password-draft" className="select-all">
                {passwordDraft(project, revealed)}
              </code>
            </div>
          )}
        </section>
      )}

      {project.status === 'active' && !confirming && (
        <button ref={closeButton} type="button" {...SECONDARY} onClick={() => setConfirming(true)}>
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
 * 走 `PanelDialog`（`FE-X16-S06`）：遮罩蓋住面板內容區、詳情與標題列 inert —— 它現在**就是** modal（`aria-modal="true"`；審查抓到語意跟行為不一致），焦點由殼的 focus trap 圈住。
 * 詳情的返回／面板關閉在送出中由呼叫端擋。
 */
function CloseConfirm({ busy, error, onConfirm, onCancel }: { busy: boolean; error: string | null; onConfirm: () => void; onCancel: () => void }) {
  const root = useRef<HTMLDivElement>(null)
  const cancel = useRef<HTMLButtonElement>(null)
  useEscapeLayer(onCancel, root)
  useEffect(() => {
    cancel.current?.focus()
  }, [])
  return (
    <PanelDialog>
      <div
        ref={root}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="close-project-title"
        aria-describedby="close-project-body"
        aria-busy={busy}
        data-testid="close-project-confirm"
        className="bg-surface-raised border-control-edge shadow-dialog rounded-panel w-dialog flex max-w-full flex-col gap-gutter border p-gutter"
      >
      <p id="close-project-title" {...TITLE}>
        {OWNER_ACTION_LABELS.closeTitle}
      </p>
      <p id="close-project-body">{OWNER_ACTION_LABELS.closeBody}</p>
      <SubmitError message={error} />
      <div className="flex gap-gutter">
        <button ref={cancel} type="button" {...PRIMARY} aria-disabled={busy} onClick={onCancel}>
          {OWNER_ACTION_LABELS.cancel}
        </button>
        <button type="button" {...SECONDARY} aria-disabled={busy} onClick={onConfirm}>
          {OWNER_ACTION_LABELS.closeConfirm}
        </button>
      </div>
      </div>
    </PanelDialog>
  )
}
