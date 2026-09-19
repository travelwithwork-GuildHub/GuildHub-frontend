## Context

見 `proposal.md`〈Why〉。現況三個事實決定了這份設計的形狀：

1. **DOM 殼與 3D 隔離已達成**：`WorldPage` 是同步 Server Component，先渲染標題列與通知；
   `WorldBoundary` 用 `dynamic(() => import('@/world/WorldCanvas'), { ssr:false })` 把 3D 關進瀏覽器端。
   但 `dynamic()` **沒有 `loading:` fallback**，且 `WorldGate` 對 `unknown` 身分直接放行 ——
   所以「身分 → 3D chunk」這一段次序**現況並沒有真的成立**，chunk 一掛載就開始抓。
2. **Rapier 已延後**：`LocalPlayer` 用 `await import('@dimforge/rapier3d-compat')`，
   `physics/world.ts` 只 `import type`。方向對，規格只需把它與 Canvas ready 的先後鎖死，不需搬動。
3. **面板是 eager 的**：`WorldCanvas` 頂部 eager import 三個面板並無條件渲染；名片的世界輸入鎖
   由 `ProfilePanel` 掛載時持有（鎖在 `WorldCanvas` 內的 `InteractionProvider`，不在 header 那側的 provider）；
   `InboxPanelProvider` eager import 訊息 API。要 lazy 就得處理「鎖在面板本體裡」這件事。

## Goals / Non-Goals

**Goals:**
- 把「打開 → 能動」拆成可觀測的次序階段，且每段空窗都有連續、看得出在動的載入層。
- 面板重模組按開啟意圖才載，開啟前零請求。

**Non-Goals:**
- 不定任何毫秒／KB 門檻（`FE-O12`／`load-budget` 的事）。
- 不為了「provider 層數多」而合併 provider —— 那改生命週期卻沒有可驗收的收益。
- 不改 WebGL2 不可用的處理（那是 `FE-W01`／`world-canvas`）；本 change 只保證載入層會**讓位**給它，不接管它。
- 不做 idle prefetch。

## Decisions

## D1｜身分 gate 放進 WorldBoundary，只擋 `unknown`，且只 gate `WorldContent`

`WorldBoundary` 依 `identity.state` 決定是否建立 lazy 的 `WorldContent`：`unknown` 時不建立、
只顯示標題列與載入層；`guest`／`signed-in`／`unavailable` 都算 settled，放行。**只 gate 世界內容那一塊，
不 gate 整個 `<main>`**（否則標題列也被藏掉，違反 S01）。
- 為什麼在 `WorldBoundary` 而不是 `WorldGate`：`WorldGate` 現有語意是「連線資格鍵」（lease），
  且它刻意放行 `unknown` 以免每次載入黑畫面 —— 那個決定是對的，不動它。載入**次序**是另一回事，放在邊界層。
- 替代方案：在 `WorldGate` 擋 `unknown`。否決 —— 會改掉 lease 的既有契約，且 `unknown` 擋住會黑畫面。

## D2｜連續載入層由 WorldBoundary 持有，WorldCanvas 用 `onCreated` callback 回報 ready

兩段空窗（A: chunk 抓取、B: WebGL 建立）用**同一個** loader，掛在 `WorldBoundary`；
`WorldContent` 掛載後透過 callback 回報 `ready`（Canvas `onCreated`）／`unavailable`（WebGL2 不支援）。
loader 在 `ready` 前一直在，**不在 A/B 之間卸載重掛**。
- 為什麼不用 `dynamic({ loading })` ＋ 另一個 Suspense fallback 各管一段：那是兩個元件，chunk 到達時
  第一個卸載、第二個掛載 → 動畫重置甚至閃白（違反 S01「不曾卸載重掛」）。
- loader 形式：脈動／shimmer 的世界區骨架 ＋ 固定狀態文字，`role="status"`。**不用進度條** ——
  沒有可信的整體進度來源（chunk＋shader＋GLTF 無法合成一個百分比）。視覺細節過 `ui-ux-pro-max`。

## D3｜面板：開啟意圖 → 輕量 host 立即鎖＋焦點＋載入殼 → lazy 換內容

每個面板包一層 eager 的輕量 `PanelHost`：讀 `open`（＝協調者的 active panel）。`open===false` 時 `return null`
且**完全不 import** 重模組；`open===true` 才 `React.lazy(() => import(...))`。開啟意圖成立的當下，host **立刻**
（chunk 抵達前）鎖世界輸入、接管焦點、顯示面板形 `role="status"` 載入殼；`<Suspense>` resolve 後原位換內容。
- 觸發語意是「首次有效開啟意圖」，不是字面上的按 E：看板＝E、名片／收件匣＝header 按鈕、看板深連結＝初始 URL。
- **必要修正**：名片的世界輸入鎖目前在 `ProfilePanel` 本體 —— 面板 lazy 後 chunk 抵達前鎖不生效。
  鎖與焦點接管要**上移到 eager host**。看板的鎖已由 eager `ListPanelProvider` 持有，不動。
- 為什麼不 idle prefetch：直接違反「開啟前零請求」這條可驗證邊界；第一次開啟的等待用立即 fallback 解決，
  是否仍慢到不可接受由 `FE-O12` 的數字判定，X15 不猜。

## D4｜收件匣 provider 拆 eager／lazy

`InboxPanelProvider` 拆成：eager（開關／待開啟對象／焦點狀態）＋ lazy（訊息資料、分頁、寄送、表單、面板 UI）。
只 lazy 面板本體不夠 —— provider 仍 eager import 訊息 API，重模組還是被拖進首屏。
- 替代方案：整個 provider lazy。否決 —— 開關狀態要在首屏就能被 header 按鈕操作（否則按了沒反應）。

## D5｜e2e 驗「序」與「有／無」，用攔截 barrier ＋ 新 resource tracer

判準只驗拓撲次序與 chunk 有／無，不讀 `duration`／`transferSize`／首次載入 ms（那會踩進 `load-budget`）。
- `traceUrls` 現況只追 `pushState`／`replaceState`／導覽，**不能追網路請求**。另做 `traceResources`（記 request URL 序），
  **不改 `traceUrls` 既有語意**。
- 用可控 barrier（攔截身分回應、攔截 chunk 請求）確認各階段先後，不靠 `waitForTimeout`。
- **不硬編 chunk hash 檔名**：以穩定 runtime marker（各面板根節點的 `data-testid`）從 production build 反解對應的 chunk URL；
  若 marker 落進初始 chunk，測試會直接指出「切分失敗」。
- 測試 timeout 只作「卡死」保護，不是效能門檻。

## Risks / Trade-offs

- [面板第一次開啟要等 chunk 下載，可能有可感延遲] → 立即載入殼＋鎖＋焦點讓它「有回饋」；是否過慢由 `FE-O12` 判定。
- [`onCreated` 回報 ready 是 R3F 行為，若 Canvas 永遠建不起來 loader 會停住] → S05 規定 chunk 失敗要讓位給錯誤；
  WebGL2 不支援走 `world-canvas` 既有路徑（載入層讓位、不接管）。
- [把名片的鎖從面板本體上移，可能影響既有 `FE-A04` 焦點/讓位行為] → 保持鎖/焦點語意不變，只改**持有者的層級**；
  用既有 profile-editor e2e 迴歸驗證。
- [拆 `InboxPanelProvider` 可能動到 `FE-K01` 的資料/分頁行為] → eager/lazy 只切割**載入時機**，不改資料語意；
  用既有 inbox e2e 迴歸驗證。

## Migration Plan

分片（各自 ≤250 產品行）：
1. `--loader`：D1 身分 gate ＋ D2 連續載入層（WorldBoundary/WorldCanvas onCreated）＋ 載入層元件。
2. `--panels`：D3 面板 lazy host ＋ 名片鎖上移 ＋ D4 收件匣 provider 拆分。
3. `--order`：把 Rapier／WS／房間清單與 Canvas ready 的先後鎖進實作（多為驗證與微調）。
4. `--e2e`：D5 `tests/e2e/load-order.mjs` ＋ `traceResources`。
回退：每片獨立 PR，載入層與 gate 可各自 revert 而不牽動彼此。

## Open Questions

- 載入殼骨架的確切視覺（脈動 vs shimmer、骨架塊數）留給 `--loader` 片時過 `ui-ux-pro-max` 決定 ——
  不影響規格、次序或任務拆分。
