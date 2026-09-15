'use client'

import { createContext, useContext, useState, useSyncExternalStore, type ReactNode } from 'react'
import type { ChatIn } from '@/api/contract/ws'
import type { ChatLog } from './sceneChat'
import { createSceneChatStore, type SceneChatPort, type SceneChatStore } from './sceneChatStore'

// 場景聊天在 React 裡的出口。規格 `FE-R11`（design D1）。
//
// provider 在 `page.tsx`（`SceneProvider` 底下，Canvas 外面）：`FE-K04` 的 UI 在 Canvas 外讀 `useSceneChat()`；
// `WorldCanvas` 用 `useSceneChatPortIfProvided()` 拿 port 當 **prop** 交給 Canvas 裡的 `RemoteWorld`（context 不跨 R3F 的 renderer 邊界，同 `av`／`generation`）。
// 沒有 provider（單獨掛 `WorldCanvas` 的測試、預覽）就沒有聊天：`RemoteWorld` 收到 `undefined` 什麼都不接。
//
// ⚠️ context 裡放的是**穩定的 store**，不是 log：訂閱 log 的 `useSyncExternalStore` 在 `useSceneChat()` 裡 —— 只有讀列表的 UI 才隨訊息重繪，
// 拿 port 的 `WorldCanvas`（包著 `<Canvas>`）不會每一則訊息都被拖著重繪（審查抓到的）。

const Ctx = createContext<SceneChatStore | null>(null)

export function SceneChatProvider({ children }: { children: ReactNode }) {
  const [store] = useState(createSceneChatStore)
  return <Ctx.Provider value={store}>{children}</Ctx.Provider>
}

/** `FE-K04` 的 UI 用：目前場景的訊息與送出。這個 hook 的呼叫者隨每一則訊息重繪。 */
export function useSceneChat(): { readonly log: ChatLog; readonly send: (input: ChatIn) => void } {
  const store = useContext(Ctx)
  if (store === null) throw new Error('useSceneChat 必須在 <SceneChatProvider> 底下使用。')
  const log = useSyncExternalStore(store.subscribe, store.getLog, store.getLog)
  return { log, send: store.send }
}

/** `WorldCanvas` 用：交給 `RemoteWorld` 的 port（穩定的物件；不訂閱 log）；沒有 provider 就是 `undefined`（沒有聊天）。 */
export function useSceneChatPortIfProvided(): SceneChatPort | undefined {
  return useContext(Ctx)?.port
}
