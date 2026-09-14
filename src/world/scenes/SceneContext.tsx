'use client'

import { createContext, useContext, type ReactNode } from 'react'
import type { SceneRef } from './registry'

// 「現在在哪個場景」的單一來源。規格 `FE-V01-S03`。
//
// 這一片只有**讀**：預設是 Guild Hall，過場（換場景、覆蓋層、失敗處置）是 `--transition` 那一片。
// 沒有 provider 的地方也能運作 —— 世界不會因為少了它就不是 Guild Hall。

const HALL: SceneRef = { id: 'hall' }
const Ctx = createContext<SceneRef>(HALL)

export function SceneRefProvider({ scene, children }: { scene: SceneRef; children: ReactNode }) {
  return <Ctx.Provider value={scene}>{children}</Ctx.Provider>
}

export function useSceneRef(): SceneRef {
  return useContext(Ctx)
}
