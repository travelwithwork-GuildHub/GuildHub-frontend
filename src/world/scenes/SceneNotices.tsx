'use client'

import { useState } from 'react'
import { SECONDARY } from '@/design/controls'
import { useIdentity } from '@/identity/IdentityProvider'
import { useRoomEntryGateIfProvided } from './RoomEntryGate'
import { dropRoomToken } from './roomTokens'
import { useScene } from './SceneProvider'

// 場景的兩種說明。規格 `FE-V01-S06`／`S07`（進不去）、`S14`（沒票的深連結）；`FE-N08-S11`（重新輸入密碼）。
//
// **進不去是 `role="alert"`**，而且**不宣稱原因**：客戶端在握手被拒時看到的是 `1006`／`opened=false`，
// 票過期、房間關了、後端沒起來三種長得一模一樣（`realtime-client` 那條量過）。它留到成功進入任何場景、
// 使用者關閉、或被下一則取代 —— 不是幾秒後自己消失：再按一次門又失敗時，使用者要分得出那是新的一則。
// 「再試一次」不是一顆按鈕：門還在走廊上，走過去再按 E 就是重試（error recovery 的下一步是看得見的門）。
//
// 「重新輸入密碼」（`FE-N08` design D5）：**只有使用者按了才**丟這個身分對那間房的票 → 關通知 → 開那間房的視窗；
// 系統自己不丟票、不重試。丟票要確認（`dropRoomToken` 三態）：「還在」或「無法確認」→ 不開視窗、通知留著、多一句受控說明。
// 沒有正式門禁（沒 provider）就沒有這顆按鈕 —— 那時開不了視窗。
//
// **沒票是 `role="status"`**：那不是失敗，是「你還沒有票」。

export const FAILED_TEXT = '進不了這間房 —— 可能暫時連不上，或通行證已經失效、房間已經關閉。已回到 Guild Hall。'
export const DENIED_TEXT = '這間房需要房間密碼 —— 走到走廊上它的門前按 E。'
/** 預設門禁（`FE-N08` 還沒接上）：對著門按 E 但沒有票（`S11`）。誠實說「還沒開放」，不假裝門壞了。 */
export const GATE_TEXT = '這間房需要房間密碼。輸入密碼的功能還沒開放。'
export const REENTER_LABEL = '重新輸入密碼'
/** 票丟不掉（`FE-N08-S11`）：不開視窗 —— 開了也會拿舊票去撞握手。 */
export const DROP_FAILED_TEXT = '這個瀏覽器清不掉舊的通行證，所以還不能重新輸入密碼。'

export function SceneNotices() {
  const { notice, dismissNotice, deniedRoom, gateNotice } = useScene()
  const gate = useRoomEntryGateIfProvided()
  const identity = useIdentity()
  const profileId = identity.state === 'signed-in' ? identity.profile.id : null
  // 那一句跟著**這一則**通知（物件同一性）：被下一則取代或關閉就不再顯示。
  const [dropFailed, setDropFailed] = useState<object | null>(null)
  const reenter = () => {
    if (notice === null || gate === null) return
    // 訪客沒有鍵可丟（票的鍵含身分）；有身分就要確認真的不在了。
    const result = profileId === null ? 'dropped' : dropRoomToken(profileId, notice.room)
    if (result !== 'dropped') {
      setDropFailed(notice)
      return
    }
    dismissNotice()
    gate.open(notice.room, notice.title ?? null)
  }
  return (
    <>
      {notice !== null && (
        <div role="alert" className="border-danger text-danger p-gutter gap-gutter flex flex-wrap items-center border">
          <p>{FAILED_TEXT}</p>
          {dropFailed === notice && <p>{DROP_FAILED_TEXT}</p>}
          {gate !== null && (
            <button type="button" onClick={reenter} className={`${SECONDARY} min-h-11 shrink-0`}>
              {REENTER_LABEL}
            </button>
          )}
          <button type="button" onClick={dismissNotice} aria-label="關閉通知" className={`${SECONDARY} min-h-11 shrink-0`}>
            關閉
          </button>
        </div>
      )}
      {deniedRoom !== null && (
        <p role="status" aria-label={DENIED_TEXT} className="border-line bg-surface-raised p-gutter border">
          {DENIED_TEXT}
        </p>
      )}
      {gateNotice !== null && (
        <p role="status" aria-label={GATE_TEXT} className="border-line bg-surface-raised p-gutter border">
          {GATE_TEXT}
        </p>
      )}
    </>
  )
}
