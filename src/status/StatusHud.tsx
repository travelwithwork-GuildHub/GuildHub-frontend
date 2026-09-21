'use client'

import { useEffect, useId, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { LIMITS } from '@/api/contract/limits'
import { CAPTION, FIELD, FIELD_LABEL, PRIMARY, SECONDARY, TERTIARY, withClass } from '@/design/controls'
import { layer } from '@/design/layers'
import { useIdentity } from '@/identity/IdentityProvider'
import { useStatusIfProvided } from '@/realtime/StatusProvider'
import { QUICK_STATUSES } from './quickStatuses'

// 自己的狀態文字的控制（`FE-K05`〈設定狀態〉；design D2／D4／D5）。HUD，Canvas 外面，只給 `signed-in` 的人。
//
// 收合是一顆膠囊（目前狀態，沒有就「設定狀態」）；展開是快捷狀態、一格自由輸入（有可見標籤、剩餘字數）、送出、清除。
// **目前狀態以伺服器回聲為準**（store 的 `text`）：送出中畫成 pending，不先畫成已生效。超過 12 字送出停用、不送（後端靜默丟棄）。
// 沒連線：一則 `role="status"` 回饋、4 秒消失、不擋下一次操作。輸入框有焦點時世界鍵盤由既有的 `EditableFocusLock` 鎖住；Escape 焦點回世界錨。
// ui-ux-pro-max：輸入要有可見標籤（不只 placeholder）、disabled 要看得出來、toast 3–5 秒。

const MAX = LIMITS.statusText.max
export const STATUS_FEEDBACK_MS = 4_000

export const STATUS_HUD_LABELS = {
  region: '狀態',
  toggleEmpty: '設定狀態',
  togglePrefix: '狀態：',
  pending: '送出中…',
  field: `自訂狀態（最多 ${MAX} 字）`,
  remaining: (n: number) => `還可以輸入 ${n} 字`,
  over: (n: number) => `超過 ${n} 字，送不出去`,
  submit: '送出',
  clear: '清除狀態',
  close: '收合',
  offline: '現在沒有連線，等一下再試。',
} as const

const focusWorldAnchor = () => document.querySelector<HTMLElement>('[data-focus-anchor="world"]')?.focus()

export function StatusHud() {
  const identity = useIdentity()
  const status = useStatusIfProvided()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [feedback, setFeedback] = useState<string | null>(null)
  const fieldId = useId()
  const hintId = useId()
  useEffect(() => {
    if (feedback === null) return
    const timer = setTimeout(() => setFeedback(null), STATUS_FEEDBACK_MS)
    return () => clearTimeout(timer)
  }, [feedback])
  if (identity.state !== 'signed-in' || status === null) return null
  const { snapshot } = status
  const over = draft.length - MAX
  const submit = (text: string) => {
    const result = status.set(text)
    if (!result.ok && result.reason === 'offline') setFeedback(STATUS_HUD_LABELS.offline)
    if (result.ok && text !== '') setDraft('')
  }
  const onKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Escape') return
    e.preventDefault()
    e.stopPropagation()
    focusWorldAnchor()
  }
  const toggleLabel = snapshot.text === '' ? STATUS_HUD_LABELS.toggleEmpty : `${STATUS_HUD_LABELS.togglePrefix}${snapshot.text}`
  const hasStatus = snapshot.text !== '' || (snapshot.pending !== null && snapshot.pending !== '')
  return (
    <section
      aria-label={STATUS_HUD_LABELS.region}
      data-testid="status-hud"
      data-current={snapshot.text}
      data-pending={snapshot.pending ?? undefined}
      style={{ zIndex: layer('hud') }}
      className="absolute top-16 left-gutter flex w-[min(20rem,30vw)] flex-col gap-2"
    >
      {/* 收合的膠囊：目前狀態（回聲為準）；送出中另外標 */}
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} {...withClass(SECONDARY, 'bg-surface/70 text-caption shadow-panel w-max max-w-full overflow-hidden text-ellipsis whitespace-nowrap backdrop-blur-md')}>
        {toggleLabel}
        {snapshot.pending !== null && <span className="text-ink-muted ml-2">{STATUS_HUD_LABELS.pending}</span>}
      </button>
      {open && (
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            if (over > 0 || draft === '') return
            submit(draft)
          }}
          className="bg-surface/70 border-line text-ink shadow-panel flex flex-col gap-2 rounded-panel border p-2 backdrop-blur-md"
        >
          <div className="flex flex-wrap gap-1">
            {QUICK_STATUSES.map((q) => (
              <button key={q} type="button" onClick={() => submit(q)} aria-pressed={snapshot.text === q} {...withClass(TERTIARY, 'border-line text-caption border py-1 aria-pressed:bg-surface-sunken')}>
                {q}
              </button>
            ))}
          </div>
          <label htmlFor={fieldId} className={FIELD_LABEL}>
            {STATUS_HUD_LABELS.field}
            <input
              id={fieldId}
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKeyDown}
              aria-invalid={over > 0 || undefined}
              aria-describedby={hintId}
              autoComplete="off"
              {...withClass(FIELD, 'w-full')}
            />
          </label>
          <p id={hintId} data-testid="status-remaining" {...withClass(CAPTION, over > 0 ? 'text-danger' : 'text-ink-muted')}>
            {over > 0 ? STATUS_HUD_LABELS.over(over) : STATUS_HUD_LABELS.remaining(MAX - draft.length)}
          </p>
          <div className="flex items-center gap-2">
            <button type="submit" disabled={over > 0 || draft === ''} {...withClass(PRIMARY, 'text-caption py-1')}>
              {STATUS_HUD_LABELS.submit}
            </button>
            {hasStatus && (
              <button type="button" onClick={() => submit('')} {...withClass(TERTIARY, 'text-caption py-1')}>
                {STATUS_HUD_LABELS.clear}
              </button>
            )}
            <button type="button" onClick={() => setOpen(false)} {...withClass(TERTIARY, 'text-caption ml-auto py-1')}>
              {STATUS_HUD_LABELS.close}
            </button>
          </div>
        </form>
      )}
      {feedback !== null && (
        <p data-testid="status-feedback" role="status" {...withClass(CAPTION, 'bg-surface-raised border-line text-ink shadow-dialog rounded-panel border px-gutter py-2')}>
          {feedback}
        </p>
      )}
    </section>
  )
}
