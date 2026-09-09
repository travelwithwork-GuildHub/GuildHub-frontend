'use client'

import { useEffect, useRef, useState } from 'react'
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
}

const EMPTY: readonly RoomDoorOut[] = []

/**
 * 取得走廊要生成的門。
 *
 * @param capacity 走廊排得下幾扇（由 `slotCapacity` 從分區推導）
 */
export function useRooms(capacity: number): RoomsView {
  const [status, setStatus] = useState<RoomsStatus>('loading')
  const [rooms, setRooms] = useState<readonly RoomDoorOut[]>(EMPTY)

  useEffect(() => {
    /**
     * 進行中的那一次。
     *
     * ⚠️ **它同時是「單一飛行」的鎖與「中止」的把手** —— 兩件事共用一個
     * 事實來源。分成一個 boolean 加一個 controller 的話，
     * 兩者會在「中止之後 boolean 忘了清」這種地方漂掉。
     */
    let inFlight: AbortController | null = null
    let timer: ReturnType<typeof setInterval> | null = null

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
        })
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
      inFlight?.abort()
      inFlight = null
      stop()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  const { doors, hidden } = doorsFor(rooms, capacity)
  return { status, doors, hidden }
}
