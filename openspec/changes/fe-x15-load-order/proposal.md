# `FE-X15 首屏載入順序`

## Why

打開 `/world` 到能動之間，**中間有一整段什麼都看不到**。實測：HTML 293 ms、
canvas 1315 ms —— 這一秒鐘裡使用者盯著一塊空白，不知道網站是慢還是壞了。
使用者原話：「不要讓使用者覺得卡或者讀取很慢」（2026-09-17）。

**不做會怎樣**：demo 當天第一印象就是「這網站很慢」。而且今天所有東西**一起載**ーー
三個面板（看板／名片／收件匣）的程式碼被 eager import 進 `WorldCanvas` 的初始 chunk，
沒有人開面板也要付它們的下載成本；載入畫面只是一行靜態文字，看不出在動。
這一項把「打開 → 能動」拆成有次序、看得見進度的階段。

**數字目標不在這一項**（那是 `FE-O12` 效能預算）。這一項只管**順序與拆分**：
什麼先出來、什麼延後、什麼按需要才載，以及空窗期畫面不能是死的。

## What Changes

- **身分先於 3D chunk**：今天 `WorldBoundary` 無條件建立 `dynamic(WorldCanvas)`、
  `WorldGate` 對 `unknown` 身分直接放行 —— 也就是 3D chunk 的抓取**沒有真的排在身分之後**。
  改成：身分 `unknown`（還沒問到）時先不建立 `WorldContent`，只有身分 settled
  （`guest`／`signed-in`／`unavailable`）才開始抓 3D chunk。標題列與載入層照常顯示。
- **一個連續的載入層跨過兩段空窗**：(A) `WorldCanvas` chunk 抓取期、(B) chunk 到了但
  Canvas/WebGL 還沒建立好。由 `WorldBoundary` 持有**同一個** loader，`WorldCanvas` 用
  `onCreated` callback 回報 ready；ready 前 loader 一直在，**不在 A/B 之間卸載重掛**
  （否則會閃白／動畫重置）。loader 是脈動骨架＋`role="status"`，看得出在動、不用進度條。
- **面板按開啟意圖才載（code-split）**：看板／名片／收件匣三個面板的重模組，在**首次有效開啟意圖**
  發生前不得請求。開啟意圖 = 看板按 E、名片與收件匣按標題列的按鈕、看板深連結（初始 URL 本身）。
  開的當下由輕量 host **立刻**鎖世界輸入＋接管焦點＋顯示面板形載入殼，chunk 到了原位換成內容。
  不做 idle prefetch —— 那會直接破壞「開啟前沒有請求」這個可驗證邊界。
- **收件匣 provider 拆 eager／lazy**：`InboxPanelProvider` 今天 eager import 訊息 API
  （`listMessages`／`sendMessage`／`getProfile`）。拆成 eager（開關／待開啟對象／焦點）
  ＋ lazy（訊息資料、分頁、寄送、表單、面板 UI），否則只 lazy 面板本體，重模組還是被 provider 拖進首屏。
- **Rapier 與 WS 的次序鎖死**（現況方向已對，規格把它釘住）：Rapier chunk 在 Canvas ready
  前不得請求（現況已由 `LocalPlayer` 的 `await import` 達成）；WS 只在 Canvas ready 後建立。
- **房間清單不阻塞首個可操作畫面**：`useRooms` 的 `GET /api/rooms` 排在 Canvas ready 後
  才開始（門稍晚長出來，可接受）。

## Capabilities

### New Capabilities
- `load-order`: `/world` 首屏「打開 → 能動」的載入次序與拆分：DOM 殼 → 身分 settled →
  3D chunk → Canvas ready → WS；Rapier 與房間清單延後到 Canvas 之後；面板按開啟意圖才載；
  兩段空窗由同一個動態載入層覆蓋。**只定義次序與有／無，不定義毫秒門檻**（數字歸 `load-budget`）。

### Modified Capabilities
<!-- 無。次序是新行為、屬新 capability；不移除或改寫 app-shell／world-canvas 既有需求。 -->

## Impact

- `src/app/world/WorldBoundary.tsx`（身分 gate＋連續 loader 持有者）、
  `src/app/world/WorldGate.tsx`（`unknown` 不放行 3D chunk 的判準來源）、
  `src/world/WorldCanvas.tsx`（`onCreated` 回報 ready；面板改 lazy host；移除 eager 面板 import）。
- 面板：`src/list-panel/BoardPanel`、`src/profile/ProfilePanel`、`src/inbox/InboxPanel`
  各自成 lazy entry chunk；名片的世界輸入鎖／焦點要搬到 eager host。
- `src/inbox/InboxPanelProvider.tsx` 拆 eager／lazy。
- `src/world/rooms/useRooms.ts`（排到 Canvas ready 後）。
- 新增載入層元件（脈動骨架，`role="status"`）。看得見 → 過 `ui-ux-pro-max`。
- e2e：新增 `tests/e2e/load-order.mjs`（攔截 barrier 驗次序與 chunk 有／無）；
  需要一個 resource tracer（`traceUrls` 只追導覽、不能追網路請求，不改它的既有語意）。
- 無合約／schema 變更；不碰後端。
