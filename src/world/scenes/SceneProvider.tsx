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
// 票的持有是**推導**（每次 render 讀 `sessionStorage`），不是複製一份進 state：兩份會漂。
//
// 網址怎麼寫（push／replace）由這裡的 `urlMode` 說，寫的動作在 `WorldUrlSync`（單一寫入者）。
// 過場（覆蓋層、鎖輸入、失敗處置）是 `--transition` 那一片，會接在這個 provider 上，不另開一份狀態。

export type UrlMode = 'push' | 'replace'

export interface SceneValue {
  /** 實際渲染、實際連線的場景。 */
  readonly scene: SceneRef
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
}

const HALL: SceneRef = { id: 'hall' }
const refOf = (room: string | null): SceneRef => (room === null ? HALL : { id: 'room', projectId: room })

/** 沒有 provider 的地方：永遠在大廳、動作是 no-op。既有的測試不用改。 */
const DEFAULT: SceneValue = {
  scene: HALL,
  token: undefined,
  settled: true,
  deniedRoom: null,
  urlMode: 'replace',
  enterRoom: () => {},
  returnToHall: () => {},
  applyUrl: () => {},
}
const Ctx = createContext<SceneValue>(DEFAULT)

export function useScene(): SceneValue {
  return useContext(Ctx)
}

interface Desired {
  readonly ref: SceneRef
  readonly mode: UrlMode
}

function initialDesired(): Desired {
  // 深連結：網址說的就是想去的；網址已經是那樣了，所以是 replace（canonical），不多一層。
  const room = typeof window === 'undefined' ? null : parseWorldUrl(window.location.search).room
  return { ref: refOf(room), mode: 'replace' }
}

export function SceneProvider({ children }: { children: ReactNode }) {
  const [desired, setDesired] = useState<Desired>(initialDesired)
  const identity = useIdentity()
  // `undefined`：還沒問完；`null`：問完了，沒有身分（匿名進不了房間：票的持有人比對對不上任何一張）。
  const profileId =
    identity.state === 'signed-in' ? identity.profile.id : identity.state === 'unknown' ? undefined : null

  const enterRoom = useCallback((projectId: string, mode: UrlMode = 'push') => {
    setDesired({ ref: { id: 'room', projectId }, mode })
  }, [])
  const returnToHall = useCallback((mode: UrlMode = 'push') => {
    setDesired({ ref: HALL, mode })
  }, [])
  const applyUrl = useCallback((room: string | null) => {
    setDesired({ ref: refOf(room), mode: 'replace' })
  }, [])

  const value = useMemo<SceneValue>(() => {
    const actions = { enterRoom, returnToHall, applyUrl }
    if (desired.ref.id === 'hall') {
      return { scene: HALL, token: undefined, settled: true, deniedRoom: null, urlMode: desired.mode, ...actions }
    }
    if (profileId === undefined) {
      return { scene: HALL, token: undefined, settled: false, deniedRoom: null, urlMode: desired.mode, ...actions }
    }
    const token = profileId === null ? null : heldRoomToken(profileId, desired.ref.projectId)
    if (token === null) {
      return { scene: HALL, token: undefined, settled: true, deniedRoom: desired.ref.projectId, urlMode: 'replace', ...actions }
    }
    return { scene: desired.ref, token, settled: true, deniedRoom: null, urlMode: desired.mode, ...actions }
  }, [desired, profileId, enterRoom, returnToHall, applyUrl])

  return (
    <Ctx.Provider value={value}>
      <SceneRefProvider scene={value.scene}>{children}</SceneRefProvider>
    </Ctx.Provider>
  )
}
