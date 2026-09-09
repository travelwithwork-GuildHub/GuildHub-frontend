'use client'

import { layer } from '@/design/layers'
import type { RoomsView } from './useRooms'

// 走廊的門「為什麼不在那裡」。規格 `FE-W12-S02`／`S03`／`S04`／`S05`。
//
// ⚠️⚠️ **「目前沒有專案」與「拿不到資料」MUST NOT 長得一樣。**
// 兩者都是「走廊上沒有門」—— 混成同一句話的話，玩家會一直重新整理，
// 或者反過來，以為這個世界真的是空的。
//
// ⚠️ **這不是「常駐說明」。** `WorldCanvas` 有一條 `FE-O14-S11`／`S12` 的禁令：
// 不得加回任何**描述即時層狀態**的常駐文字。這一個講的是 REST 的門，
// 而且**一切正常時它什麼都不顯示**。

/** 每一種狀態要說的話。**`null` 代表不出聲**。 */
function messageFor(view: RoomsView): { readonly tone: string; readonly text: string } | null {
  if (view.status === 'loading') return { tone: 'loading', text: '走廊的門載入中⋯⋯' }
  if (view.status === 'failed') {
    return { tone: 'failed', text: '暫時拿不到專案清單 —— 走廊的門稍後會出現。' }
  }
  if (view.status === 'stale') return { tone: 'stale', text: '專案清單可能已經過期。' }
  if (view.doors.length === 0) return { tone: 'empty', text: '目前沒有公開的專案。' }
  return null
}

export function RoomsNotice({ view }: { view: RoomsView }) {
  const message = messageFor(view)
  if (message === null && view.hidden === 0) return null

  return (
    <div
      data-testid="rooms-notice"
      role="status"
      style={{ zIndex: layer('hud') }}
      className="border-line bg-surface text-ink-muted text-caption absolute top-gutter left-1/2 -translate-x-1/2 border px-gutter py-2"
    >
      {message !== null && <span data-testid={`rooms-${message.tone}`}>{message.text}</span>}
      {/* 規格 `FE-W12-S05`：排不下的**不得靜默消失**。
          走廊的容量是固定的，所以這句話由 DOM 講 —— 不造 3D 分頁 UI。 */}
      {view.hidden > 0 && (
        <span data-testid="rooms-hidden">{`另有 ${view.hidden} 個專案沒有顯示。`}</span>
      )}
    </div>
  )
}
