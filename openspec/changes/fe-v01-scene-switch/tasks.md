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
- [ ] 4.2b 覆蓋層（300 ms 最短、鎖輸入）、`role="alert"` 通知（可關閉）、「回到 Guild Hall」按鈕、沒票深連結的 `role="status"` 說明 —— `--transition-ui`
- [ ] 4.3 覆蓋層與按鈕過 `ui-ux-pro-max --stack nextjs` 的 pre-delivery checklist
- [ ] 4.4 突變：D 表裡對應的六項各自紅

## 5. 資格與門（`feat/fe-v01-scene-switch--door`）

- [ ] 5.1 `[FE-V01-S12]`（含 `FE-R06-S02` 的四項）：`WorldGate` 的 `leaseKey` 去掉 `/lobby`；`tabLease.ts`／`WorldLeaseProvider.tsx` 的註解改指 design D6 —— 先紅後綠
- [ ] 5.2 `tests/world-rooms-press-e.test.tsx`：`FE-W12-S16` 兩條的 GIVEN 補「沒有票」（ID 不變）；新增 `[FE-V01-S10]`／`[FE-V01-S11]` —— 紅，commit
- [ ] 5.3 `ProjectDoors` 的 `onInteract` → `requestEntry`；`EntryGateProvider` 與預設說明（D7）—— 綠
- [ ] 5.4 突變：`onInteract` 拿掉、`repeat` 不擋、把 `wsScene` 加進 `leaseKey` —— 紅

## 6. 瀏覽器與收尾

- [ ] 6.1 `tests/e2e/scene-switch.mjs`：`S04` 的 Canvas 同一節點、`S09` 的上一頁不整頁重載、`S14` 的網址不含票（`routeWebSocket` 偽造，只打本機 dev server）
- [ ] 6.2 `pnpm run typecheck`、`pnpm run lint`、`pnpm test` 的結果如實記在這裡（含任何既有的逾時）
- [ ] 6.3 `governance/`：`docs/WBS.md` 加一條 `BE-G`（跨 scene 的同一人會被 `disconnect()` 清掉，同根 `BE-G31`），跑 `progress.sh --check`
- [ ] 6.4 封存（`archive/fe-v01-scene-switch`，獨立 PR；勾勾要在 archive 之前進 main）
