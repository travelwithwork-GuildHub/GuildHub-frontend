'use client'

import { useScene } from './SceneProvider'

// 場景的兩種說明。規格 `FE-V01-S06`／`S07`（進不去）、`S14`（沒票的深連結）。
//
// **進不去是 `role="alert"`**，而且**不宣稱原因**：客戶端在握手被拒時看到的是 `1006`／`opened=false`，
// 票過期、房間關了、後端沒起來三種長得一模一樣（`realtime-client` 那條量過）。它留到成功進入任何場景、
// 使用者關閉、或被下一則取代 —— 不是幾秒後自己消失：再按一次門又失敗時，使用者要分得出那是新的一則。
// 「再試一次」不是一顆按鈕：門還在走廊上，走過去再按 E 就是重試（error recovery 的下一步是看得見的門）。
//
// **沒票是 `role="status"`**：那不是失敗，是「你還沒有票」。

export const FAILED_TEXT = '進不了這間房 —— 可能暫時連不上，或通行證已經失效、房間已經關閉。已回到 Guild Hall。'
export const DENIED_TEXT = '這間房需要房間密碼 —— 走到走廊上它的門前按 E。'

export function SceneNotices() {
  const { notice, dismissNotice, deniedRoom } = useScene()
  return (
    <>
      {notice !== null && (
        <div role="alert" className="border-danger text-danger p-gutter gap-gutter flex items-center border">
          <p>{FAILED_TEXT}</p>
          <button type="button" onClick={dismissNotice} className="min-h-11 min-w-11 px-3">
            關閉
          </button>
        </div>
      )}
      {deniedRoom !== null && (
        <p role="status" aria-label={DENIED_TEXT} className="border-line bg-surface-raised p-gutter border">
          {DENIED_TEXT}
        </p>
      )}
    </>
  )
}
