'use client'

import dynamic from 'next/dynamic'
import { catchError, type ErrorInfo } from 'next/error'
import { useState } from 'react'
import { layer } from '@/design/layers'
import { useIdentity } from '@/identity/IdentityProvider'
import { WorldLoadSequence } from './WorldLoadSequence'

// 規格 FE-X01-S03 / S04：World 的 client 邊界。
//
// `ssr: false` 的 `next/dynamic` **不能寫在 Server Component 裡**，
// 所以這一層是薄殼，唯一的工作是把 World 的內容關進瀏覽器端。
// 內容是誰由 FE-W01 決定，這個檔案不需要因此改動。
const WorldContent = dynamic<{ onReady?: () => void }>(() => import('@/world/WorldCanvas'), {
  ssr: false,
})

// 用 `catchError` 而不是 `error.tsx`：`error.tsx` 是整個路由段的邊界，
// 會把**整頁**換掉，而規格 S04 明確要求「頁面的其餘部分仍然可用」。
//
// fallback 的 props 型別寫 `unknown`（不是 `Record<string, never>`）——
// 後者的索引簽章會跟 catchError 注入的 `children?: ReactNode` 打架（TS2769）。
//
// 重試為什麼是整頁重載，而不是 `info.retry()`：
//
// 實測（production build，攔掉 World 的 chunk 請求）——
// `React.lazy` 會把那個 rejected 的 promise **快取**起來。`info.retry()`
// 只清掉邊界的錯誤狀態，重新渲染時 lazy 把同一個失敗原封不動再拋一次，
// 畫面永遠回不來。**一個永遠不會成功的重試按鈕比沒有按鈕更糟** ——
// 使用者會按十次，然後認定這個網站壞了。
//
// 試過在每次重試建立新的 `dynamic()`，但那是在 render 裡建立元件，
// `react-hooks` 規則直接擋下（「Components created during render will reset
// their state each time they are created」）—— 那條規則是對的，不繞過它。
//
// 整頁重載會丟掉頁面狀態。**W1 沒有任何頁面狀態**；之後 World 有狀態了，
// 這個決定要重新看一次。
function retryByReload() {
  window.location.reload()
}

// **刻意 export：測試要斷言的是這一個，不是它的複製品。**
// 在測試檔裡重刻一個 `catchError(...)` 等於在測 Next 的 API ——
// 那樣的話，把下面的重試按鈕整個拔掉，測試照樣是綠的。
//
// 為什麼不用「讓動態載入真的失敗」來測：實測過，`next/dynamic` 在 jsdom
// 裡載入失敗時**渲染空的、不拋錯**，邊界根本不會被觸發（瀏覽器的 dev 模式
// 也是同一個行為）。所以單元測試測邊界本身，
// 「真的 chunk 失敗會走到這裡」由 design.md 的 V4／V5 在 production build 上驗。
export const WorldErrorBoundary = catchError((_props: unknown, _info: ErrorInfo) => (
  <div role="alert" style={{ zIndex: layer('hud') }} className="border-danger text-danger border p-gutter">
    <p>世界載入失敗。</p>
    {/* 重試只對「載入失敗」有意義。WebGL 不可用是另一種失敗，
        重試永遠沒用 —— 那條路徑屬於 FE-W01，不在這一刀。 */}
    <button type="button" onClick={retryByReload}>
      重試
    </button>
  </div>
))

// 規格 FE-X15-S01／S02／S05（load-order；ADR 0014、design D1／D2）：
//
// 1. **身分先於 3D chunk**：身分 `unknown`（還沒問到）時**不建立** `WorldContent` ——
//    也就是不抓 3D chunk。`guest`／`signed-in`／`unavailable` 都算 settled，放行。
//    `WorldGate` 對 `unknown` 的放行（lease 那一層）是刻意的、不動它；載入**次序**是另一回事，放在這裡。
//    只 gate 世界內容，不 gate 標題列 —— 標題列在 `page.tsx`、本來就在這個邊界外面。
//
// 2. **一個連續的載入層**：`WorldLoadSequence` 覆蓋「chunk 抓取（WorldContent 還沒掛載）」與
//    「chunk 到了、Canvas 還沒 ready」兩段空窗。它與 `WorldContent` 是**同一個邊界的 children** ——
//    所以 chunk 抓取失敗（`WorldContent` 拋錯）時，整批被 fallback 取代，載入層自然讓位給錯誤（S05）。
//    `ready` 只在 `onReady`（Canvas `onCreated`）時翻真 —— 載入層在那之前一直是同一個元素，不卸載重掛。
export function WorldBoundary() {
  const identity = useIdentity()
  const settled = identity.state !== 'unknown'
  const [ready, setReady] = useState(false)
  return (
    <WorldErrorBoundary>
      {settled && <WorldContent onReady={() => setReady(true)} />}
      {!ready && <WorldLoadSequence />}
    </WorldErrorBoundary>
  )
}
