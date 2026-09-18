'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { RoomDoorOut } from '@/api/contract/rest'
import { listRooms } from '@/api/operations'
import { doorsFor, type RoomDoors } from './ordering'

// 走廊要生成哪些門。規格 `FE-W12-S03`／`S04`／`S19`–`S24`。
//
// ⚠️ **元件不自己 `fetch`**（`CLAUDE.md`，eslint 擋著）—— 這裡走 `src/api/operations`。
//
// ⚠️⚠️ **輪詢不是繼承來的。** `FE-R04` 決定過「頁籤切到背景時 rAF 會停」，
// 但那講的是 render loop 與 WebSocket 連線；**REST 輪詢是另一個副作用**，
// 它的生命週期由 `FE-W12` 自己明訂（change 的 design D5）。

/**
 * 重新請求的週期。
 *
 * ⚠️ **30 秒不是即時。** 真正的即時走 WebSocket；`GET /api/rooms` 的契約明文
 * 「`online_count` 只在 REST 回應裡，**不會自己更新**」。
 * 30 秒讓「有人進了那個房間」在玩家走過走廊的時間尺度內反映得出來，
 * 同時一小時只打 120 次。
 *
 * **要更快是 Requirement 變更，不是調這一個常數。**
 */
export const POLL_INTERVAL_MS = 30_000

export type RoomsStatus =
  /** 第一次請求還沒回來。**沒有舊資料可留**，所以走廊是空的。 */
  | 'loading'
  /** 有資料，而且是最新的。**`doors` 空陣列代表「目前沒有公開的專案」**。 */
  | 'ready'
  /** 有資料，但最近一次輪詢失敗了。**門留在原地** —— 一次網路抖動不該讓走廊變空。 */
  | 'stale'
  /** 第一次請求就失敗，什麼都沒有。 */
  | 'failed'

export interface RoomsView extends RoomDoors {
  readonly status: RoomsStatus
  /**
   * 立即重取（`FE-J04-S10`）：成軍／結案之後門要馬上長出來／消失，不等 30 秒。
   * 沒在飛就馬上打；在飛就記一次待辦、那一次**真的結束**後再打一次（中止的不算 —— 背景、卸載、不在大廳都會清掉待辦）；
   * 分頁不可見或不在大廳時是 no-op。輪詢的週期、背景停止、`stale` 規則都不變。
   */
  readonly refresh: () => void
  /**
   * 清單**全部**的房間（去重、未截斷）。走廊只畫 `doors`；要「依 `projectId` 查標題」的地方（`FE-N08-S11` 重開視窗補房名）
   * 用這一份 —— 排不進走廊的房間也在大廳清單裡（審查抓到：用 `doors` 查，冷門房間永遠補不上房名）。
   */
  readonly all: readonly RoomDoorOut[]
}

const EMPTY: readonly RoomDoorOut[] = []

/**
 * 取得走廊要生成的門。
 *
 * @param capacity 走廊排得下幾扇（由 `slotCapacity` 從分區推導）
 * @param enabled 只有 Guild Hall 有走廊（`FE-V01-S03`）。`false` 時**不打、不輪詢**，
 *   回一個空的 `loading` —— 不是「打了不用」：房間裡每 30 秒打一次 `GET /api/rooms` 是白打的。
 *   它是參數不是條件式呼叫：hook 的順序要穩定。
 *   再從 `false` 變回 `true` 時立刻重新請求；回應到之前交出的是**上一次的門**（有的話）——
 *   跟 `stale` 同一個理由（`FE-W12-S22`）：一次來回不該讓走廊先變空再長回來。
 */
export function useRooms(capacity: number, enabled = true): RoomsView {
  const [status, setStatus] = useState<RoomsStatus>('loading')
  const [rooms, setRooms] = useState<readonly RoomDoorOut[]>(EMPTY)
  // 立即重取的把手活在 effect 裡（它要碰 `inFlight`）；對外是一個穩定的函式，停用時是 no-op。
  const refreshRef = useRef<() => void>(() => {})
  const refresh = useCallback(() => refreshRef.current(), [])

  useEffect(() => {
    if (!enabled) return undefined
    /**
     * 進行中的那一次。
     *
     * ⚠️ **它同時是「單一飛行」的鎖與「中止」的把手** —— 兩件事共用一個
     * 事實來源。分成一個 boolean 加一個 controller 的話，
     * 兩者會在「中止之後 boolean 忘了清」這種地方漂掉。
     */
    let inFlight: AbortController | null = null
    let timer: ReturnType<typeof setInterval> | null = null
    /** 在飛時收到的立即重取：那一次真的結束後再打一次。**中止時一併清掉**（`FE-J04-S10`）。 */
    let pendingRefresh = false

    const load = () => {
      // 規格 `FE-W12-S21`：同一時間最多一個進行中的請求。
      if (inFlight !== null) return
      const controller = new AbortController()
      inFlight = controller

      listRooms({ signal: controller.signal })
        .then((next) => {
          // ⚠️ **這一行同時擋掉三件事**：頁籤切到背景、元件卸載、以及
          // 「切走又切回來」之後晚到的舊回應（規格 `FE-W12-S23`／`S24`）。
          // 三者都走同一條路 —— **中止**。
          //
          // **不要再加一個 `mounted` 旗標。** 卸載時的清理已經呼叫了 `abort()`，
          // 所以旗標永遠跟 `aborted` 同時為真 —— 它是一段**驗不到的程式碼**：
          // 拿掉它一條測試都不會紅（實測）。
          if (controller.signal.aborted) return
          setRooms(next)
          setStatus('ready')
        })
        .catch(() => {
          // ⚠️ **中止不是失敗**（規格 `FE-W12-S24`）—— 它是我們自己要求的。
          // 真的 `fetch` 被中止時會 reject 一個 `AbortError`，
          // 少了這一行的話「切到背景」會被畫成「資料拿不到」。
          if (controller.signal.aborted) return
          // ⚠️ **有舊資料就退到 `stale`，不要把門全部移除**（規格 `FE-W12-S22`）。
          setStatus((current) => (current === 'loading' || current === 'failed' ? 'failed' : 'stale'))
        })
        .finally(() => {
          if (inFlight === controller) inFlight = null
          // 被中止的不算「結束」：背景／卸載／離開大廳時 `abort()` 也會走到這裡，消費待辦的話背景分頁會多打一次、卸載後會 setState。
          if (controller.signal.aborted || !pendingRefresh) return
          pendingRefresh = false
          load()
        })
    }
    refreshRef.current = () => {
      // 不可見時 no-op：回到可見時既有的「立即更新」會打（`FE-W12-S20`）
      if (document.visibilityState === 'hidden') return
      if (inFlight !== null) {
        pendingRefresh = true
        return
      }
      load()
    }

    const start = () => {
      if (timer === null) timer = setInterval(load, POLL_INTERVAL_MS)
    }
    const stop = () => {
      if (timer !== null) clearInterval(timer)
      timer = null
    }

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        // ⚠️ **中止，不是「捨棄結果」**（規格 `FE-W12-S24`）。
        // 只標記「結果不要」的話那個請求仍然在飛，
        // 而下面「回到可見立即請求」會讓兩個同時存在。
        pendingRefresh = false
        inFlight?.abort()
        inFlight = null
        stop()
        return
      }
      load()
      start()
    }

    load()
    start()
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      // ⚠️ **卸載時一定要中止。** `/world` 是一個會被離開的路由，
      // 而週期是 30 秒 —— 「切走的時候剛好有一個請求在飛」是常態，不是邊角。
      pendingRefresh = false
      refreshRef.current = () => {}
      inFlight?.abort()
      inFlight = null
      stop()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [enabled])

  // 停用時交出空的 `loading`：是**推導**不是 setState —— 狀態留著，下次啟用先有東西可畫。
  if (!enabled) return { ...DISABLED, refresh }
  const { doors, hidden, all } = doorsFor(rooms, capacity)
  return { status, doors, hidden, all, refresh }
}

const DISABLED: Omit<RoomsView, 'refresh'> = { status: 'loading', doors: EMPTY, hidden: 0, all: EMPTY }
