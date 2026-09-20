# tasks：`fe-x15-load-order`

四個 `feat/fe-x15-load-order--<slice>` PR（每片產品碼 ≤250、手寫 ≤800）：
`--loader`（身分 gate＋連續載入層）→ `--panels`（面板 lazy host、名片鎖上移、收件匣 provider 拆分）→
`--order`（Rapier／WS／房間清單排在 Canvas ready 後）→ `--e2e`（真瀏覽器驗拓撲次序與 chunk 有／無）。
每片：先寫判準（紅）→ commit → 實作（綠）→ 突變（拔掉防禦要紅、紀錄貼 PR）→ 檢查（eslint／tsc／test 全綠）。
看得見的載入層與載入殼在動版面前先過 `ui-ux-pro-max`。

## 1. 規格

- [x] 1.1 規格已在 PR 上談定（`spec/fe-x15-load-order` 合併進 `main`）。驗證：`pnpm exec openspec validate fe-x15-load-order --strict` 通過且 PR 已合併（#575，d499a04）

## 2. `--loader`：身分 gate ＋ 連續載入層（Req「首屏以固定次序載入」S01／S02／S05；design D1／D2）

- [x] 2.1 判準先紅：`WorldBoundary` 的元件測試 —— 身分 `unknown` 時不建立 `WorldContent`（S02）、標題列與載入層仍在（S01）；`guest`／`signed-in`／`unavailable` 三種都建立；載入層帶 `role="status"` 且到 `onCreated` ready 前不卸載重掛（S01）；3D chunk 抓取失敗時載入層讓位給 `role="alert"` 可重試錯誤（S05）。`tests/world-boundary-loader.test.tsx`（S01／S02／S05 render 真 `WorldBoundary`）＋`tests/world-boundary-failure.test.tsx`（S05 邊界替換）
- [x] 2.2 實作：`WorldBoundary` 依 `identity.state !== 'unknown'` 才建立 lazy `WorldContent`、只 gate 世界內容不 gate `<main>`；持有連續 loader，`WorldContent`／`WorldCanvas` 用 `onCreated` 回報 ready；新增脈動骨架載入層元件 `WorldLoadSequence`（`role="status"`／`aria-busy`、`motion-safe:animate-pulse` 動畫）
- [x] 2.3 突變：gate 改成連 `unknown` 也建立 → S02＋S01 紅；載入層綁 `!settled`（chunk 到就撤）→ S01 phase-B 紅；載入層搬到邊界外（chunk 失敗不讓位）→ S05 紅。**M3 第一次跑抓到缺口**：舊 S05 自構樹只驗 `catchError`，補一條 render 真 `WorldBoundary` 的 S05（`throwOnRender` mock）後 M3 才紅

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

- [x] 3b.1 判準先紅：名片以 `PanelHost` 掛載 —— 開啟前不 import `OpenProfilePanel`；開啟意圖當下（chunk 前）`holdInputLock('profile-panel')` 已呼叫、載入殼在（S04）；`FE-A04` 既有焦點／讓位／編輯（`S01`～`S03`）行為不變（既有 profile 測試迴歸）
- [x] 3b.2 實作：抽 `OpenProfilePanel` 成獨立可 lazy 模組；`ProfilePanel` 改用 `PanelHost`，`lock` 注入 `() => holdInputLock('profile-panel')`（在 `WorldCanvas`／`InteractionProvider` 底下取得）；面板本體不再自持鎖
- [x] 3b.3 突變：鎖留在面板本體（chunk 抵達前不鎖）→ S04「開啟當下已鎖」紅；host 改 eager import 名片 → S04 紅

### 3c. `--panel-board`：看板經 PanelHost

> **看板鎖與內容耦合的發現（3c 定案，codex 覆核）**：看板鎖原本綁 `useBlockingPanelOpen() && mine`（＝內容裡的 `PanelShell` 已登記到協調者）。
> 內容 lazy 後載入殼不是 `PanelShell`、不登記，鎖會延遲到 chunk 抵達才成立（違反 S04）。修法：鎖**留在 eager 的 `ListPanelProvider`**（不搬去 host、符合原設計意圖），但觸發改綁 `open !== null`（開啟意圖，早於 chunk）；用 boolean 消除切換看板種類的鎖 churn。chunk 失敗時錯誤殼的「回到世界」＝ `closePanel` → `requestClose`＋清 route → 鎖釋放（阻斷式面板：錯誤殼顯示中世界仍鎖，與名片「失敗釋放鎖」是刻意差異）。
>
> **非阻斷表面也改綁開啟意圖（codex 覆核，選 A）**：`SceneChatHud`（收合）、`FirstEntryNotice`（讓位）原讀 `useBlockingPanelOpen`（殼已登記）。lazy 後載入視窗（世界已鎖、焦點已接管、chunk 未到）這兩個表面不反應 → 聊天仍可打字（矛盾）。改讀 `useActivePanel() !== null`（開啟意圖）。協調者刻意用「殼已登記」防「幽靈 active」，但對純顯示、可自我修正的收合／隱藏可容忍瞬時幽靈（鎖與焦點才不容許，那些仍走協調者）。

- [x] 3c.1 判準先紅：`board-panel-wiring.test.tsx` 新增 `[FE-X15-S04]` —— 按 E 當下（內容 chunk 前）`list-panel-loading`（`role="status"`）在、`list-panel`（內容）還沒、世界輸入鎖已持有；內容到後載入殼讓位、鎖連續持有。「只載目標、不順帶載另兩個」是跨 chunk 網路事實，在 --e2e（task 5.1）驗
- [x] 3c.2 實作：抽 `BoardPanelContent`（`TalentBoard`／`ProjectBoard`＋重 import）成 lazy 模組；`BoardPanel` 改薄殼包 `PanelHost`（`open={open!==null}`、`panelId="list-panel"`、**不傳 `lock`**、`onExit=closePanel`）。`ListPanelProvider` 鎖觸發 `shellMounted`→`open`。`SceneChatHud`／`FirstEntryNotice` 改讀 `active`。`contract-server.close()` 加 `closeAllConnections`（被丟棄的 lazy 內容 fetch 留下的 keep-alive socket 不再讓優雅 close 空等 idle-timeout；~4s→~1ms）
- [x] 3c.3 突變：① host 改 eager 靜態 import 看板（繞過 PanelHost）→ S04「載入殼」紅；② 鎖退回 `useBlockingPanelOpen() && mine` → S04「開啟意圖當下就要鎖」紅（證明 re-key 必要）；③ 兩個非阻斷表面退回 `useBlockingPanelOpen` → S15／S16 紅（載入視窗不反應）。「只載目標」突變 jsdom 觀測不到跨 chunk import，留 --e2e。測試調適：`create-project`(-limits)／`deep-link`／`dom-visual-flow` 開啟後 await 內容；`project-board-detail`／`project-lifecycle`（`InboxPanelProvider` 以 me 為 key 重掛）預熱 chunk 讓時序穩定各兩份回應

### 3d. `--panel-inbox`：收件匣 provider 拆 eager／lazy

> **eager/lazy 邊界定案（codex 覆核；gemini/agy 因 xattr 被擋不可達，單模型）**：選 **B ＋同步 eager open-intent**。
> 決定性理由：**單一 lazy 模組邊界** —— 操作邏輯＋面板 UI 同在 `OpenInboxPanel`（`PanelHost` 內容），chunk 失敗／重試／釋放鎖／還焦點全走已驗證的 `PanelHost` 路徑；不做兩個獨立會失敗的 chunk（A 案的坑：UI 到了但 engine 掛了 → 有畫面沒資料，且 engine 失敗不會轉成 host 的錯誤殼）。
> - **狀態常駐在 eager**（不是 lazy engine）：`InboxState`（以 `me` 為 key）持有資料 useState ＋競態機器 `race`（純物件，欄位只用方法改 → 避開 `react-hooks/immutability`；lazy 內容經 `store.race` 驅動）。in-flight closure 捕捉常駐 `store`／`race` —— 送出中關面板、內容卸載，201 照併（`S12`）；`me` 換了整棵重掛、舊 closure 落在已卸載元件成 no-op（帳號隔離）。`useInbox()` 保持有資料欄位（`S16` 讀 `pagesLoaded` 不動）。
> - **同步 `beginOpenIntent`**（codex 修正：純 `useActivePanel` edge effect 不忠實 —— `S11` 會閃空、`S01` 重開要重抓）：`openList`／`openThreadFromTalent` 同步 generation＋1、`loading`＝true、`openNonce`＋1；lazy 內容掛好以 `openNonce` 為 dep drain 第 0 頁（API 仍只在內容 chunk）。
> - 動作（send／loadMore／retryFirst／resolveNames）走 UI-local `useInboxOps()`（只有內容 UI 用得到）、不進 `useInbox()`、不 bridge。世界輸入鎖上移到 host（注入，如名片 3b）。talent「寄信給他」＝ `openThreadFromTalent`（設 view=thread 的開啟意圖），非背景送信。
> - 「未讀數安全快照」：`BE-G06` 沒有 `read_at` 寫端點、收件匣不顯示未讀數（`InboxButton`），故無此欄位，不引入。

- [x] 3d.1 判準先紅：`inbox-panel.test.tsx` 新增兩條 `[FE-X15-S04]` —— 按收件匣的當下（內容 chunk 前）`inbox-panel-loading`（`role="status"`）在、`inbox-panel`（內容）還沒、世界輸入已鎖，內容到後載入殼讓位、鎖連續持有；「寄信給他」＝開啟意圖（載入殼＋鎖、`posts()`＝0，非背景送信），內容到後進對話仍未送。chunk 失敗釋放鎖與焦點（S06）由 `panel-host.test.tsx` 通用判準守（＋此處守鎖接上 host）
- [x] 3d.2 實作：`InboxPanelProvider`＝eager 協調＋常駐狀態／`race`（不 import 訊息 API）；`OpenInboxPanel`＝lazy 內容（操作邏輯 import `getProfile`／`listMessages`／`sendMessage`＋面板 UI、`useInboxOps`、掛好 drain 第 0 頁）；`InboxPanel` 改薄殼包 `PanelHost`（注入世界輸入鎖）。測試調適：`inbox-panel` S11／`dom-visual-flow`（4 處）／`project-password-reveal` 開啟後 `await` 內容（lazy 邊界）
- [x] 3d.3 突變（三條、均確認紅後還原）：① 拿掉 host 注入的鎖 → S04「開啟意圖當下就要鎖」紅（證明鎖上移到 host）；② neuter 開啟意圖→內容 drain（`openNonce`→`fetchPage`）→ S01「第 0 頁」紅（證明 `beginOpenIntent`→drain 交握）；③ 拿掉 `send` 裡的 `dataGeneration` 舊世代 guard → S06「401 之後舊世代的 201 寫回」紅（證明競態機器隨拆分搬進內容仍成立）。「lazy 才有載入殼」已由 3d.1 的 RED（對 eager 舊碼紅）直接證明。「只載目標、不順帶載另兩面板」是跨 chunk 網路事實，留 --e2e（task 5.1）

## 4. `--order`：Rapier／WS／房間清單排在 Canvas ready 之後（Req「首屏以固定次序載入」S03／S07；design D2）

- [x] 4.1 判準先紅：`world-load-order.test.tsx` 掛整個 `WorldCanvas`（`RemoteWorld→RealtimeClient→WebSocket`、`useRooms→listRooms`、`LocalPlayer` 掛載全是正式碼），Canvas 替身**捕捉 `onCreated` 由測試主動呼叫**以觀測 ready 前/後。觀測點：`FakeSocket.instances`（WS，S03）、`listRooms`（房間，S07）、`LocalPlayer` 掛載次數（Rapier `import()` 在真 `LocalPlayer` 的掛載 effect 裡＝單元層代理，S03）。對現行未 gate 的碼：ready 前 WS 已連、`listRooms` 已打 → 紅
- [x] 4.2 實作（**Option A；codex＋Gemini 覆核一致**）：世界子樹以 `{ready && …}` 延到 `onCreated` 之後才掛（`WorldShell`／`LocalPlayer`／`RemoteWorld`／`SceneObjects`／`SpatialInteraction`），房間清單以 `useRooms(cap, hall && ready)` 同樣延後。ready 前 WS 與 Rapier 的擁有者根本不存在、`useRooms` 停用 → 三者不可能提早觸發。**兩模型結論**：A 勝過 B（傳 `ready` prop 個別守 effect）—— B 把 `ready` 塞進 `RemoteWorld` 的 connect-effect deps 會跟既有 scene/generation/token 依賴糾纏（多次連線/過早重連風險），且 `LocalPlayer` 的 `useFrame` 會在物理未請求前空轉；A 是單一結構性 gate、未來新增子元件不會漏守。**無 chicken-and-egg**（雙方高信心）：`onCreated` 是 renderer 層級 callback、不依賴 scene children，空 Canvas 一樣 fire、翻 `ready`，下個 commit 才掛子樹。既有 16 個全掛 `WorldCanvas` 測試不受影響（Canvas 替身同步呼叫 `onCreated`，子樹同 act 內即掛；Explore 盤點）
- [x] 4.3 突變（兩條、均確認紅後 `git checkout` 還原）：① `useRooms(cap, hall && ready)`→`useRooms(cap, hall)`（房間改回掛載即打）→ S07 紅（`listRooms` 在 ready 前被呼叫）、S03 仍綠；② 移除 `{ready && …}` 子樹 gate（改 `{true && …}`，WS/Rapier 改回 ready 前掛）→ S03 紅（`FakeSocket` 與 `LocalPlayer` 掛載在 ready 前發生）、S07 仍綠（rooms gate 還在）。「只載目標、不順帶載另兩面板」與真正的 chunk/WS 網路次序留 --e2e（task 5.1）

## 5. `--e2e`：真瀏覽器驗拓撲次序與 chunk 有／無（Req 全部；design D5）

- [ ] 5.1 新增 `tests/e2e/lib` 的 `traceResources`（記 request URL 序，**不改 `traceUrls` 既有語意**）；`tests/e2e/load-order.mjs`：攔截 barrier 驗 shell-visible → identity-response → world-chunk-request → canvas-ready → ws-connect（S01／S02／S03）、房間清單在 ready 後（S07）、三面板 entry chunk 開啟意圖前為 0、開啟後只出現目標面板（S04）；chunk URL 以面板根節點 `data-testid` runtime marker 反解、不硬編 hash；打本機 `next start`、REST 全 `page.route` 偽造
- [ ] 5.2 迴歸：`dom-shell`／`first-entry`／`profile-editor`／`inbox`／`board-panel` 既有 e2e 沒變紅；效能：初始 chunk 不再含三面板 code（以 marker 落點證明）、首屏空窗期有動畫、面板第一次開啟的 chunk 是按需請求

## 6. 收尾

- [ ] 6.1 每片：`pnpm exec eslint .`、`pnpm exec tsc --noEmit`、`pnpm test` 全綠；每片 PR 回報效能影響（初始 chunk 大小變化、空窗期是否有動畫）
- [ ] 6.2 合併後從乾淨 worktree `vercel deploy --prod`；閘道一次人工 smoke（正式站全站 CORS 仍未修時記**條件式放行**，功能驗收依據為本機真瀏覽器 `load-order` e2e）
- [ ] 6.3 tasks 全勾後、archive 前：`archive-review.sh fe-x15-load-order`；需修正修完 `--rereview` 一次、每條 `--judge`；rc 非 0（含 exit 3）當輪回報不往下走
- [ ] 6.4 Sheet `FE-X15` → Done（瀏覽器層由本機真瀏覽器 `load-order` e2e 驗過之後才打）
