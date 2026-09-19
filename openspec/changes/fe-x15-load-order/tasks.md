# tasks：`fe-x15-load-order`

四個 `feat/fe-x15-load-order--<slice>` PR（每片產品碼 ≤250、手寫 ≤800）：
`--loader`（身分 gate＋連續載入層）→ `--panels`（面板 lazy host、名片鎖上移、收件匣 provider 拆分）→
`--order`（Rapier／WS／房間清單排在 Canvas ready 後）→ `--e2e`（真瀏覽器驗拓撲次序與 chunk 有／無）。
每片：先寫判準（紅）→ commit → 實作（綠）→ 突變（拔掉防禦要紅、紀錄貼 PR）→ 檢查（eslint／tsc／test 全綠）。
看得見的載入層與載入殼在動版面前先過 `ui-ux-pro-max`。

## 1. 規格

- [ ] 1.1 規格已在 PR 上談定（`spec/fe-x15-load-order` 合併進 `main`）。驗證：`pnpm exec openspec validate fe-x15-load-order --strict` 通過且 PR 已合併

## 2. `--loader`：身分 gate ＋ 連續載入層（Req「首屏以固定次序載入」S01／S02／S05；design D1／D2）

- [ ] 2.1 判準先紅：`WorldBoundary` 的元件測試 —— 身分 `unknown` 時不建立 `WorldContent`（S02）、標題列與載入層仍在（S01）；`guest`／`signed-in`／`unavailable` 三種都建立；載入層帶 `role="status"` 且到 `onCreated` ready 前不卸載重掛（S01）；3D chunk 抓取失敗時載入層讓位給 `role="alert"` 可重試錯誤（S05）
- [ ] 2.2 實作：`WorldBoundary` 依 `identity.state !== 'unknown'` 才建立 lazy `WorldContent`、只 gate 世界內容不 gate `<main>`；持有連續 loader，`WorldContent`／`WorldCanvas` 用 `onCreated` 回報 ready；新增脈動骨架載入層元件（`role="status"`、動畫，過 `ui-ux-pro-max`）
- [ ] 2.3 突變：gate 改成連 `unknown` 也建立 → S02 紅；載入層在 chunk 到達時卸載重掛（改回兩段各一個 fallback）→ S01 紅；chunk 失敗不讓位錯誤（永遠停在載入層）→ S05 紅

## 3. `--panels`：面板 lazy host、名片鎖上移、收件匣 provider 拆分（Req「面板按開啟意圖才載入」S04／S06；design D3／D4）

- [ ] 3.1 判準先紅：`PanelHost` 元件測試 —— `open===false` 不觸發重模組 import（用可觀測的 lazy import spy／mock）、`open===true` 才觸發（S04）；開啟意圖成立當下（chunk 抵達前）世界輸入已鎖、焦點已接管、出現面板形 `role="status"` 載入殼（S04）；chunk 抓取失敗時顯示 `role="alert"`、釋放鎖與焦點（S06）；名片鎖上移後 `FE-A04` 焦點／讓位既有行為不變（既有 profile 測試迴歸）
- [ ] 3.2 實作：三個面板各包 eager 輕量 `PanelHost`（讀協調者 active panel；`open` 才 `React.lazy` import）；名片世界輸入鎖與焦點接管從 `ProfilePanel` 本體上移到 host；`InboxPanelProvider` 拆 eager（開關／對象／焦點）＋ lazy（訊息資料、分頁、寄送、表單、UI）
- [ ] 3.3 突變：host 改成 eager import 面板（開啟前就載）→ S04 紅；鎖留在面板本體（chunk 抵達前不鎖）→ S04「開啟當下已鎖」紅；chunk 失敗不釋放鎖 → S06 紅

## 4. `--order`：Rapier／WS／房間清單排在 Canvas ready 之後（Req「首屏以固定次序載入」S03／S07；design D2）

- [ ] 4.1 判準先紅：WS 只在 Canvas ready 後 connect、Rapier chunk 在 ready 前不請求（S03）；`useRooms` 的 `GET /api/rooms` 排在 ready 後（S07）——以既有單元／整合測試能觀測的層級斷言（真正的網路次序在第 5 片 e2e 驗）
- [ ] 4.2 實作：把 WS 連線、Rapier 初始化、房間清單載入都接在 Canvas ready 的訊號之後（多為既有觸發點的微調與守衛）
- [ ] 4.3 突變：房間清單改回掛載即打 → S07 紅；WS 改回 ready 前 connect → S03 紅

## 5. `--e2e`：真瀏覽器驗拓撲次序與 chunk 有／無（Req 全部；design D5）

- [ ] 5.1 新增 `tests/e2e/lib` 的 `traceResources`（記 request URL 序，**不改 `traceUrls` 既有語意**）；`tests/e2e/load-order.mjs`：攔截 barrier 驗 shell-visible → identity-response → world-chunk-request → canvas-ready → ws-connect（S01／S02／S03）、房間清單在 ready 後（S07）、三面板 entry chunk 開啟意圖前為 0、開啟後只出現目標面板（S04）；chunk URL 以面板根節點 `data-testid` runtime marker 反解、不硬編 hash；打本機 `next start`、REST 全 `page.route` 偽造
- [ ] 5.2 迴歸：`dom-shell`／`first-entry`／`profile-editor`／`inbox`／`board-panel` 既有 e2e 沒變紅；效能：初始 chunk 不再含三面板 code（以 marker 落點證明）、首屏空窗期有動畫、面板第一次開啟的 chunk 是按需請求

## 6. 收尾

- [ ] 6.1 每片：`pnpm exec eslint .`、`pnpm exec tsc --noEmit`、`pnpm test` 全綠；每片 PR 回報效能影響（初始 chunk 大小變化、空窗期是否有動畫）
- [ ] 6.2 合併後從乾淨 worktree `vercel deploy --prod`；閘道一次人工 smoke（正式站全站 CORS 仍未修時記**條件式放行**，功能驗收依據為本機真瀏覽器 `load-order` e2e）
- [ ] 6.3 tasks 全勾後、archive 前：`archive-review.sh fe-x15-load-order`；需修正修完 `--rereview` 一次、每條 `--judge`；rc 非 0（含 exit 3）當輪回報不往下走
- [ ] 6.4 Sheet `FE-X15` → Done（瀏覽器層由本機真瀏覽器 `load-order` e2e 驗過之後才打）
