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
// - 一句有上下文的話，不是裸數字；`role="status"` ＋ `aria-atomic`，螢幕閱讀器念整句
// - 「在線」：跟門標籤的「星際導航 · 3 人」（那是 REST 的**連線數**）分得開。人數包含自己是規格的定義（S07），
//   文字不另外寫「含你」—— 文案不是契約（`openspec/config.yaml` 的 specs 規則），使用者看過覺得不自然就拿掉了
// - 左上角：上方正中是走廊提示、下方正中是互動提示、右側是面板 —— 那三個位置都有人了
// - **字要短**：截圖量到「這個場景有 3 人在線（含你）」在 800×600 會被首次進入的提示卡壓住
//   （框寬 211px；卡片置中約 370px）。拿掉「這個場景有」（以及後來的「含你」）之後，會撞到的視窗寬度從約 825px 降到約 640px 以下（量的是含「含你」的版本，拿掉後框更窄）
// - **一律左上角，不分寬窄**：原本窄於 `md`（768px）時放左下角，但場景聊天（`FE-K04` 的 `SceneChatHud`）
//   固定在左下角 —— 截圖量到 767×600、640×480 人數框整個被聊天區蓋住。聊天從底部往上長、最高半個畫面，
//   碰不到左上角。代價：窄於約 580px 時人數框一角會被首次進入的提示卡壓住（只對訪客、可關閉）
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
      {`${count} 人在線`}
    </div>
  )
}
