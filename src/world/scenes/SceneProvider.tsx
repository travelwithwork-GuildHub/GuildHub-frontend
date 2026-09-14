'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useIdentity } from '@/identity/IdentityProvider'
import { heldRoomToken } from './roomTokens'
import { SceneRefProvider } from './SceneContext'
import { sameScene, sceneOf, type SceneRef } from './registry'
import { parseWorldUrl } from './urlState'

// 「現在想去哪、實際在哪」。規格 `FE-V01-S09`／`S13`／`S14`（design D2、D5）。
//
// **想去（`desired`）與實際（`scene`）是兩件事。** 想去房間但沒有票 → 實際在大廳，並記下「被擋的那間」
// 給說明用；身分還沒問完 → 實際先在大廳，但**還沒定案**（`settled: false`）—— 那時網址那一層不得把 `room` 洗掉。
//
// 票在**決定的那一刻**讀（想去的變了、或身分變了才重算），不複製一份進 state。
// 所以拿到票之後要**再叫一次 `enterRoom()`**（`FE-N08` 的 `enter` 成功時就是這樣做）—— 光把票寫進
// `sessionStorage` 不會有任何事發生，而那是刻意的：沒有人要求的情況下不該自動進房。
//
// 「想去某間房」綁著**提出的那個身分**（`forProfile`）：被擋之後換了帳號，那個願望不跟著過去 ——
// 否則換成一個剛好有票的人會被自動送進一間他沒要求進的房。身分還沒問完時提出的（深連結）綁給問完的那個人。
//
// 網址怎麼寫（push／replace）由這裡的 `urlMode` 說，寫的動作在 `WorldUrlSync`（單一寫入者）。
//
// **過場**（design D3、D4）：`committed` 是「上一次連線 `ready` 的場景」；實際場景跟它不同就是在過場中
// （`transition` 是**推導**，不是另一份 state）。結束條件三選一：目標場景的連線 `ready` → 提交；目標是房間而連線在
// `open` 之前就關（握手被拒）→ 失敗：願望改回大廳（replace）、留一則通知、**票留著**；自 `connect()` 起
// `timeoutMs`（預設 10 秒）沒 `ready` → 同失敗。目標是大廳而連不上 → 只結束過場，交給大廳既有的呈現（`S16`）。
// 事件都帶著 scene 參數比對，不是目標場景的一律忽略（`S15`）；逾時 callback 也查最新狀態，不靠取消。

export type UrlMode = 'push' | 'replace'

export interface SceneValue {
  /** 實際渲染、實際連線的場景。 */
  readonly scene: SceneRef
  /** 想去的房間（網址說的、或使用者要求的）；跟 `scene` 可能不同（沒票、身分沒問完）。網址那一層比對的是**這個**。 */
  readonly desiredRoom: string | null
  /** 實際場景的票（只有房間有）。 */
  readonly token: string | undefined
  /** 身分問完了嗎（想去大廳時一律 `true`）。`false` 時網址那一層不動網址。 */
  readonly settled: boolean
  /** 想去、但沒有票所以進不去的那間房；`null` 代表沒有這回事。 */
  readonly deniedRoom: string | null
  /** 上一次改變場景時，網址該 push 還是 replace。 */
  readonly urlMode: UrlMode
  readonly enterRoom: (projectId: string, options?: EnterOptions) => void
  readonly returnToHall: (mode?: UrlMode) => void
  /** popstate：網址已經是那樣了，狀態跟上；不寫網址。 */
  readonly applyUrl: (room: string | null) => void
  /**
   * 網址那一層在把「沒票的 `?room=`」canonical 成 `/world` 之後呼叫：願望收斂成大廳、被擋的那間留在 `deniedRoom`
   * 給說明用。**沒有這一步的話願望會一直留著** —— 之後任何讓推導重跑的事（換帳號成剛好有票的人）都會把人送進去。
   */
  readonly settleDenied: () => void
  /** 過場中：從哪裡到哪裡、目的地叫什麼。`null` 代表不在過場。 */
  readonly transition: { readonly from: SceneRef; readonly to: SceneRef; readonly title: string | null } | null
  /**
   * 過場的代號：第幾次願望（每次 `enterRoom`／`returnToHall`／`applyUrl`／失敗回大廳 +1）。
   * 逾時計時器帶著排下時的代號，觸發時比對 —— 同一間房連試兩次，舊的 callback 不得打敗新的一場（`S15`）。
   * 覆蓋層也靠它知道「新的一場開始了」。
   */
  readonly transitionSeq: number
  /** 最近一次願望的目的地名字（房間標題）；提交之後覆蓋層的最短顯示期間還要用它。 */
  readonly destinationTitle: string | null
  /** 進不去的通知（`S07`）。留到成功進入任何場景、使用者關閉、或被取代。 */
  readonly notice: { readonly kind: 'failed'; readonly room: string } | null
  readonly dismissNotice: () => void
  /** 預設門禁的說明（`S11`）：對著哪間房的門按了 E 但沒有票。下一個願望出現就清。 */
  readonly gateNotice: string | null
  readonly showGateNotice: (projectId: string) => void
  /** `RemoteWorld` 回報連線事件（帶著它連的 scene 參數）。**身分穩定**：它在 `RemoteWorld` 的 effect 依賴裡。 */
  readonly reportConnection: (event: ConnectionEvent, wsScene: string) => void
}

export interface EnterOptions {
  readonly mode?: UrlMode
  /** 目的地的名字（房間標題），覆蓋層用；門知道、深連結不知道（那時叫「專案房間」）。 */
  readonly title?: string
}

export type ConnectionEvent =
  /** 呼叫了 `connect()`（等完舊 socket 的 close 之後）—— 10 秒逾時從這一刻起算（`S06`）。 */
  | { readonly kind: 'connecting' }
  | { readonly kind: 'ready' }
  | { readonly kind: 'closed'; readonly opened: boolean }

export const TRANSITION_TIMEOUT_MS = 10_000

const HALL: SceneRef = { id: 'hall' }
const refOf = (room: string | null): SceneRef => (room === null ? HALL : { id: 'room', projectId: room })

/** 沒有 provider 的地方：永遠在大廳、動作是 no-op。既有的測試不用改。 */
const DEFAULT: SceneValue = {
  scene: HALL,
  desiredRoom: null,
  token: undefined,
  settled: true,
  deniedRoom: null,
  urlMode: 'replace',
  enterRoom: () => {},
  returnToHall: () => {},
  applyUrl: () => {},
  settleDenied: () => {},
  transition: null,
  transitionSeq: 0,
  destinationTitle: null,
  notice: null,
  dismissNotice: () => {},
  gateNotice: null,
  showGateNotice: () => {},
  reportConnection: () => {},
}
const Ctx = createContext<SceneValue>(DEFAULT)

export function useScene(): SceneValue {
  return useContext(Ctx)
}

interface Desired {
  readonly ref: SceneRef
  readonly mode: UrlMode
  /** 提出這個願望的身分；`undefined` 是「身分還沒問完時提出的」（深連結），綁給問完的那個人。 */
  readonly forProfile: string | null | undefined
  /** 上一個願望被擋的那間房（`settleDenied` 之後）；下一個願望出現就清掉。 */
  readonly denied?: string
  /** 目的地的名字（覆蓋層用）。 */
  readonly title?: string
  /**
   * 這個願望是**系統自動**提出的（失敗後回大廳）。它的 `ready` 不算「成功進入」—— 不清通知：
   * 否則通知在出現後幾毫秒（大廳 `hello` 到）就消失，沒有人看得到它。
   */
  readonly auto?: boolean
}

/** 跟 `ListPanelProvider.initialRoute` 同一個做法：掛載那一刻就知道網址。伺服器上沒有網址 → 大廳；
 *  客戶端第一次 render 身分一定還是 `unknown`，實際場景同樣是大廳 —— 兩邊的輸出一樣，不會 hydration 對不上。 */
function initialDesired(): Desired {
  // 深連結：網址說的就是想去的；網址已經是那樣了，所以是 replace（canonical），不多一層。
  const room = typeof window === 'undefined' ? null : parseWorldUrl(window.location.search).room
  return { ref: refOf(room), mode: 'replace', forProfile: undefined }
}

export function SceneProvider({ children, timeoutMs = TRANSITION_TIMEOUT_MS }: { children: ReactNode; timeoutMs?: number }) {
  const [desired, setDesired] = useState<Desired>(initialDesired)
  // 上一次 `ready` 的場景。一開始就是大廳：大廳的第一次連線不算過場（那是 `FE-W01` 的載入畫面）。
  const [committed, setCommitted] = useState<SceneRef>(HALL)
  const [notice, setNotice] = useState<SceneValue['notice']>(null)
  const [gateNotice, setGateNotice] = useState<string | null>(null)
  const [transitionSeq, setTransitionSeq] = useState(0)
  const identity = useIdentity()
  // `undefined`：還沒問完；`null`：問完了，沒有身分（匿名進不了房間：票的持有人比對對不上任何一張）。
  const profileId =
    identity.state === 'signed-in' ? identity.profile.id : identity.state === 'unknown' ? undefined : null

  const enterRoom = useCallback(
    (projectId: string, { mode = 'push', title }: EnterOptions = {}) => {
      setDesired({ ref: { id: 'room', projectId }, mode, forProfile: profileId, title })
      setTransitionSeq((n) => n + 1)
      setGateNotice(null)
    },
    [profileId],
  )
  const returnToHall = useCallback((mode: UrlMode = 'push') => {
    setDesired({ ref: HALL, mode, forProfile: undefined })
    setTransitionSeq((n) => n + 1)
    setGateNotice(null)
  }, [])
  const applyUrl = useCallback(
    (room: string | null) => {
      setDesired({ ref: refOf(room), mode: 'replace', forProfile: profileId })
      setTransitionSeq((n) => n + 1)
      setGateNotice(null)
    },
    [profileId],
  )
  const dismissNotice = useCallback(() => setNotice(null), [])
  // 門禁的說明也是「下一則通知」：取代還留著的失敗通知（`S07`），不並排兩則。
  const showGateNotice = useCallback((projectId: string) => {
    setGateNotice(projectId)
    setNotice(null)
  }, [])
  const settleDenied = useCallback(() => {
    setDesired((prev) =>
      prev.ref.id === 'room' ? { ref: HALL, mode: 'replace', forProfile: undefined, denied: prev.ref.projectId } : prev,
    )
  }, [])

  // 實際場景的推導（想去 × 身分 × 票）。
  const resolved = useMemo(() => {
    const desiredRoom = desired.ref.id === 'room' ? desired.ref.projectId : null
    if (desired.ref.id === 'hall') {
      return { scene: HALL, desiredRoom, token: undefined, settled: true, deniedRoom: desired.denied ?? null, urlMode: desired.mode }
    }
    if (profileId === undefined) {
      return { scene: HALL, desiredRoom, token: undefined, settled: false, deniedRoom: null, urlMode: desired.mode }
    }
    // 換了身分（含登出）：別人的願望不跟著過去。
    const forSomeoneElse = desired.forProfile !== undefined && desired.forProfile !== profileId
    const token = profileId === null || forSomeoneElse ? null : heldRoomToken(profileId, desired.ref.projectId)
    if (token === null) {
      return { scene: HALL, desiredRoom, token: undefined, settled: true, deniedRoom: desired.ref.projectId, urlMode: 'replace' as UrlMode }
    }
    return { scene: desired.ref, desiredRoom, token, settled: true, deniedRoom: null, urlMode: desired.mode }
  }, [desired, profileId])

  const transition = useMemo(
    () => (sameScene(resolved.scene, committed) ? null : { from: committed, to: resolved.scene, title: desired.title ?? null }),
    [resolved.scene, committed, desired.title],
  )

  // 過場的結束（D3、D4）。**讀最新狀態用 ref**：`reportConnection` 要身分穩定（它在 `RemoteWorld` 的 effect 依賴裡，
  // 換一個就重連），逾時 callback 也要查「現在還在不在那個過場」而不是相信自己沒被取消（`S15`）。
  const latest = useRef({ transition, scene: resolved.scene, profileId, auto: desired.auto === true, seq: transitionSeq })
  useEffect(() => {
    latest.current = { transition, scene: resolved.scene, profileId, auto: desired.auto === true, seq: transitionSeq }
  })
  /** 失敗。`seq` 是排下這個判定時的過場代號：代號不對就是遲到的，忽略。 */
  const fail = useCallback((seq: number, target: SceneRef) => {
    const { transition, scene, profileId } = latest.current
    if (seq !== latest.current.seq) return
    if (transition === null || !sameScene(transition.to, target) || !sameScene(scene, target)) return
    if (target.id === 'room') {
      // 握手被拒／逾時：回大廳（replace，不多一層）、通知、**票留著**（連不上跟票失效分不出來）。
      setDesired({ ref: HALL, mode: 'replace', forProfile: profileId, auto: true })
      setTransitionSeq((n) => n + 1)
      setNotice({ kind: 'failed', room: target.projectId })
      return
    }
    // 回大廳也連不上：過場仍然結束，交給大廳既有的呈現；不再建第三條（`S16`）。
    setCommitted(HALL)
  }, [])
  // 逾時計時器。**從 `connect()` 那一刻起算**（等舊 socket 的 close 那 ≤1 秒不算，`S06`），帶著當時的代號；
  // 提交或失敗就清掉 —— 清掉只是省事，防禦在 `fail()` 的代號比對（`S15`：舊 callback 被硬叫也不算數）。
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const clearTimer = () => {
    if (timeoutRef.current !== null) clearTimeout(timeoutRef.current)
    timeoutRef.current = null
  }
  useEffect(() => clearTimer, [])
  const reportConnection = useCallback(
    (event: ConnectionEvent, wsScene: string) => {
      const { transition, scene, auto, seq } = latest.current
      if (transition === null || sceneOf(scene).wsScene !== wsScene) return
      if (event.kind === 'connecting') {
        clearTimer()
        const target = scene
        timeoutRef.current = setTimeout(() => fail(seq, target), timeoutMs)
        return
      }
      if (event.kind === 'ready') {
        clearTimer()
        setCommitted(scene)
        if (!auto) setNotice(null) // 使用者要求的、成功進入任何場景都清（`S07`）；失敗後自動回大廳的不算
        return
      }
      if (!event.opened) {
        clearTimer()
        fail(seq, scene)
      }
    },
    [fail, timeoutMs],
  )

  const value = useMemo<SceneValue>(
    () => ({
      ...resolved,
      enterRoom,
      returnToHall,
      applyUrl,
      settleDenied,
      transition,
      transitionSeq,
      destinationTitle: desired.title ?? null,
      notice,
      dismissNotice,
      gateNotice,
      showGateNotice,
      reportConnection,
    }),
    [resolved, enterRoom, returnToHall, applyUrl, settleDenied, transition, transitionSeq, desired.title, notice, dismissNotice, gateNotice, showGateNotice, reportConnection],
  )

  return (
    <Ctx.Provider value={value}>
      <SceneRefProvider scene={value.scene}>{children}</SceneRefProvider>
    </Ctx.Provider>
  )
}
