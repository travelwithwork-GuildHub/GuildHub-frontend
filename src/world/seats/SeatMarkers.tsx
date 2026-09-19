'use client'

import { useEffect, type ReactNode, type RefObject } from 'react'
import { CAPTION, SECONDARY, withClass } from '@/design/controls'
import { layer } from '@/design/layers'
import { toUiError } from '@/errors/uiError'
import { useIdentity } from '@/identity/IdentityProvider'
import type { SeatIndex } from '../layout/projectRoomLayout'
import { SEAT_ANCHORS } from './anchors'
import { SeatAnchors, type SeatAnchorNodes } from './SeatAnchors'
import { canClaim, seatOf } from './seatRules'
import { useSeatNames } from './useSeatNames'
import { useSeats, type SeatsState } from './useSeats'

// 房間裡的座位標籤與回饋（`FE-J13` 的畫面半邊；design D1／D4）。規格〈每個座位有一個標籤〉〈一鍵入座〉〈失敗回饋〉。
//
// 標籤**住在錨點裡**（`SeatAnchors` 的 `render` 插槽）：位置跟著 `SeatAnchorProjector` 每幀寫的 translate 走、錨點 hidden 一起 hidden，每幀零新工作。
// 標籤從錨點中心往下 12 px（`translate-y-3`），不動錨點的中心（`FE-W16-S08` 的尺不變）。
// 是 DOM、在 Canvas 外面、不持世界命令鎖、不進互動系統（桌子仍不是互動物件）。
//
// 沒登入就沒有座位（訪客進不了房間；`useSeats` 不啟動、錨點照舊 aria-hidden）。座位還沒載到之前**沒有標籤** —— 先畫「空位」會是謊言（`S01`）。
// 文案是常數、不回顯後端字串（`FE-N08` 同一條）；失敗語彙用 `toUiError().message`（`FE-X03`）。

/** 回饋自動消失的時間（跟 `RefusalStatus` 同一個節奏；ui-ux-pro-max：3–5 秒）。 */
export const SEAT_FEEDBACK_MS = 4_000

export const SEAT_TEXT = {
  empty: '空位',
  someone: '有人',
  you: '（你）',
  claim: '入座',
  retry: '重試',
  loadFailed: '座位載入失敗：',
} as const

/** 回饋文案。`failed` 用 `FE-X03` 的語彙，不在這裡。票失效說「回大廳重新進房」—— 不說成密碼錯或座位問題（`S03`）。 */
export const SEAT_FEEDBACK = {
  'seat-taken': '這一格剛被別人坐走了，座位已更新。',
  'already-seated': '你已經有座位了 —— 一人一格。',
  ticket: '這間房的票已經失效，回大廳重新進房再試。',
} as const

const NONE: readonly string[] = []

export function RoomSeats({ projectId, nodesRef }: { projectId: string; nodesRef: RefObject<SeatAnchorNodes> }) {
  const identity = useIdentity()
  const me = identity.state === 'signed-in' ? identity.profile : null
  const { state, claim, retry, dismissFeedback } = useSeats({ projectId, me: me?.id ?? '', active: me !== null })
  const ready = state.phase === 'ready' ? state : null
  const names = useSeatNames(ready?.seats.map((s) => s.user_id) ?? NONE, me?.id ?? '')

  // 回饋 4 秒後消失；下一則（`at` 變）重新計時
  const feedbackAt = ready?.feedback?.at
  useEffect(() => {
    if (feedbackAt === undefined) return
    const timer = setTimeout(dismissFeedback, SEAT_FEEDBACK_MS)
    return () => clearTimeout(timer)
  }, [feedbackAt, dismissFeedback])

  const render = (seatIndex: SeatIndex): ReactNode => {
    if (ready === null || me === null || seatIndex >= ready.seatCount) return null
    const occupant = ready.seats.find((s) => s.seat_index === seatIndex)
    const mine = occupant?.user_id === me.id
    // 「入座」的存在：房間 active 且自己沒座位（一人一格，不等 409；closed 不給入口）。能不能按：`canClaim`（票沒失效、沒在送）
    const showClaim = occupant === undefined && ready.status === 'active' && seatOf(ready.seats, me.id) === undefined
    const label = occupant === undefined ? SEAT_TEXT.empty : mine ? `${me.display_name}${SEAT_TEXT.you}` : (names[occupant.user_id] ?? SEAT_TEXT.someone)
    const chip = mine
      ? 'border-accent bg-accent text-white'
      : occupant !== undefined
        ? 'border-line bg-surface text-ink'
        : 'border-line bg-surface text-ink-muted border-dashed'
    return (
      <div
        data-testid="seat-marker"
        data-seat-index={seatIndex}
        data-mine={mine ? 'true' : undefined}
        // `w-max`：錨點是 0×0，沒有它 absolute 的子節點會被擠成 0 寬、每個字換一行（截圖抓到「入／座」）
        className="absolute top-0 left-0 flex w-max -translate-x-1/2 translate-y-3 flex-col items-center gap-1"
      >
        {/* 單行、超出裁掉、`title` 給完整名字（ui-ux-pro-max：compact label 不換行、可取得全文） */}
        <span title={label} {...withClass(CAPTION, `rounded-control max-w-40 overflow-hidden border px-2 leading-6 text-ellipsis whitespace-nowrap ${chip}`)}>
          {label}
        </span>
        {showClaim && (
          <button
            type="button"
            disabled={!canClaim({ ...ready, me: me.id })}
            aria-busy={ready.claiming === seatIndex ? 'true' : undefined}
            onClick={() => claim(seatIndex)}
            {...withClass(SECONDARY, 'bg-surface text-caption whitespace-nowrap')}
          >
            {SEAT_TEXT.claim}
          </button>
        )}
      </div>
    )
  }

  return (
    <>
      <SeatAnchors anchors={SEAT_ANCHORS} nodesRef={nodesRef} render={render} />
      <SeatFeedbackView state={state} onRetry={retry} />
    </>
  )
}

/** 一則回饋，掛在座位層的固定位置（不是每格一個；design D4）。被搶／已有座位是 `status`（資訊），票失效、服務失敗、載入失敗是 `alert`。 */
function SeatFeedbackView({ state, onRetry }: { state: SeatsState; onRetry: () => void }) {
  let kind: string
  let role: 'status' | 'alert'
  let text: string
  let retry = false
  if (state.phase === 'failed') {
    kind = 'load-failed'
    role = 'alert'
    text = `${SEAT_TEXT.loadFailed}${toUiError(state.cause).message}`
    retry = true
  } else if (state.phase === 'ready' && state.feedback !== null) {
    const fb = state.feedback
    kind = fb.kind
    role = fb.kind === 'seat-taken' || fb.kind === 'already-seated' ? 'status' : 'alert'
    text = fb.kind === 'failed' ? toUiError(fb.cause).message : SEAT_FEEDBACK[fb.kind]
  } else {
    return null
  }
  return (
    <div
      data-testid="seat-feedback"
      data-kind={kind}
      role={role}
      style={{ zIndex: layer('hud') }}
      className="bottom-gutter absolute left-1/2 flex -translate-x-1/2 items-center gap-2"
    >
      <p {...withClass(CAPTION, 'bg-surface-raised border-line text-ink shadow-dialog rounded-panel border px-gutter py-2')}>{text}</p>
      {retry && (
        <button type="button" onClick={onRetry} {...withClass(SECONDARY, 'bg-surface-raised')}>
          {SEAT_TEXT.retry}
        </button>
      )}
    </div>
  )
}
