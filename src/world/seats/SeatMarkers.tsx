'use client'

import { useCallback, useEffect, type ReactNode, type RefObject } from 'react'
import { CAPTION, SECONDARY, withClass } from '@/design/controls'
import { layer } from '@/design/layers'
import { toUiError } from '@/errors/uiError'
import { useIdentity } from '@/identity/IdentityProvider'
import { Interactable } from '@/world/interaction/Interactable'
import { SEAT_INDICES, stationAt, type SeatIndex } from '../layout/projectRoomLayout'
import { SEAT_ANCHORS } from './anchors'
import { SeatAnchors, type SeatAnchorNodes } from './SeatAnchors'
import { seatOf } from './seatRules'
import { relocationForSeat } from './seatRelocation'
import { useSeatNames } from './useSeatNames'
import { useSeats, type SeatsState, type SeatsReady } from './useSeats'
import type { RelocationRef } from '@/world/player/relocation'

// 房間裡的座位標籤、入座互動與回饋（`FE-J13` 的畫面半邊；design D1／D4，`fe-j13-sit-walk-in` 修訂）。
// 規格〈每個座位有一個標籤〉〈一鍵入座：走近空位、按 E〉〈失敗回饋〉。
//
// 標籤**住在錨點裡**（`SeatAnchors` 的 `render` 插槽）：位置跟著 `SeatAnchorProjector` 每幀寫的 translate 走、錨點 hidden 一起 hidden，每幀零新工作。
// 標籤從錨點中心往下 12 px（`translate-y-3`），不動錨點的中心（`FE-W16-S08` 的尺不變）。**標籤是純資訊 DOM、在 Canvas 外面、不持世界命令鎖、不進互動系統。**
//
// ⚠️ **入座是空間互動，不是按鈕**（`fe-j13-sit-walk-in`）：可入座的空位在該工位的**站位**（`stationAt(i)`，離通道 2.5、走得到；
// 不是桌面錨點 3.6、超出互動半徑 2）註冊一個 `Interactable`。走近＋面對 → 提示「按 E 入座」→ 按 E 送 `claim`。
// **走近不送請求**（只有按 E 才承諾）—— 入座是有副作用、會失敗的一人一格 claim，不是穿門那種冪等導覽。自己有座位／房間非 active／票失效時**不掛**。
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

export function RoomSeats({
  projectId,
  nodesRef,
  relocateRef,
}: {
  projectId: string
  nodesRef: RefObject<SeatAnchorNodes>
  /** 入座成功時把角色搬到工位站位（`FE-J13-S07`）。`WorldCanvas` 持有、也傳給 `LocalPlayer` 消費；沒傳（單元測試）就不搬。 */
  relocateRef?: RelocationRef
}) {
  const identity = useIdentity()
  const me = identity.state === 'signed-in' ? identity.profile : null
  // 入座成功 → 算站位＋朝向、寫進共享 ref；`LocalPlayer` 在下一幀原子消費。純函式 `relocationForSeat`，同格永遠同位置同朝向。
  const onRelocate = useCallback(
    (seatIndex: number) => {
      if (relocateRef) relocateRef.current = relocationForSeat(seatIndex)
    },
    [relocateRef],
  )
  const { state, claim, retry, dismissFeedback } = useSeats({ projectId, me: me?.id ?? '', active: me !== null, onRelocate })
  const ready = state.phase === 'ready' ? state : null
  const names = useSeatNames(ready?.seats.map((s) => s.user_id) ?? NONE, me?.id ?? '')

  // 回饋 4 秒後消失；下一則（`at` 變）重新計時
  const feedbackAt = ready?.feedback?.at
  useEffect(() => {
    if (feedbackAt === undefined) return
    const timer = setTimeout(dismissFeedback, SEAT_FEEDBACK_MS)
    return () => clearTimeout(timer)
  }, [feedbackAt, dismissFeedback])

  // 標籤是**純資訊**：名字／自己的／「空位」。入座不在這裡（改成站位上的空間互動，見 `RoomSeatInteractables`）。
  const render = (seatIndex: SeatIndex): ReactNode => {
    if (ready === null || me === null || seatIndex >= ready.seatCount) return null
    const occupant = ready.seats.find((s) => s.seat_index === seatIndex)
    const mine = occupant?.user_id === me.id
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
      </div>
    )
  }

  return (
    <>
      <SeatAnchors anchors={SEAT_ANCHORS} nodesRef={nodesRef} render={render} />
      {ready !== null && me !== null && <RoomSeatInteractables ready={ready} me={me.id} claim={claim} />}
      <SeatFeedbackView state={state} onRetry={retry} />
    </>
  )
}

/**
 * 入座的空間互動（`fe-j13-sit-walk-in`；規格〈一鍵入座：走近空位、按 E〉）。
 *
 * 對**可入座的空位**在該工位的**站位**（`stationAt(i)`，離通道 2.5、走得到；不是桌面錨點 3.6、超出互動半徑）註冊 `Interactable`。
 * 走近＋面對 → 提示「按 E 入座」→ 按 E 呼叫 `claim(i)`（`useSeats` 內部已有送出中 guard 與 409／201 之後才放開的時序）。
 * **走近不送請求**：只有按 E（`Interactable.onInteract`）才承諾入座。
 *
 * 何時**不掛任何一格**（走近沒有提示）：房間非 `active`（`closed` 不給入口）、票已失效（`locked`）、或自己已經有座位（一人一格；
 * 不做換座、不做走離開就離座 —— 後端沒有釋放座位的端點 `BE-G07`）。
 */
function RoomSeatInteractables({ ready, me, claim }: { ready: SeatsReady; me: string; claim: (seatIndex: number) => void }): ReactNode {
  if (ready.status !== 'active' || ready.locked || seatOf(ready.seats, me) !== undefined) return null
  const occupied = new Set(ready.seats.map((s) => s.seat_index))
  return (
    <>
      {SEAT_INDICES.filter((i) => i < ready.seatCount && !occupied.has(i)).map((i) => {
        const station = stationAt(i)
        return <Interactable key={i} id={`seat-${i}`} x={station.x} z={station.z} label={SEAT_TEXT.claim} onInteract={() => claim(i)} />
      })}
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
