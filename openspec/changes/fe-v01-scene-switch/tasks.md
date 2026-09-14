# `FE-V01` 任務

## 1. 規格

- [x] 1.1 規格已在 PR 上談定（`spec/fe-v01-scene-switch`）

## 2. 註冊表與配置（`feat/fe-v01-scene-switch--registry`）

- [x] 2.1 先寫判準：`tests/world-scenes-registry.test.ts`（`[FE-V01-S01]`）、`tests/world-layout-project-room.test.ts`（`[FE-V01-S02]`，沿用 `world-layout` 的三條檢查）—— 紅，commit
- [x] 2.2 `src/world/scenes/registry.ts`（D1）、`src/world/layout/projectRoomLayout.ts` —— 綠
- [x] 2.3 `WorldShell`／`LocalPlayer` 改從註冊表讀配置與出生點；`WorldCanvas` 的 Guild Hall 專屬物件收進 `hall` 分支（`[FE-V01-S03]`）
- [x] 2.4 突變：`sceneOf` 少 id、少一面牆、房間仍掛門 —— 各自紅，改回來

## 2b. 連線等舊 close（`feat/fe-v01-scene-switch--close-ack`）

- [x] 2b.1 `tests/realtime-client.test.ts` 加 `[FE-V01-S18]` —— 紅，commit
- [x] 2b.2 `RealtimeClient.close()` 留一次性 close 監聽器、`closeAndEnter()` 等它或 1 秒；`FE-R01-S01`～`S0n` 照舊綠
- [x] 2b.3 突變：不等、或上限拿掉 —— 紅（另加：等 ack 期間再進入、同步 close、onClosed 重入、A→B→C；`RemoteWorld` 的 `closeGateRef` 串接）

## 3. 網址（`feat/fe-v01-scene-switch--url`）

- [x] 3.1 `tests/world-scenes-url.test.tsx`（原訂放 deep-link.test）加 `[FE-V01-S08]`／`[FE-V01-S09]` —— 紅，commit
- [x] 3.2 `WorldUrlSync`（原檔 `PanelUrlSync.tsx`，搬家留給 chore）單一寫入者（D2 的 C）：場景 codec ＋ 面板 codec ＋ 整段 canonical；`PanelUrlSync` 改走它；既有 `FE-B09-S01`～`S12` 全部照舊綠
- [x] 3.3 突變：`serialize` 不寫 `room`、`parse` 不去掉 `panel` —— 紅（另加十個：大寫、replace、popstate 不套、面板不歸零、沒票也進、鍵不含身分、身分沒問完洗網址、popstate 比實際的、不 settleDenied、setItem 不包）

## 4. 過場、失敗、返回、票（`feat/fe-v01-scene-switch--transition`）

- [x] 4.1 先寫判準：`tests/world-scenes-transition.test.tsx`（`[FE-V01-S04]`／`S06`／`S07`／`S15`／`S16`／`S19` 狀態機那一半；`S05`／`S13`／`S14`／`S17` 與 DOM 在 `--transition-ui`；`<StrictMode>`；假 socket 記錄 `close()`／`createSocket` 順序與遲到事件、假時鐘）—— 紅，commit
- [x] 4.2a `SceneProvider` 的狀態機（D3：`committed`＋推導的 `transition`、代號、10 秒逾時從 `connect()` 起算可注入）、`RemoteWorld` 回報 connecting／ready／closed —— `--transition-state`
- [x] 4.2b 覆蓋層（300 ms 最短、鎖輸入）、`role="alert"` 通知（可關閉）、「回到 Guild Hall」按鈕、沒票深連結的 `role="status"` 說明 —— `--transition-ui`
- [x] 4.3 覆蓋層與按鈕過 `ui-ux-pro-max`（ux：Loading Indicators／Reduced Motion／Touch Target／Error Messages announced；stack nextjs：loading.tsx 不適用——不是路由）與 pre-delivery checklist（語意 token、≥44px、reduced-motion、alert 宣告；按鈕走 `design/controls` 的 `SECONDARY`）
- [x] 4.4 突變：狀態機十三個、UI 九個各自紅（詳見 #412、#413 的 PR 說明）

## 5. 資格與門（`feat/fe-v01-scene-switch--door`）

- [x] 5.1 `[FE-V01-S12]`（含 `FE-R06-S02` 的四項）：`WorldGate` 的 `leaseKey` 去掉 `/lobby`；`tabLease.ts`／`WorldLeaseProvider.tsx` 的註解改指 design D6 —— 先紅後綠
- [x] 5.2 `tests/world-rooms-press-e.test.tsx`（既有兩條 GIVEN 本來就沒有票，斷言不變；新的在 `tests/world-scenes-door*.test.tsx`）：`FE-W12-S16` 兩條的 GIVEN 補「沒有票」（ID 不變）；新增 `[FE-V01-S10]`／`[FE-V01-S11]` —— 紅，commit
- [x] 5.3 `ProjectDoors` 的 `onInteract` → `requestEntry`；`EntryGateProvider` 與預設說明（D7）—— 綠
- [x] 5.4 突變：`onInteract` 拿掉、`repeat` 不擋、把 `wsScene` 加進 `leaseKey` —— 紅

## 6. 瀏覽器與收尾

- [x] 6.1 `tests/e2e/scene-switch.mjs`：`S04` 的 Canvas 同一節點、`S09` 的上一頁不整頁重載、`S14` 的網址不含票（`routeWebSocket` 偽造，只打本機 dev server）。**它抓到一個 jsdom 沒抓到的**：深連結直達房間的過場沒有覆蓋層（`transitionSeq === 0` 的閘門把它擋掉了）—— 修在 `SceneTransitionOverlay`，jsdom 補 `[FE-V01-S05] 直達房間…`（先紅後綠；拔掉修正會紅）。另一個紅燈是尺：Next.js 的 `__next-route-announcer__` 也是 `role="alert"`，判準改排除它
- [x] 6.2 2026-09-15：`tsc --noEmit` 0 錯；`eslint .` 0 錯（第一版在 effect 裡 setState 被 `react-hooks/set-state-in-effect` 擋，改成 render 裡調整）；`pnpm test` 135 檔 1050 綠、7 skipped（既有）；e2e 36 項全部符合，對 `NEXT_PUBLIC_APP_ENV=local pnpm run build` ＋ `next start` 跑 4 次全綠（CI 的形狀）。**`next dev` 跑 e2e 不可信**：Turbopack 在 e2e 的多次導覽之後 HMR panic（log 有 `FATAL`），之後同一個 dev server 出來的頁面網址寫不進去，兩輪各 5～6 個假紅 —— e2e 一律打 `next start`。兩位審查者第一輪都退回（網址快照看不到瞬間寫入、固定毫秒走位、旗標缺負向）→ 網址改整條軌跡、走位改門標籤里程計、補三條負向；第二輪 Gemini APPROVE，codex 剩 CI 接線（governance PR 另開）
- [x] 6.3 `governance/`：`docs/WBS.md` 加一條 `BE-G`（跨 scene 的同一人會被 `disconnect()` 清掉，同根 `BE-G31`），跑 `progress.sh --check` —— `BE-G33`，#415 已合併
- [ ] 6.4 封存（`archive/fe-v01-scene-switch`，獨立 PR；勾勾要在 archive 之前進 main）
