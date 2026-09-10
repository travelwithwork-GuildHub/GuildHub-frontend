'use client'

import type { RemoteIdentity, RemoteMotion } from '@/realtime/remotePlayers'
import { RemotePlayer } from './player/RemotePlayer'

// 畫面上的所有遠端角色。規格 FE-R07。
//
// ⚠️ **這個元件只在名單改變時重繪** —— join / leave 才動，
// 而那是低頻事件。位置更新完全不經過這裡。
//
// ⚠️ **子元件不得各自訂閱訊息。** 父層統一收、更新兩個容器；
// 40 個訂閱者在每則 `pos` 上都會被喚醒一次，而其中 39 個跟自己無關。

export interface RemotePlayersProps {
  /** 名單。**只有這個改變時才重繪。** */
  roster: ReadonlyMap<string, RemoteIdentity>
  /** 動態。傳給每個子元件，它們自己在 render loop 裡讀。 */
  motion: ReadonlyMap<string, RemoteMotion>
  /** 單調時間來源。**與寫入樣本用的是同一個。** */
  now: () => number
}

export function RemotePlayers({ roster, motion, now }: RemotePlayersProps) {
  return (
    <>
      {[...roster.entries()].map(([id, identity]) => (
        // `key` 用 id：離開的人卸載、進來的人掛載，中間的人不受影響。
        // 用索引的話，一個人離開會讓它後面每一個都被當成「換了人」。
        //
        // ⚠️ **`av` 從名單拿，不是從動態拿**（`FE-W19-S02`）。
        // 協定早就送得到它（snapshot 的每個人都是
        // `{"id","name","av","x","y","f","st"}`，而 `RemoteIdentity` 也存了），
        // **但在這一行之前沒有任何地方讀它** —— 那正是這一項存在的理由。
        <RemotePlayer key={id} id={id} motion={motion} now={now} av={identity.av} />
      ))}
    </>
  )
}
