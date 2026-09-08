'use client'

import type {} from '@react-three/fiber'
import { useFrame } from '@react-three/fiber'
import { useRef, useState, type RefObject } from 'react'
import type { RealtimeClient } from '@/realtime/client'
import { createSyncState, markSent, planSend, resetSync } from '@/realtime/positionSync'

// 把自己的位置送出去。規格 FE-R03。
//
// ⚠️ **這個元件不渲染任何東西。** 它只在 render loop 裡取樣、節流、送出。

/** 本地角色每幀的權威狀態。**專用的，不是相機的跟隨目標。** */
export interface LocalPose {
  x: number
  z: number
  /** 協定的離散朝向 0–3。 */
  f: number
}

export interface PositionSyncProps {
  /**
   * 目前的連線，由 `RemoteWorld` 的 effect 維護。
   *
   * **是 ref 不是 `useState` 的物件**：`react-hooks/immutability` 擋掉
   * 改寫 `useState` 拿到的值，而那條規則是對的。傳 ref 當 prop 是允許的
   *（`LocalPlayer` 的 `targetRef` 就是同一個模式），只要**不在 render 期間讀**
   * —— 這裡只在 `useFrame` 裡讀。
   *
   * ⚠️ **client 物件的身分就是 session generation。** 換 scene 時它會被換掉，
   * 而這裡靠比對身分決定要不要重置節流 —— 不需要另外做一個計數器。
   */
  clientRef: RefObject<RealtimeClient | null>
  poseRef: RefObject<LocalPose>
}

export function PositionSync({ clientRef, poseRef }: PositionSyncProps) {
  const [state] = useState(createSyncState)
  /** 上一幀看到的 client。換掉就重置。 */
  const seen = useRef<RealtimeClient | null>(null)

  useFrame((_, dt) => {
    const client = clientRef.current

    if (client !== seen.current) {
      // **換連線一定要重置。** 不重置的話，新連線的第一個位置可能被跳過 ——
      // 如果它剛好跟舊連線最後送出的那一筆相同，去重會判定「沒有變」。
      resetSync(state)
      seen.current = client
    }

    // ⚠️ **先檢查狀態，不要用 try/catch 吞掉 `send` 的錯。**
    // `FE-R01` 的 `send` 在非 `ready` 會拋錯，而這裡是 render loop ——
    // 吞掉的話會把生命週期的 bug 藏起來，而這一層的 bug 症狀本來就是無聲的。
    if (client === null || client.state !== 'ready') return

    const pose = poseRef.current
    const point = planSend(state, { x: pose.x, z: pose.z }, dt * 1000)
    if (point === null) return

    client.send(JSON.stringify({ t: 'move', x: point.x, y: point.y, f: pose.f }))
    // **只有真的送出去之後才更新。** 在 `ready` 之前就更新的話，
    // 那個位置會被永遠跳過。
    markSent(state, point)
  })

  return null
}
