'use client'

import { layer } from '@/design/layers'

// 目前 scene 的在線人數。規格 `FE-R10-S07`／`S08`／`S09`。
//
// ⚠️ **`null` 時什麼都不渲染**：初始 snapshot 還沒到（或換連線中），人數是「還不知道」——
// 顯示 0 或上一條連線的數字都是錯的（`S09`）。它是絕對定位，不會擠動任何東西。
//
// ⚠️ **這不是「描述即時層狀態的常駐說明」**（`WorldCanvas` 那條 `FE-O14-S11`／`S12` 的禁令）：
// 它是 Presence 的資料本身，而且即時層沒有資料時它就不出現。
//
// 呈現的取捨（`ui-ux-pro-max` ux「Contextual Live Badge Updates」）：
// - 一整句有上下文的話，不是裸數字；`role="status"` ＋ `aria-atomic`，螢幕閱讀器念整句
// - 寫「這個場景」而且「含你」：跟門標籤的「星際導航 · 3 人」（那是 REST 的**連線數**）分得開，
//   一個人時也不會被讀成「別人有 1 個」
// - 左上角：上方正中是走廊提示、下方正中是互動提示、右側是面板 —— 那三個位置都有人了
export function OnlineCount({ count }: { count: number | null }) {
  if (count === null) return null
  return (
    <div
      data-testid="online-count"
      role="status"
      aria-atomic="true"
      style={{ zIndex: layer('hud') }}
      className="border-line bg-surface text-ink text-caption pointer-events-none absolute top-gutter left-gutter border px-gutter py-2"
    >
      {`這個場景有 ${count} 人在線（含你）`}
    </div>
  )
}
