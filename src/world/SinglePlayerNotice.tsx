'use client'

import { realtimeAdapter } from '@/config/env'
import { layer } from '@/design/layers'

// 「這個部署沒有即時後端」的說明。規格 `FE-O14-S09`／`S10`。
//
// ⚠️ **這是 DOM，不是 3D 物件**（`CONTEXT.md`：3D 負責空間，DOM 負責產品操作）。
// 跟 `WorldCanvas` 的載入中／WebGL 不可用是同一類東西。
//
// ⚠️⚠️ **MUST NOT 提供重試。** 這不是暫時性失敗 —— 這個部署**刻意**沒有
// 即時後端，重試永遠不會成功。理由跟 `FE-W01-S06` 的 WebGL 提示一樣：
// 一個永遠不會成功的按鈕比沒有按鈕更糟。
//
// ⚠️⚠️⚠️ **這段話 MUST NOT 用來表示「後端連不上」。**
// 兩者在畫面上都是「看不到別人」，但使用者該做的事**相反**：
//
//     adapter = none   → 沒事，這是預期的
//     有位址但連不上   → 稍後再試／回報
//
// 共用同一段文字，等於在真的壞掉的那天告訴使用者一切正常。
// 「連不上」的呈現是 `FE-R12`（W5），**不在這裡**。

export function SinglePlayerNotice() {
  if (realtimeAdapter() !== 'none') return null

  return (
    <div
      data-testid="single-player-notice"
      role="status"
      // 規格要求「可以用它的可存取名稱取得」——「它是 DOM」不等於
      // 讀螢幕軟體讀得到它。
      aria-label="單人預覽"
      style={{ zIndex: layer('hud') }}
      className="border-line bg-surface text-ink-muted absolute top-gutter left-1/2 -translate-x-1/2 border px-gutter py-2"
    >
      <p>目前是單人預覽，看不到其他人。</p>
      <p className="text-caption">這個版本沒有連上即時伺服器。</p>
    </div>
  )
}
