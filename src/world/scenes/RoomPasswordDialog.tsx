'use client'

import { useCallback, useEffect, useId, useRef, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { z } from 'zod'
import { enterProject } from '@/api/operations'
import { FIELD, FIELD_LABEL, FORM, PRIMARY, SECONDARY } from '@/design/controls'
import { layer } from '@/design/layers'
import { toUiError } from '@/errors/uiError'
import { SubmitError } from '@/forms/SubmitError'
import { useForm } from '@/forms/useForm'
import { useIdentity } from '@/identity/IdentityProvider'
import { nextTabStop } from '@/panel/focusTrap'
import { useEscapeLayer } from '@/world/interaction/escapeLayers'
import { useInteraction } from '@/world/interaction/InteractionProvider'
import { useRoomEntryGateIfProvided, type RoomEntryRequest } from './RoomEntryGate'
import { heldRoomToken, holdRoomToken } from './roomTokens'
import { useScene } from './SceneProvider'

// 房間密碼視窗。規格 `FE-N08`〈沒有票時，門前按 E 開的是這間房的 DOM 密碼視窗〉、〈視窗開著就鎖住世界命令；Esc、關閉、Tab 照全站鍵盤規則〉、
// 〈送出走既有 operation 與表單慣例〉、〈成功先存票再進房〉、〈失敗回饋可恢復、不猜原因、不回顯後端字串〉。
//
// 渲染在 `WorldCanvas` 裡（`InteractionProvider` 底下、`data-focus-anchor` 那個 div 裡 —— 跟 `ProfilePanel` 同一個位置）；
// 開關在 `RoomEntryGateProvider`。DOM 的視窗：`role="dialog"`、`aria-modal`、名稱含房名；密碼欄**不在 Canvas 裡**。
//
// ⚠️ **鎖在這裡持有**（design D8）：掛載時 `holdInputLock`、卸載釋放 —— 焦點在「送出」按鈕上時 `EditableFocusLock` 幫不上忙，
// 少了這把鎖，焦點在按鈕上按 W 人就走了。Escape 走層級（`FE-X06`）；Tab 在視窗內循環（`focusTrap.ts`）。
// 關閉：視窗卸載（當次密碼跟著消失，design D3）、焦點回世界焦點錨 —— 不是 `body`（鍵盤使用者迷航）。
//
// 送出（design D2、D4、D9、D10）：`useForm` ＋ `enterProject`；成功 → `holdRoomToken` → **讀回嚴格等於這張票** → `enterRoom` → 關。
// 失敗只看 `toUiError(cause).kind`：這個端點的 403 只有「密碼沒被接受」一個意思、404 只說「目前進不了」（不猜哪一種）；其餘用語彙表。
// **每一輪送出一個代號**：關閉（卸載）、換房（key 重掛＝卸載）、身分改變都換代號；結果只在代號還是現行的時採用，舊的一輪
// 在換代號的那一刻就交出 busy（`useForm` 的 `onSubmit` 立刻 resolve），晚到的回應什麼都不動。不用 `AbortSignal`：取消 fetch 不代表後端沒簽票。
// ⚠️ 這裡的字是元件常數，不是規格（規格只寫意圖）。

export const ROOM_ENTRY_LABELS = {
  /** 可及名稱：`進入「<房名>」`；沒有房名時只說「房間密碼」（`S11` 的深連結那條）。 */
  title: (room: string | null) => (room === null ? '輸入房間密碼' : `進入「${room}」`),
  description: '這間房需要房間密碼。',
  password: '房間密碼',
  submit: '進入',
  cancel: '取消',
  /** 403：這個端點唯一的 403 來源是密碼比對（design D4）。 */
  rejected: '密碼不對，再試一次。',
  /** 404：不猜是不存在、還沒成軍還是關了。 */
  unavailable: '這間房目前進不了。',
  /** 票存不進這個瀏覽器（design D10）：不是密碼的問題。 */
  notHeld: '這個瀏覽器存不了通行證，所以還進不去 —— 換一個瀏覽器或分頁再試。',
}

/** 密碼沒有格式規則（design D6）：空字串也照送，後端回 403。 */
const PasswordSchema = z.object({ password: z.string() })

/** 票拿到了卻存不住／讀回不是它／是空字串（`S14`）。前端自己的領域錯誤，文案由 `describeError` 給。 */
class TicketNotHeldError extends Error {}

function describeEntryError(cause: unknown): string | null {
  if (cause instanceof TicketNotHeldError) return ROOM_ENTRY_LABELS.notHeld
  const kind = toUiError(cause).kind
  if (kind === 'permission-denied') return ROOM_ENTRY_LABELS.rejected
  if (kind === 'not-found') return ROOM_ENTRY_LABELS.unavailable
  return null
}

export function RoomPasswordDialog() {
  const gate = useRoomEntryGateIfProvided()
  if (gate === null || gate.request === null) return null
  const { request, close } = gate
  // `key`：換一間房就是另一個表單（欄位重來、焦點重新落在密碼欄）；同一間房再叫一次不換 key、不重掛（`S01`）。
  return <OpenDialog key={request.projectId} request={request} onClose={close} />
}

function OpenDialog({ request, onClose }: { request: RoomEntryRequest; onClose: () => void }) {
  const { holdInputLock } = useInteraction()
  const { enterRoom } = useScene()
  const identity = useIdentity()
  const profileId = identity.state === 'signed-in' ? identity.profile.id : null
  const root = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const descriptionId = useId()

  // 世界命令鎖：開著就鎖（`S03`）；卸載釋放，釋放冪等、只拿掉自己那一把（別的持有者還在就仍鎖著）。
  useEffect(() => holdInputLock('room-password'), [holdInputLock])

  // 每一輪送出的代號（design D9）就是它自己在 `waiting` 裡的那個喚醒器：換代號＝叫醒還在等的那一輪，讓它作廢、交出 busy。
  const waiting = useRef(new Set<() => void>())
  const invalidate = useCallback(() => {
    for (const wake of waiting.current) wake()
    waiting.current.clear()
  }, [])
  // 身分改變（換人、登出、P→Q→P）→ 換代號；視窗不關（訪客本來就能開，D2）。卸載（關閉、換房）→ 換代號。
  useEffect(() => invalidate, [invalidate])
  useEffect(() => {
    invalidate()
  }, [profileId, invalidate])

  const { form, canSubmit, submitError, onSubmit } = useForm({
    schema: PasswordSchema,
    defaultValues: { password: '' },
    describeError: describeEntryError,
    onSubmit: async ({ password }) => {
      const me = profileId
      const settled = enterProject(request.projectId, { password }).then(
        (out) => ({ ok: true as const, out }),
        (cause: unknown) => ({ ok: false as const, cause }),
      )
      let wake = () => {}
      const woken = new Promise<'stale'>((resolve) => {
        wake = () => resolve('stale')
        waiting.current.add(wake)
      })
      const result = await Promise.race([settled, woken])
      waiting.current.delete(wake)
      // 作廢的一輪：不存票、不進房、不顯示；也不動新一輪的任何東西 —— 直接 resolve 把 busy 交出去。
      // （回應的 promise 鏈在 microtask 裡跑完、換代號的 effect 在 task 裡，兩者之間插不進「回應已落地、代號才換」—— 所以只看 race 的結果，不另外比計數。）
      if (result === 'stale') return
      if (!result.ok) throw result.cause
      const token = result.out.room_token
      // 先存、讀回**嚴格等於這一張**才算成功（D10）；空字串存得進也讀得回，另外擋。
      if (token === '' || me === null) throw new TicketNotHeldError()
      holdRoomToken(me, request.projectId, token)
      if (heldRoomToken(me, request.projectId) !== token) throw new TicketNotHeldError()
      enterRoom(request.projectId, request.title === null ? {} : { title: request.title })
      closeDialog()
    },
  })

  // 焦點一開始就在密碼欄（`S02`）。RHF 的 `register` 也要拿 ref，兩個都接。
  const field = useRef<HTMLInputElement | null>(null)
  const { ref: registerField, ...passwordField } = form.register('password')
  useEffect(() => {
    field.current?.focus()
  }, [])

  // 關閉是一個動作：先把焦點放回世界錨，再讓 provider 卸載這個視窗（卸載後 activeElement 才不會掉到 body）。
  const closeDialog = () => {
    document.querySelector<HTMLElement>('[data-focus-anchor="world"]')?.focus()
    onClose()
  }
  useEscapeLayer(closeDialog, root)

  // focus trap（`FE-X06-S11`）：Tab／Shift+Tab 只在視窗內循環；誰算「瀏覽器會 Tab 到」在 `focusTrap.ts`。
  const onKeyDown = (e: ReactKeyboardEvent<HTMLElement>) => {
    if (e.key !== 'Tab' || root.current === null) return
    const stop = nextTabStop(root.current, document.activeElement, e.shiftKey)
    if (stop === null) return
    e.preventDefault()
    if (stop !== 'stay') stop.focus()
  }

  return (
    <div
      ref={root}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      data-testid="room-password-dialog"
      data-project-id={request.projectId}
      onKeyDown={onKeyDown}
      style={{ zIndex: layer('modal') }}
      className="bg-surface-raised border-control-edge text-ink absolute top-1/2 left-1/2 flex w-[min(22rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col gap-gutter rounded border p-gutter"
    >
      <h2 id={titleId} className="text-title">
        {ROOM_ENTRY_LABELS.title(request.title)}
      </h2>
      <p id={descriptionId}>{ROOM_ENTRY_LABELS.description}</p>
      <form className={FORM} onSubmit={onSubmit} noValidate>
        <label className={FIELD_LABEL}>
          {ROOM_ENTRY_LABELS.password}
          <input
            ref={(el) => {
              registerField(el)
              field.current = el
            }}
            type="password"
            autoComplete="current-password"
            className={FIELD}
            {...passwordField}
          />
        </label>
        <SubmitError message={submitError} />
        <div className="flex gap-gutter">
          <button type="submit" className={PRIMARY} disabled={!canSubmit}>
            {ROOM_ENTRY_LABELS.submit}
          </button>
          <button type="button" className={SECONDARY} onClick={closeDialog}>
            {ROOM_ENTRY_LABELS.cancel}
          </button>
        </div>
      </form>
    </div>
  )
}
