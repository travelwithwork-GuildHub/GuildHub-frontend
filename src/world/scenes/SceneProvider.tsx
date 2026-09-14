'use client'

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { useIdentity } from '@/identity/IdentityProvider'
import { heldRoomToken } from './roomTokens'
import { SceneRefProvider } from './SceneContext'
import type { SceneRef } from './registry'
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
// 過場（覆蓋層、鎖輸入、失敗處置）是 `--transition` 那一片，會接在這個 provider 上，不另開一份狀態。

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
  readonly enterRoom: (projectId: string, mode?: UrlMode) => void
  readonly returnToHall: (mode?: UrlMode) => void
  /** popstate：網址已經是那樣了，狀態跟上；不寫網址。 */
  readonly applyUrl: (room: string | null) => void
  /**
   * 網址那一層在把「沒票的 `?room=`」canonical 成 `/world` 之後呼叫：願望收斂成大廳、被擋的那間留在 `deniedRoom`
   * 給說明用。**沒有這一步的話願望會一直留著** —— 之後任何讓推導重跑的事（換帳號成剛好有票的人）都會把人送進去。
   */
  readonly settleDenied: () => void
}

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
}

/** 跟 `ListPanelProvider.initialRoute` 同一個做法：掛載那一刻就知道網址。伺服器上沒有網址 → 大廳；
 *  客戶端第一次 render 身分一定還是 `unknown`，實際場景同樣是大廳 —— 兩邊的輸出一樣，不會 hydration 對不上。 */
function initialDesired(): Desired {
  // 深連結：網址說的就是想去的；網址已經是那樣了，所以是 replace（canonical），不多一層。
  const room = typeof window === 'undefined' ? null : parseWorldUrl(window.location.search).room
  return { ref: refOf(room), mode: 'replace', forProfile: undefined }
}

export function SceneProvider({ children }: { children: ReactNode }) {
  const [desired, setDesired] = useState<Desired>(initialDesired)
  const identity = useIdentity()
  // `undefined`：還沒問完；`null`：問完了，沒有身分（匿名進不了房間：票的持有人比對對不上任何一張）。
  const profileId =
    identity.state === 'signed-in' ? identity.profile.id : identity.state === 'unknown' ? undefined : null

  const enterRoom = useCallback(
    (projectId: string, mode: UrlMode = 'push') => {
      setDesired({ ref: { id: 'room', projectId }, mode, forProfile: profileId })
    },
    [profileId],
  )
  const returnToHall = useCallback((mode: UrlMode = 'push') => {
    setDesired({ ref: HALL, mode, forProfile: undefined })
  }, [])
  const applyUrl = useCallback(
    (room: string | null) => {
      setDesired({ ref: refOf(room), mode: 'replace', forProfile: profileId })
    },
    [profileId],
  )
  const settleDenied = useCallback(() => {
    setDesired((prev) =>
      prev.ref.id === 'room' ? { ref: HALL, mode: 'replace', forProfile: undefined, denied: prev.ref.projectId } : prev,
    )
  }, [])

  const value = useMemo<SceneValue>(() => {
    const actions = { enterRoom, returnToHall, applyUrl, settleDenied }
    const desiredRoom = desired.ref.id === 'room' ? desired.ref.projectId : null
    if (desired.ref.id === 'hall') {
      return { scene: HALL, desiredRoom, token: undefined, settled: true, deniedRoom: desired.denied ?? null, urlMode: desired.mode, ...actions }
    }
    if (profileId === undefined) {
      return { scene: HALL, desiredRoom, token: undefined, settled: false, deniedRoom: null, urlMode: desired.mode, ...actions }
    }
    // 換了身分（含登出）：別人的願望不跟著過去。
    const forSomeoneElse = desired.forProfile !== undefined && desired.forProfile !== profileId
    const token = profileId === null || forSomeoneElse ? null : heldRoomToken(profileId, desired.ref.projectId)
    if (token === null) {
      return { scene: HALL, desiredRoom, token: undefined, settled: true, deniedRoom: desired.ref.projectId, urlMode: 'replace', ...actions }
    }
    return { scene: desired.ref, desiredRoom, token, settled: true, deniedRoom: null, urlMode: desired.mode, ...actions }
  }, [desired, profileId, enterRoom, returnToHall, applyUrl, settleDenied])

  return (
    <Ctx.Provider value={value}>
      <SceneRefProvider scene={value.scene}>{children}</SceneRefProvider>
    </Ctx.Provider>
  )
}
