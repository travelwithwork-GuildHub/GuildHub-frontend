'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { ProjectStatus, SeatOut } from '@/api/contract/rest'
import { claimSeat, getProject, listSeats } from '@/api/operations'
import { toUiError } from '@/errors/uiError'
import { SEATS_POLL_MS, canClaim, classify409 } from './seatRules'

// 房間座位的狀態（design D2）：進房載入（project ＋ seats 並行）、30 秒輪詢（不可見停、可見立即）、claim（送出中只送一次）、
// 201／409 重取、403／401 鎖住、其他失敗可再按；離開房間 abort（作廢的防線，`useMyProjects` 的教訓）。
// 規格 `FE-J13`〈座位以重取為準〉〈一鍵入座〉〈失敗回饋〉。輪詢的骨架跟 `useRooms` 同一套（`FE-W12` 的不可見規則）。
//
// 狀態帶著「這一次進房」的 key（房、人、第幾次重試）：key 對不上就是 loading —— 換房、回大廳再進來都從載入中開始，
// 不在 effect 裡 setState（lint 擋）；舊回應則靠 abort 擋。

export type SeatFeedback =
  | { kind: 'seat-taken' | 'already-seated'; at: number }
  | { kind: 'ticket' | 'failed'; at: number; cause: unknown }

export type SeatsState =
  | { readonly phase: 'loading' }
  | { readonly phase: 'failed'; readonly cause: unknown }
  | {
      readonly phase: 'ready'
      readonly seats: readonly SeatOut[]
      readonly seatCount: number
      readonly status: ProjectStatus
      /** 送出中的那一格；null 是沒有在送。 */
      readonly claiming: number | null
      /** 票失效（403／401）：「入座」全停，回大廳重新進房才會解。 */
      readonly locked: boolean
      readonly feedback: SeatFeedback | null
    }

export interface SeatsApi {
  readonly state: SeatsState
  readonly claim: (seatIndex: number) => void
  readonly retry: () => void
  readonly dismissFeedback: () => void
}

type Ready = Extract<SeatsState, { phase: 'ready' }>
const LOADING: SeatsState = { phase: 'loading' }
const isAbort = (e: unknown) => e instanceof DOMException && e.name === 'AbortError'
const keyOf = (projectId: string, me: string, generation: number) => `${projectId}:${me}:${generation}`

export function useSeats({ projectId, me, active }: { projectId: string; me: string; active: boolean }): SeatsApi {
  const [stored, setStored] = useState<{ key: string; state: SeatsState } | null>(null)
  const [generation, setGeneration] = useState(0)
  const key = keyOf(projectId, me, generation)
  const state: SeatsState = active && stored !== null && stored.key === key ? stored.state : LOADING
  // 這一次進房的 controller 與最新狀態（claim 是事件處理器，要讀當下的）
  const roomRef = useRef<{ key: string; controller: AbortController } | null>(null)
  const stateRef = useRef(state)
  useEffect(() => {
    stateRef.current = state
  })
  const claimingRef = useRef(false)

  useEffect(() => {
    if (!active) return
    const key = keyOf(projectId, me, generation)
    const controller = new AbortController()
    roomRef.current = { key, controller }
    const dead = () => controller.signal.aborted
    const update = (patch: (s: Ready) => Ready) => setStored((r) => (r !== null && r.key === key && r.state.phase === 'ready' ? { key, state: patch(r.state) } : r))
    // 重取座位：成功換掉 seats、失敗留舊的（stale）
    const refetch = async () => {
      try {
        const seats = await listSeats(projectId, { signal: controller.signal })
        if (dead()) return
        update((s) => ({ ...s, seats }))
      } catch {
        // 中止不是失敗；輪詢失敗留舊的
      }
    }

    void Promise.all([getProject(projectId, { signal: controller.signal }), listSeats(projectId, { signal: controller.signal })]).then(
      ([project, seats]) => {
        if (dead()) return
        setStored({ key, state: { phase: 'ready', seats, seatCount: project.seat_count, status: project.status, claiming: null, locked: false, feedback: null } })
      },
      (cause: unknown) => {
        if (dead() || isAbort(cause)) return
        setStored({ key, state: { phase: 'failed', cause } })
      },
    )

    // 輪詢（`FE-W12` 的規則）：不可見時停；回到可見立即重取一次再繼續。在飛的請求由同一個 controller 管，離開房間一起中止。
    let timer: ReturnType<typeof setInterval> | null = null
    const start = () => {
      if (timer === null) timer = setInterval(() => void refetch(), SEATS_POLL_MS)
    }
    const stop = () => {
      if (timer !== null) clearInterval(timer)
      timer = null
    }
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        stop()
        return
      }
      void refetch()
      start()
    }
    if (document.visibilityState !== 'hidden') start()
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      controller.abort()
      if (roomRef.current?.controller === controller) roomRef.current = null
      claimingRef.current = false
      stop()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [projectId, me, active, generation])

  const claim = useCallback(
    (seatIndex: number) => {
      const room = roomRef.current
      const current = stateRef.current
      if (room === null || claimingRef.current || current.phase !== 'ready' || !canClaim({ ...current, me })) return
      const { key, controller } = room
      claimingRef.current = true
      const update = (patch: (s: Ready) => Ready) => setStored((r) => (r !== null && r.key === key && r.state.phase === 'ready' ? { key, state: patch(r.state) } : r))
      update((s) => ({ ...s, claiming: seatIndex, feedback: null }))
      const dead = () => controller.signal.aborted
      const settle = (patch: (s: Ready) => Ready) => {
        claimingRef.current = false
        if (!dead()) update((s) => patch({ ...s, claiming: null }))
      }
      const refetch = async () => {
        try {
          const seats = await listSeats(projectId, { signal: controller.signal })
          if (!dead()) update((s) => ({ ...s, seats }))
        } catch {
          // 留舊的
        }
      }
      void claimSeat(projectId, { seat_index: seatIndex, desk_template: 0 }).then(
        async () => {
          settle((s) => s)
          await refetch()
        },
        async (cause: unknown) => {
          if (isAbort(cause)) return settle((s) => s)
          const at = Date.now()
          // 哪一種失敗看 `toUiError().kind`（`FE-X03`：不自己比 status）；兩種 409 再看 `detail` 的字（`classify409` 是唯一讀它的地方）
          const ui = toUiError(cause)
          if (ui.kind === 'conflict') {
            const kind = classify409(ui.detail ?? null)
            settle((s) => ({ ...s, feedback: kind === 'unknown' ? { kind: 'failed', at, cause } : { kind, at } }))
            await refetch()
            return
          }
          if (ui.kind === 'permission-denied' || ui.kind === 'authentication-required') {
            settle((s) => ({ ...s, locked: true, feedback: { kind: 'ticket', at, cause } }))
            return
          }
          settle((s) => ({ ...s, feedback: { kind: 'failed', at, cause } }))
        },
      )
    },
    [projectId, me],
  )
  const retry = useCallback(() => setGeneration((g) => g + 1), [])
  const dismissFeedback = useCallback(() => setStored((r) => (r !== null && r.state.phase === 'ready' && r.state.feedback !== null ? { key: r.key, state: { ...r.state, feedback: null } } : r)), [])
  return { state, claim, retry, dismissFeedback }
}
