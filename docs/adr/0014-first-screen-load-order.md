# 0014. 首屏載入次序與 loader 住在 `WorldBoundary`，面板重模組不得進入初始 3D chunk

- **Status**: Proposed
- **Date**: 2026-09-20
- **Deciders**: 寫 `fe-x15-load-order` 規格的那個 session；兩位外部審查（gpt-5.6／gemini-3.1-pro，規格草稿）
- **邊界狀態**: 僅約定
- **證據**: openspec/changes/fe-x15-load-order/design.md、src/app/world/WorldBoundary.tsx:57、src/world/WorldCanvas.tsx:21

> `邊界狀態` 與 `證據` 兩欄由 `bash .github/scripts/arch-view.sh` 讀。三種狀態見 `docs/adr/README.md`。
> 實作合併後改成 `已強制`，證據換成 `tests/e2e/load-order.mjs` 的判準行。

## 背景

打開 `/world` 到能動之間有一整段空白（HTML 293 ms、canvas 1315 ms）。`FE-X15` 要把它拆成有次序、
看得見進度的階段。三個現況決定了選擇空間：`WorldBoundary` 已用 `dynamic(WorldCanvas, {ssr:false})`
把 3D 關進瀏覽器端、但沒有 `loading:` fallback，且 `WorldGate` 對 `unknown` 身分放行（那是為了不黑畫面，刻意的）；
三個面板 eager import 進 `WorldCanvas` 的初始 chunk，沒人開也要付下載成本。問題有兩個：
**身分 gate 與連續 loader 放哪一層**，以及**面板重模組如何離開初始 chunk 又不破壞世界輸入鎖**。

## 選項

### A. gate 與 loader 放在 `WorldGate`（現有的 lease 那一層）
- 好：已經在讀身分，順手。
- 壞：`WorldGate` 的語意是「連線資格鍵」，而它刻意放行 `unknown` 以免黑畫面 —— 在這裡擋 `unknown` 會改掉 lease 契約、
  且會讓每次載入都黑一下。次序與資格是兩件事，混在一層之後兩邊都難改。

### B. gate 與連續 loader 放在 `WorldBoundary`；只擋 `unknown`、只 gate `WorldContent`；`WorldCanvas` 用 `onCreated` 回報 ready；面板各自 lazy，開啟意圖成立時由 eager 輕量 host 立即鎖世界輸入＋接管焦點＋顯示載入殼
- 好：lease 契約不動；載入次序集中在邊界層；同一個 loader 跨過「chunk 抓取」與「WebGL 建立」兩段空窗、
  中途不卸載重掛（不閃白）；面板重模組離開初始 chunk（初始 chunk 不再含面板 code）；鎖上移到 host 後，
  chunk 抵達前世界輸入就已鎖住，不會有「按了 E 但面板還沒到、人卻能繼續走」的空窗。
- 壞：`WorldCanvas` 要多回報一個 ready callback；名片面板的世界輸入鎖要從面板本體上移到 host；
  `InboxPanelProvider` 要拆 eager／lazy（只 lazy 面板本體不夠，provider 仍 eager import 訊息 API）。

### C. 用 `dynamic({ loading })` ＋ Suspense fallback 各管一段空窗
- 好：最少的新元件。
- 壞：那是兩個不同元件，chunk 到達時第一個卸載、第二個掛載 → 動畫重置甚至閃白，違反「空窗期不曾卸載重掛」。

## 決定

選 **B**。

**理由**：載入次序是「邊界層」的責任，不該混進 lease 的資格契約（否決 A）；兩段空窗必須是同一個 loader
才不會閃白（否決 C）。面板 lazy 的真正難點不是拆 import，是「鎖住在面板本體裡」—— 把鎖與焦點接管上移到
eager host 後，lazy 才不會在 chunk 抵達前留下一段沒鎖的世界。不 idle prefetch：那會直接破壞「開啟前零請求」
這條可驗證邊界，第一次開啟的等待用立即載入殼解決，是否過慢由 `FE-O12`（`load-budget`）的數字判定。

## 代價

- `WorldCanvas` 與 `WorldBoundary` 的介面多一個 ready 回報；名片鎖與收件匣 provider 都要動，牽到 `FE-A04`／`FE-K01`
  的既有行為，靠它們的既有 e2e 迴歸兜底。
- 面板第一次開啟要等 chunk 下載，可能有可感延遲 —— 用載入殼＋鎖＋焦點讓它「有回饋」，但延遲本身這一項不消除。
- e2e 要另做 resource tracer（`traceUrls` 只追導覽、不能追網路），且要以 runtime marker 反解 chunk URL、不硬編 hash。

## 什麼情況下要重新考慮

- 若 `FE-O12` 量出「第一次開面板的等待」超過可接受門檻，才回來考慮對面板做 idle prefetch（現在明確不做）。
- 若之後 World 需要在 `unknown` 身分下也預先暖機 3D chunk（例如已知極高機率會 settled），再重看 gate 的位置。
