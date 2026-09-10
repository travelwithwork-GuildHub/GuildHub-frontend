'use client'

import { useWorldLease } from '@/realtime/WorldLeaseProvider'

// 「你已經在另一個分頁裡開著這個世界」。規格 `FE-R06-S02`。
//
// ⚠️ **有動作，不是只有一句話。** 規格逐字要求「並提供一個
// 『改用這個分頁』的動作」—— 只顯示訊息的話，使用者唯一的出路是去找出
// 那個分頁在哪，而他可能根本記不得自己開過。
//
// ⚠️ **這裡不說「請關掉另一個分頁」。** 那是把系統的限制講成使用者的義務，
// 而且按下按鈕就解決得了。

export function OtherTabNotice() {
  const { blockedByOtherTab, takeOver } = useWorldLease()
  if (!blockedByOtherTab) return null

  return (
    <div role="status" className="border-line bg-surface-raised p-gutter flex items-center gap-gutter border">
      <p>你已經在另一個分頁裡開著這個世界。</p>
      <button type="button" onClick={takeOver}>
        改用這個分頁
      </button>
    </div>
  )
}
