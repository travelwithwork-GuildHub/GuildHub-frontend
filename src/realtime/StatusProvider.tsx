'use client'

import { createContext, useContext, useState, useSyncExternalStore, type ReactNode } from 'react'
import { createStatusStore, type SetStatusResult, type StatusPort, type StatusSnapshot, type StatusStore } from './statusStore'

// 自己的狀態文字在 React 裡的出口。規格 `FE-K05`（design D1）。
// 跟 `SceneChatProvider` 同一個形狀：provider 在 `page.tsx`（Canvas 外面）；HUD 用 `useStatus()` 訂閱 snapshot；
// `WorldCanvas` 用 `useStatusPortIfProvided()` 拿 port 當 prop 交給 Canvas 裡的 `RemoteWorld`（context 不跨 R3F 的邊界）。
// 沒有 provider（單獨掛 `WorldCanvas` 的測試、預覽）就沒有狀態：`RemoteWorld` 收到 `undefined` 什麼都不接。
// **跨場景不清**：狀態是人的，不是場景的（跟 chat 相反）—— 換場景只是換連線、重送。

const Ctx = createContext<StatusStore | null>(null)

/** `store` 只給測試注入（要對同一個 store 送回聲）；正式碼不傳。 */
export function StatusProvider({ children, store: injected }: { children: ReactNode; store?: StatusStore }) {
  const [own] = useState(createStatusStore)
  const store = injected ?? own
  return <Ctx.Provider value={store}>{children}</Ctx.Provider>
}

export interface StatusApi {
  readonly snapshot: StatusSnapshot
  readonly set: (text: string) => SetStatusResult
  readonly clear: () => SetStatusResult
}

const OFFLINE: StatusSnapshot = { text: '', pending: null, online: false }
const NO_STORE = { subscribe: () => () => {}, getSnapshot: () => OFFLINE }

/** HUD 用：沒有 provider 回 `null`（不畫控制）；有的話隨 snapshot 重繪。 */
export function useStatusIfProvided(): StatusApi | null {
  const store = useContext(Ctx)
  const source = store ?? NO_STORE
  const snapshot = useSyncExternalStore(source.subscribe, source.getSnapshot, source.getSnapshot)
  return store === null ? null : { snapshot, set: store.set, clear: store.clear }
}

/** `WorldCanvas` 用：交給 `RemoteWorld` 的 port（穩定的物件；不訂閱）；沒有 provider 就是 `undefined`。 */
export function useStatusPortIfProvided(): StatusPort | undefined {
  return useContext(Ctx)?.port
}
