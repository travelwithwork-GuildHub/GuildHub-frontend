'use client'

import { useEffect, useState } from 'react'
import { RealtimeClient } from '@/realtime/client'
import { createMessageValidator, type ProtocolViolation } from '@/realtime/protocol'
import {
  applyMessage,
  createRemotePlayersState,
  type RemoteIdentity,
  type RemoteMotion,
} from '@/realtime/remotePlayers'
import { RemotePlayers } from './RemotePlayers'

// 遠端玩家接上連線的地方。規格 FE-R07。
//
// ⚠️ **父層統一收訊息、更新兩個容器；子元件不得各自訂閱。**
// 40 個訂閱者在每則 `pos` 上都會被喚醒一次，而其中 39 個跟自己無關。
//
// ⚠️ **只有名單改變時才 setState。** `applyMessage` 回傳的就是那件事，
// `pos` 一律回 `false` —— 每秒 400 次的位置更新完全不經過 React。

const EMPTY_ROSTER: ReadonlyMap<string, RemoteIdentity> = new Map()

export function RemoteWorld() {
  // **名單進 React**（低頻，決定掛幾個元件）。
  const [roster, setRoster] = useState<ReadonlyMap<string, RemoteIdentity>>(EMPTY_ROSTER)
  // **動態不在 React 裡**（每秒 400 次）。這個容器建立一次就不再換掉，
  // 只被就地改寫 —— 所以它可以當 prop 傳下去而不造成重繪。
  //
  // 用 `useState` 的 lazy initializer 而不是 `useRef`：`react-hooks/refs`
  // 擋掉「在 render 期間讀 ref」（`useRef(...).current` 拿來算 prop 就是那件事），
  // **而那條規則是對的** —— 那樣寫在 concurrent render 下會讀到不該讀的東西。
  // 這裡要的是「建立一次、之後不變」，`useState` 的初始值正好就是那個語意。
  const [state] = useState(createRemotePlayersState)
  const motion: ReadonlyMap<string, RemoteMotion> = state.motion

  useEffect(() => {
    // 違規通報。**必填** —— `FE-R02` 的契約明文寫著它保證不了呼叫端有沒有在看，
    // 所以這裡要真的接上一個東西，而不是傳一個空函式。
    //
    // ⚠️ **接到 console 是暫時的。** 使用者看得見的錯誤呈現是 `FE-X03`（W2）
    // 與 `FE-R12`（W5）—— 在那之前，正式環境沒有人看得到這一行。
    // 那個缺口是知道的，不是忘了。
    const onViolation = (violation: ProtocolViolation, raw: string) => {
      console.warn(`[realtime] 收到不合協定的訊息（${violation}）：`, raw)
    }
    const validate = createMessageValidator(onViolation)

    const client = new RealtimeClient({
      onMessage: (raw) => {
        const result = validate(raw)
        if (!result.ok) return
        // `selfId` 用來把自己排除在遠端玩家之外 —— `snapshot` 裡包含自己。
        if (applyMessage(state, result.message, client.selfId)) {
          // 名單真的變了才重繪。**這是唯一會呼叫 setState 的地方。**
          setRoster(state.roster)
        }
      },
    })
    client.connect()

    return () => {
      client.close()
      // 卸載時把兩個容器都清乾淨 —— 留著的話，重新掛載會先閃出一批舊角色。
      state.motion.clear()
      state.roster = new Map()
      setRoster(EMPTY_ROSTER)
    }
    // `state` 是 `useState` 的初始值，身分穩定 —— 列進來只是讓
    // exhaustive-deps 不必被關掉，不會造成重新連線。
  }, [state])

  return <RemotePlayers roster={roster} motion={motion} />
}
