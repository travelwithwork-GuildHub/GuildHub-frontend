'use client'

import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { FIELD, FIELD_LABEL, FORM, PRIMARY, SECONDARY } from '@/design/controls'
import { layer } from '@/design/layers'
import { nextTabStop } from '@/panel/focusTrap'
import { useEscapeLayer } from '@/world/interaction/escapeLayers'
import { useInteraction } from '@/world/interaction/InteractionProvider'
import { useRoomEntryGateIfProvided, type RoomEntryRequest } from './RoomEntryGate'

// 房間密碼視窗。規格 `FE-N08`〈沒有票時，門前按 E 開的是這間房的 DOM 密碼視窗〉、〈視窗開著就鎖住世界命令；Esc、關閉、Tab 照全站鍵盤規則〉。
//
// 渲染在 `WorldCanvas` 裡（`InteractionProvider` 底下、`data-focus-anchor` 那個 div 裡 —— 跟 `ProfilePanel` 同一個位置）；
// 開關在 `RoomEntryGateProvider`。DOM 的視窗：`role="dialog"`、`aria-modal`、名稱含房名；密碼欄**不在 Canvas 裡**。
//
// ⚠️ **鎖在這裡持有**（design D8）：掛載時 `holdInputLock`、卸載釋放 —— 焦點在「送出」按鈕上時 `EditableFocusLock` 幫不上忙，
// 少了這把鎖，焦點在按鈕上按 W 人就走了。Escape 走層級（`FE-X06`）；Tab 在視窗內循環（`focusTrap.ts`）。
// 關閉：視窗卸載（當次密碼跟著消失，design D3）、焦點回世界焦點錨 —— 不是 `body`（鍵盤使用者迷航）。
//
// 送出（`useForm` ＋ `enterProject`、錯誤分類、存票再進房）是下一片；這裡的 submit 先不做事。
// ⚠️ 這裡的字是元件常數，不是規格（規格只寫意圖）。

export const ROOM_ENTRY_LABELS = {
  /** 可及名稱：`進入「<房名>」`；沒有房名時只說「房間密碼」（`S11` 的深連結那條）。 */
  title: (room: string | null) => (room === null ? '輸入房間密碼' : `進入「${room}」`),
  description: '這間房需要房間密碼。',
  password: '房間密碼',
  submit: '進入',
  cancel: '取消',
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
  const root = useRef<HTMLDivElement>(null)
  const field = useRef<HTMLInputElement>(null)
  const [password, setPassword] = useState('')
  const titleId = useId()
  const descriptionId = useId()

  // 世界命令鎖：開著就鎖（`S03`）；卸載釋放，釋放冪等、只拿掉自己那一把（別的持有者還在就仍鎖著）。
  useEffect(() => holdInputLock('room-password'), [holdInputLock])
  // 焦點一開始就在密碼欄（`S02`）。
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
      <form className={FORM} onSubmit={(e) => e.preventDefault()} noValidate>
        <label className={FIELD_LABEL}>
          {ROOM_ENTRY_LABELS.password}
          <input ref={field} name="password" type="password" autoComplete="current-password" className={FIELD} value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <div className="flex gap-gutter">
          <button type="submit" className={PRIMARY}>
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
