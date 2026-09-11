'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react'
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
   * 世界命令（移動、E 互動、之後的熱鍵）要不要停。`true` = 停。規格 `FE-X06`。
   *
   * **是 ref 不是 state** —— `LocalPlayer` 每幀讀它，而它在整個生命週期裡不重繪（`FE-W03-S13`）。
   * **是推導值，不准直接寫** —— 有任何持有者就 `true`。寫它的是 `holdInputLock`。
   */
  inputLockRef: RefObject<boolean>
  /**
   * 取得鎖；回傳釋放函式。規格 `FE-X06-S03`／`S04`。
   *
   * ⚠️ **每一次呼叫是獨立的一次**（token 式，不是 reason 字串的 Set）：同一個 reason 可以同時
   * 持有兩次（StrictMode 雙重掛載、兩個同類面板）。**釋放冪等**：同一個釋放呼叫兩次只移除自己，
   * 不影響別的持有者。`reason` 只給除錯看。
   *
   * 單一 boolean 的鎖是這一列最可能做錯的地方：輸入框還有焦點時關掉一個面板，面板把鎖寫回
   * `false` —— 接著打字就變成走路。
   */
  holdInputLock: (reason: string) => () => void
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
  // 持有者的集合與推導出來的 boolean。都是 ref：每幀讀、不重繪；只在 callback 裡改，不在繪製期間讀。
  const holdersRef = useRef<Set<symbol>>(new Set())
  const inputLockRef = useRef(false)

  const holdInputLock = useCallback((reason: string) => {
    const token = Symbol(reason)
    holdersRef.current.add(token)
    inputLockRef.current = true
    let released = false
    return () => {
      if (released) return
      released = true
      holdersRef.current.delete(token)
      inputLockRef.current = holdersRef.current.size > 0
    }
  }, [])

  // provider 卸載時清空：鎖是 provider 的，不能活得比它久。
  useEffect(
    () => () => {
      holdersRef.current.clear()
      inputLockRef.current = false
    },
    [],
  )

  const value = useMemo(
    () => ({ registry, target, setTarget, inputLockRef, holdInputLock }),
    [registry, target, holdInputLock],
  )

  return <InteractionContext.Provider value={value}>{children}</InteractionContext.Provider>
}

export { NO_TARGET }
