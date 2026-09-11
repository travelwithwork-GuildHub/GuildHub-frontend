'use client'

import { createContext, useContext, useMemo, useState, type ReactNode, type RefObject } from 'react'
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
  /**
   * 世界的移動輸入要不要停。`true` = 停（有 DOM 面板開著，鍵盤是它的）。
   * 規格 `FE-B01-S17`／`S18`。
   *
   * **是 ref 不是 state** —— `LocalPlayer` 每幀讀它，而它在整個生命週期裡
   * 不重繪（`FE-W03-S13`）。寫它的是開面板的那一層，讀它的是角色。
   */
  inputLockRef: RefObject<boolean>
}

const InteractionContext = createContext<InteractionValue | null>(null)

/** 沒有 provider 時的鎖：永遠是開的。世界裡沒有面板就沒有東西會鎖它。 */
const UNLOCKED: RefObject<boolean> = { current: false }

/**
 * 給角色讀的鎖。**沒有 provider 時不拋錯** —— 跟 `useInteraction` 相反：
 * 鎖的持有者（面板）一定在 provider 底下，否則它自己會先炸；
 * 讀的那一方（角色）單獨渲染時沒有面板，鎖永遠是開的是對的答案。
 */
export function useInputLockRef(): RefObject<boolean> {
  return useContext(InteractionContext)?.inputLockRef ?? UNLOCKED
}

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
  // ⚠️ **不得巢狀。** 巢狀的形狀是唯一會**靜默**壞掉的接線錯誤：面板寫外層的鎖、
  // 角色讀內層的鎖，症狀是「面板開著人還在走」，而且沒有任何東西會拋錯。
  // 這個 repo 沒有任何合法的巢狀用法，所以在這裡直接炸（`FE-B01` tasks 第 7 節）。
  if (useContext(InteractionContext) !== null) {
    throw new Error('<InteractionProvider> 不得巢狀：面板與角色會各自拿到不同的鎖。')
  }
  // 註冊表建立一次就不換掉 —— 用 `useState` 的 lazy initializer 而不是
  // `useRef`，理由跟 `RemoteWorld` 一樣：`react-hooks/refs` 擋掉
  // 在 render 期間讀 ref，而那條規則是對的。
  const [registry] = useState(createInteractableRegistry)
  // **目標進 React**（低頻，走過去才變）。位置每幀變的那一半不在這裡。
  const [target, setTarget] = useState<ActiveTarget>(NO_TARGET)
  const [inputLockRef] = useState<RefObject<boolean>>(() => ({ current: false }))

  const value = useMemo(
    () => ({ registry, target, setTarget, inputLockRef }),
    [registry, target, inputLockRef],
  )

  return <InteractionContext.Provider value={value}>{children}</InteractionContext.Provider>
}

export { NO_TARGET }
