'use client'

import type {} from '@react-three/fiber'
import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import type { Group } from 'three'
import type { Facing } from '@/world/coords'
import type { RemoteMotion } from '@/realtime/remotePlayers'
import { evaluate } from '@/realtime/interpolation'
import { ChibiPlayer } from './ChibiPlayer'
import { FACING_ROTATION } from './facing'

// 一個遠端角色。規格 FE-R07。
//
// ⚠️ **座標與朝向不是 props。** 它只收一個穩定的 `id`，
// 在 render loop 裡自己去讀 —— 位置每秒變 10 次，當成 props 傳
// 就是每秒 10 次 React 重繪 × 40 個角色（`CONTEXT.md`：高頻資料不進 React）。
//
// ⚠️ **位置是求值出來的，不是複製過來的**（`FE-R08`）。
// `motion` 裡放的是一段樣本歷史，畫面位置由 `evaluate` 從
// `now() − 250ms` 這個游標算出來 —— 直接讀最後一筆的話，
// 角色會回到每 100 毫秒跳一格。
//
// ⚠️ **`now` 必須跟寫入樣本用的是同一個時間來源。** 這裡刻意不用
// `useFrame` 給的 `state.clock`：它跟寫入端的時鐘原點不同、暫停行為不同，
// 相減得到的數字沒有意義 —— 而症狀是「插值瞬間完成」或「永遠不開始」，
// **沒有任何錯誤訊息**。
//
// 還是**沒有走路動畫**：判斷「這個人在不在走」現在有了樣本歷史就做得到，
// 但動畫狀態機是 `FE-W08`／`FE-W14` 的範圍。在這裡先做一個近似值，
// 之後會變成兩份互相打架的判斷。

export interface RemotePlayerProps {
  id: string
  /**
   * 動態資料。**傳的是那個 Map 本身**（它的身分是穩定的，只被就地改寫），
   * 所以這個 prop 不會造成重繪。
   */
  motion: ReadonlyMap<string, RemoteMotion>
  /** 單調時間來源。**與寫入樣本用的是同一個。** */
  now: () => number
  /**
   * 這個人的 `av`。規格 `avatar-appearance`（`FE-W19`）。
   *
   * ⚠️ **這個可以當 prop 傳，位置不行。** `av` 只在名單改變時變
   *（join / leave 才動），而位置每秒變十次 —— 後者當 prop 傳會是
   * 每秒 10 次 React 重繪 × 40 個角色。
   */
  av?: unknown
}

export function RemotePlayer({ id, motion, now, av }: RemotePlayerProps) {
  const rootRef = useRef<Group>(null)

  useFrame(() => {
    const root = rootRef.current
    // ⚠️ **這一行是 TypeScript 的型別收斂，不是執行期防禦。**
    // `useRef<Group>(null)` 的型別是 `Group | null`，不寫它編譯不過 ——
    // 但它**到不了**：量過，元件卸載之後它的 `useFrame` 完全不再被呼叫，
    // 而且 ref 從來沒有是 null 過（連第一幀都不是）。React 的 commit 是同步的，
    // rAF 不會插進它中間。**所以不要在這裡寫「防卸載競態」** ——
    // 那句話會讓下一個人照著錯的心智模型寫出一條永遠不會紅的測試（`FE-R08-S20` 的前一版）。
    if (!root) return

    const track = motion.get(id)
    // ⚠️ **這一行才是真正在擋競態的那一個**（`FE-R08-S20`）。
    // `leave` **同步**刪掉 `motion` 的 entry，而角色要等 React 依新名單重繪
    // 才卸載 —— 中間有一段「元件還在、樣本已經沒了」的空窗。
    // 拿掉它，下一幀就在 `evaluate(undefined, …)` 拋 `TypeError`。
    //
    // 同一行也涵蓋「名單上有、但動態還沒到」（理論上不會發生：`snapshot`
    // 與 `join` 都帶座標）。兩種情況都**保持上一個位置**，不要跳回原點。
    if (track === undefined) return

    const pose = evaluate(track, now())
    // 樣本全部被清掉的瞬間也會是 null。同樣保持上一個位置。
    if (pose === null) return

    root.position.x = pose.x
    root.position.z = pose.z
    root.rotation.y = FACING_ROTATION[pose.f as Facing] ?? 0
  })

  return (
    <group ref={rootRef}>
      <ChibiPlayer av={av} />
    </group>
  )
}
