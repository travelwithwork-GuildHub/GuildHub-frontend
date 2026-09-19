# tasks：`fe-r12-reconnect`

三個 `feat/fe-r12-reconnect--<slice>` PR（每個產品碼 ≤250、手寫 ≤800）：`--backoff`（純模組：退避與排程）→ `--loop`（`RemoteWorld` 的迴圈、清鬼影、`SceneProvider` 的 `recovering`、通知）→ `--e2e`（兩個瀏覽器：斷線再回來）。
每片：先寫判準（紅）→ commit → 實作（綠）→ 突變（拔掉防禦要紅、紀錄貼 PR）→ 檢查。

## 1. 規格

- [x] 1.1（#566 合併）規格已在 PR 上談定（`spec/fe-r12-reconnect` 合併進 `main`）。驗證：`pnpm exec openspec validate fe-r12-reconnect --strict` 通過且 PR 已合併

## 2. `--backoff`：退避與排程（〈指數退避加 full jitter〉；design D1／D5）

- [x] 2.1（6 條）判準先紅：`tests/reconnect-schedule.test.ts`（`S03` 的區間與歸零；`S04` 的「一次只存在一個排程」；`S06` 重複 schedule 不加；`S07` cancel 後跑完計時器不執行）
- [x] 2.2 `src/realtime/reconnect.ts`：`backoffDelay(attempt, base, cap, random)`、`createReconnectSchedule(...)`；常數 `RECONNECT_BASE_MS = 1000`、`RECONNECT_CAP_MS = 30_000`
- [x] 2.3（5 個 5 紅：沒 cap → S03／S04；沒 jitter → S03／S04／S06；reset 不歸零 → S03；schedule 疊加 → S06；cancel 不清 → S07）突變：沒有 cap → `S03` 紅；沒有 jitter（固定 `base × 2^n`）→ `S03` 紅；成功不歸零 → `S03` 紅；schedule 疊加 → `S06` 紅

## 3. `--loop`：迴圈、清鬼影、通知（〈`ready` 之後意外斷線〉〈重連之後接回來〉〈單一迴圈〉；design D1～D4）

- [x] 3.1 判準先紅：`tests/remote-world-reconnect.test.tsx`（`S01` 清空＋人數 null＋等待後恰好一條、位址同 scene／token；`S02` offline；`S04` 連續被拒；`S05` 狀態重送、聊天不清且走新連線、pos 重送、舊 socket 遲到不算；`S06`；`S07` 卸載／資格失去／按門；`S08` 沒 ready 過（含 open 過沒 hello）不排；`S10` `canReconnect` 回 false 就放棄）；`tests/realtime-client.test.ts`（既有檔）多「意外 close 之後舊 socket 的 message／open 不再打到 client」；`tests/scene-provider.test.tsx`（或既有檔）多 `recovering` 的推導（過場開始不顯示、ready 清）；`tests/scene-notices.test.tsx` 多 `role="status"` 通知
- [x] 3.2 `client.ts`：`#handleClose` 拆三個 listener；`RemoteWorld`：`open()` 包裝、每組 callback 比對 `client === current`、`everReady`、`onClosed` 分支（清容器、發 `recovering`、`schedule(open)`）、執行前問 `canReconnect`、cleanup `cancel()`；`SceneProvider`：`recovering: wsScene | null`＋推導、`canReconnect`；`SceneNotices`：通知（`ui-ux-pro-max` 先問位置）
- [x] 3.3（7 個 7 紅：M1 不清容器→S01/S05；M2 沒 ready 也重連→S08×2；M3 cleanup 不 cancel→S07×2（先移除與其冗餘的 callback cancelled 檢查）；M4 不問 canReconnect→S10；M5 意外 close 不拆 listener→client S05；M6 ready 不清 recovering→S05/S10；M7 不發 recovering 事件→S01/S04/S10）突變：不清容器 → `S01` 紅；沒 ready 也重連（或用 `opened` 當條件）→ `S08` 紅；cleanup 不 cancel → `S07` 紅；`#handleClose` 不拆 listener 且不比對身分 → `S05` 紅；不問 `canReconnect` → `S10` 紅；`ready` 不清通知 → `S05` 紅；provider 從 `closed.opened` 推通知 → `S08` 紅

## 4. `--e2e`：真瀏覽器（〈真瀏覽器裡斷線再恢復〉）

- [x] 4.1（10 綠；突變拿掉 retry.schedule → 「通知消失」「B 回來」兩條紅；player-status 15／name-tags 28／scene-switch 36 綠）`tests/e2e/reconnect.mjs` 的 `S09`（兩個瀏覽器 process、`routeWebSocket` 偽造、腳本對 A 的假 socket close、再接受新連線）；`player-status`、`name-tags`、`scene-switch` 沒變紅
- [x] 4.2（截圖在 logs/shots-reconnect：重連中、恢復後、B 仍看到）截圖貼 PR（通知、B 消失、B 回來）；效能：world chunk 前後差、斷線期間每次嘗試一條握手、沒斷線時零計時器

## 5. 收尾

- [x] 5.1（--loop：eslint 0、tsc 0、pnpm test 1444 綠）每片：`pnpm exec eslint .`、`pnpm exec tsc --noEmit`、`pnpm test` 全綠；每片 PR 回報效能影響
- [x] 5.2（正式站已部署 03b5cd5；閘道 smoke **條件式放行**：正式站對後端認證呼叫被全站 CORS 擋，非前端缺陷、與 K05 同一個後端阻塞；斷線恢復的功能驗收依據是本機真瀏覽器 e2e `reconnect` 10 綠；CORS 另立 P0 交後端、demo 前重驗正式站整合）合併後 `vercel deploy --prod`、閘道一次人工 smoke
- [x] 5.3（r1：codex 2／gemini 2 需修正，都是 S07 失去資格通知不清＋S10 過場×退避競態；#572 修 → --rereview 兩模型 4 條全「已修」→ 四條 --judge 已修）tasks 全勾後、archive 前：`archive-review.sh fe-r12-reconnect`；需修正修完 `--rereview` 一次、每條 `--judge`
- [x] 5.4（row 301 Done；瀏覽器層由本機真瀏覽器 e2e reconnect 驗過，依兩模型結論放行）Sheet `FE-R12` → Done（瀏覽器層驗過之後才打）
