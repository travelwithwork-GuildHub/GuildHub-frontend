'use client'

import type {} from '@react-three/fiber'
import { useFrame } from '@react-three/fiber'
import { useEffect, useRef, type RefObject } from 'react'
import type { LocalPose } from '@/world/PositionSync'
import type { Facing } from '@/world/coords'
import { useInteraction, NO_TARGET, type ActiveTarget } from './InteractionProvider'
import { chooseTarget } from './target'
import { TUNING } from './tuning'

// 每幀算出「現在對著誰」，並在**目標真的改變時**才通知 React。規格 `FE-W06`。
//
// ⚠️ **這個元件不渲染任何東西。** 它在 Canvas 裡面，因為它要 `useFrame`；
// 提示的呈現在 Canvas 外面（`InteractionPrompt`）。
//
// ⚠️ **遲滯與這裡的比對是兩層防護，不是重複**（design 的 D4）：
//
//   沒有遲滯、只有比對 → 邊界上目標**真的**每幀在換，比對擋不住
//   有遲滯、沒有比對   → 目標沒變也每幀 setState
//
// `FE-W06-S04` 驗前者，`FE-W06-S08` 驗後者。

export interface SpatialInteractionProps {
  /** 本地角色的權威狀態，由 `LocalPlayer` 每幀寫入。 */
  poseRef: RefObject<LocalPose>
}

export function SpatialInteraction({ poseRef }: SpatialInteractionProps) {
  const { registry, setTarget, inputLockRef } = useInteraction()
  /** 上一幀的目標 id。**這道比對就是「不進 React」的那一半。** */
  const previous = useRef<string | null>(null)
  /** 給按鍵處理讀的目前目標。**用 ref 不用 state** —— 監聽器只掛一次，
   *  讀 state 會讀到掛上去那一刻的閉包值。 */
  const currentId = useRef<string | null>(null)

  useFrame(() => {
    const pose = poseRef.current
    const result = chooseTarget(
      { x: pose.x, z: pose.z, f: pose.f as Facing },
      registry.entries.values(),
      previous.current,
      TUNING,
    )

    currentId.current = result.id
    if (result.id === previous.current) return

    previous.current = result.id
    if (result.id === null) {
      setTarget(NO_TARGET)
      return
    }
    const entry = registry.entries.get(result.id)
    const next: ActiveTarget = {
      id: result.id,
      label: entry?.label ?? result.id,
      distance: result.distance,
    }
    setTarget(next)
  })

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // **是 `code` 不是 `key`** —— 讀的是實體鍵位，跟鍵盤配置無關。
      if (e.code !== 'KeyE') return
      // 鎖著就不動作（規格 `FE-X06-S05`）：面板開著、或某個文字輸入框有焦點 ——
      // 後者打一個 `e` 字母不該開出一個面板。**也不 `preventDefault`**，那個字要進得了欄位。
      if (inputLockRef.current) return
      const id = currentId.current
      if (id === null) return
      // ⚠️ **再查一次註冊表**（規格 `FE-W06-S12`）。
      // 物件可能在這一幀算完之後、按鍵被處理之前就註銷了 ——
      // 直接拿快取的 callback 會觸發一個已經不存在的東西。
      const entry = registry.entries.get(id)
      if (entry === undefined) return
      entry.onInteract?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [registry, inputLockRef])

  return null
}
