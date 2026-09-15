'use client'

import { createContext, useContext, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react'
import type { ChatIn } from '@/api/contract/ws'
import type { ChatLog } from './sceneChat'
import { createSceneChatStore, type SceneChatPort } from './sceneChatStore'

// 場景聊天在 React 裡的出口。規格 `FE-R11`（design D1）。
//
// provider 在 `page.tsx`（`SceneProvider` 底下，Canvas 外面）：`FE-K04` 的 UI 在 Canvas 外讀 `useSceneChat()`；
// `WorldCanvas` 用 `useSceneChatPortIfProvided()` 拿 port 當 **prop** 交給 Canvas 裡的 `RemoteWorld`（context 不跨 R3F 的 renderer 邊界，同 `av`／`generation`）。
// 沒有 provider（單獨掛 `WorldCanvas` 的測試、預覽）就沒有聊天：`RemoteWorld` 收到 `undefined` 什麼都不接。

interface SceneChatValue {
  readonly log: ChatLog
  readonly send: (input: ChatIn) => void
  readonly port: SceneChatPort
}

const Ctx = createContext<SceneChatValue | null>(null)

export function SceneChatProvider({ children }: { children: ReactNode }) {
  const [store] = useState(createSceneChatStore)
  const log = useSyncExternalStore(store.subscribe, store.getLog, store.getLog)
  const value = useMemo<SceneChatValue>(() => ({ log, send: store.send, port: store.port }), [log, store])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

/** `FE-K04` 的 UI 用：目前場景的訊息與送出。 */
export function useSceneChat(): SceneChatValue {
  const value = useContext(Ctx)
  if (value === null) throw new Error('useSceneChat 必須在 <SceneChatProvider> 底下使用。')
  return value
}

/** `WorldCanvas` 用：交給 `RemoteWorld` 的 port；沒有 provider 就是 `undefined`（沒有聊天）。 */
export function useSceneChatPortIfProvided(): SceneChatPort | undefined {
  return useContext(Ctx)?.port
}
