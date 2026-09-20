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

> **重切（2026-09-20）**：原本一片 `--panels` 估 400–500+ 產品行、塞不進 250 上限。依 `pr-size.sh`〈按 Scenario 切〉與模型審查（codex）重切成四小片：`--panel-host`（通用機制＋合成判準）→ `--panel-profile`（名片，含鎖上移）→ `--panel-board`（看板）→ `--panel-inbox`（收件匣拆分）。每片各自 ≤250 產品行、判準與實作同片、可單獨審。
>
> **`PanelHost` 介面契約（3a 定死，服務三個面板；codex 審查要點）**：
> - production 介面就是 `load: () => Promise<{ default: ComponentType }>`（不另做 test-only importer；這個 prop 本身即可測的縫，不可經 barrel 間接 eager import）。
> - 鎖所有權**用注入**（`lock?: { acquire: () => () => void }`）：名片＝host 持鎖、看板＝provider 已持鎖（不傳 lock）、收件匣＝host 持鎖。不寫死「host 一律持鎖」。
> - 三個可替換狀態：載入殼（`role="status"`／`aria-busy`，焦點先落這）／錯誤（`role="alert"`，釋放鎖與焦點、可回世界、可 retry）／內容（內容自己接焦點）。
> - retry 建**新的 lazy loader key**（只重繪不會重抓失敗的 chunk）。
> - idempotent cleanup：過期 promise resolve 後不得搶回焦點或重鎖世界；`open→false`／卸載即釋放鎖。

### 3a. `--panel-host`：通用 PanelHost ＋ 面板形載入殼／錯誤殼

- [x] 3a.1 判準先紅：`PanelHost` 元件測試（合成 lazy 面板、可控 resolve/reject）—— `open===false` 不呼叫 `load`（S04）；`open===true` 立即呼叫 `load`、且在 resolve 前已鎖（注入的 `acquire` 被呼叫）、已出現面板形 `role="status"`／`aria-busy` 載入殼並取得焦點（S04）；resolve 後換成內容、載入殼消失；`load` reject 時顯示 `role="alert"`、釋放鎖（`acquire` 的 cleanup 被呼叫）、焦點落在回世界的按鈕（S06）；retry 重新呼叫 `load`
- [x] 3a.2 實作：`src/panel/PanelHost.tsx`（讀 `open`、`load`、注入 `lock`、`onExit`）。**自己管 `import()` 而非 `React.lazy`**：`lazy()` 寫在 render 被 `react-hooks/static-components` 擋、且會永久快取 rejected 的 promise（重試永遠失敗）；改用 effect 內 `load()` ＋衍生狀態（結果帶 `attempt`，`attempt` 一變舊結果失效→回載入態，setState 只在 async 回呼、不在 effect 本體）。載入態＝`PanelLoadingShell`、`catch`→`PanelErrorShell`、鎖只依 `open && !errored`（載入到就緒連續持有）。兩個殼沿用 `PanelShell` 的框 token；`ui-ux-pro-max`：穩定骨架同框不位移、`motion-safe:animate-pulse`、`role=status`／`alert`、失敗態明確訊息＋回世界
- [x] 3a.3 突變：`open===false` 也呼叫 `load`（開啟前就載）→ S04 紅；載入殼不取焦／不鎖 → S04 紅；reject 不釋放鎖／不顯示 alert → S06 紅；retry 不換 key（重用失敗 loader）→ retry 判準紅

### 3b. `--panel-profile`：名片經 PanelHost，鎖與焦點接管上移

- [ ] 3b.1 判準先紅：名片以 `PanelHost` 掛載 —— 開啟前不 import `OpenProfilePanel`；開啟意圖當下（chunk 前）`holdInputLock('profile-panel')` 已呼叫、載入殼在（S04）；`FE-A04` 既有焦點／讓位／編輯（`S01`～`S03`）行為不變（既有 profile 測試迴歸）
- [ ] 3b.2 實作：抽 `OpenProfilePanel` 成獨立可 lazy 模組；`ProfilePanel` 改用 `PanelHost`，`lock` 注入 `() => holdInputLock('profile-panel')`（在 `WorldCanvas`／`InteractionProvider` 底下取得）；面板本體不再自持鎖
- [ ] 3b.3 突變：鎖留在面板本體（chunk 抵達前不鎖）→ S04「開啟當下已鎖」紅；host 改 eager import 名片 → S04 紅

### 3c. `--panel-board`：看板經 PanelHost

- [ ] 3c.1 判準先紅：看板 `BoardPanel` 以 `PanelHost` 掛載 —— 開啟意圖（走近按 E／深連結）前不 import 看板重模組；開啟只載看板、不順帶載名片／收件匣（S04）；看板鎖仍由 `ListPanelProvider`（eager）持有、不經 host
- [ ] 3c.2 實作：`BoardPanel` 包 `PanelHost`（不傳 `lock`）；抽看板內容成可 lazy 模組
- [ ] 3c.3 突變：host 改 eager import 看板 → S04 紅；開看板順帶 import 另兩個 → S04「只載目標」紅

### 3d. `--panel-inbox`：收件匣 provider 拆 eager／lazy

- [ ] 3d.1 判準先紅：收件匣以 `PanelHost` 掛載 —— 開啟前不 import 訊息 API（`getProfile`／`listMessages`／`sendMessage`）與面板 UI（S04）；talent「寄信給他」＝開啟意圖（`requestCompose`→inbox active→殼＋鎖＋焦點→engine 載入後消化 pending compose），非背景送信；chunk 失敗釋放鎖與焦點（S06）；既有 inbox 行為（分頁世代、201 合併 `S12`、名字跨開關 `S04`、401 清空）迴歸不變
- [ ] 3d.2 實作：`InboxPanelProvider` 拆 eager（唯一對外 `InboxContext`：協調、open/view/focus、未讀數安全快照、`requestOpen`／`requestCompose`／`close`）＋ lazy `InboxDataEngine`（generation／dataGeneration／inFlight／pendingFirst／names／sendGuard／API／副作用**整塊**搬入，首次開啟後常駐、bridge 回報 snapshot）；engine 未載入時 data command 只成 eager intent、未讀數語意明確（非假裝已同步的 0）
- [ ] 3d.3 突變：把競態機器（generation／sendGuard）拆到 eager 那側 → S12／迴歸紅；engine 隨關閉卸載 → 名字跨開關／送出中合併紅；talent 背景直接送信（不經 requestCompose）→ S04「開啟前零 import」紅

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
