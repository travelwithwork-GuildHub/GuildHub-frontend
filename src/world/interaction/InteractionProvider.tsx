'use client'

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import { createInteractableRegistry, type InteractableRegistry } from './registry'

// 互動層的共用狀態。規格 `FE-W06`。
//
// ⚠️ **這個 provider 在 `<Canvas>` 外面。** 提示是 DOM
// （`CONTEXT.md`：3D 負責空間，DOM 負責產品操作），而 3D 那一半在 Canvas 裡面 ——
// 兩邊要看到同一份狀態，所以 provider 必須包住兩者。

/** 目前的互動目標。**`id` 是 `null` 時 `distance` 也是 `null`**，不是 0。 */
export interface ActiveTarget {
  id: string | null
  label: string | null
  distance: number | null
}

const NO_TARGET: ActiveTarget = { id: null, label: null, distance: null }

interface InteractionValue {
  registry: InteractableRegistry
  target: ActiveTarget
  setTarget: (target: ActiveTarget) => void
}

const InteractionContext = createContext<InteractionValue | null>(null)

export function useInteraction(): InteractionValue {
  const value = useContext(InteractionContext)
  if (value === null) {
    // **明顯失敗，不要回一個空的預設值。** 回預設值的話，忘了包 provider 的
    // 症狀是「按 E 沒反應」，而那跟 id 重複、跟目標選擇壞掉長得一模一樣。
    throw new Error('useInteraction 必須在 <InteractionProvider> 底下使用。')
  }
  return value
}

export function InteractionProvider({ children }: { children: ReactNode }) {
  // 註冊表建立一次就不換掉 —— 用 `useState` 的 lazy initializer 而不是
  // `useRef`，理由跟 `RemoteWorld` 一樣：`react-hooks/refs` 擋掉
  // 在 render 期間讀 ref，而那條規則是對的。
  const [registry] = useState(createInteractableRegistry)
  // **目標進 React**（低頻，走過去才變）。位置每幀變的那一半不在這裡。
  const [target, setTarget] = useState<ActiveTarget>(NO_TARGET)

  const value = useMemo(() => ({ registry, target, setTarget }), [registry, target])

  return <InteractionContext.Provider value={value}>{children}</InteractionContext.Provider>
}

export { NO_TARGET }
