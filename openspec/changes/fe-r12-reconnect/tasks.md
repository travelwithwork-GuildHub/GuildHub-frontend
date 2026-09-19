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

- [ ] 3.1 判準先紅：`tests/remote-world-reconnect.test.tsx`（`S01` 清空＋人數 null＋等待後恰好一條、位址同 scene／token；`S02` offline；`S04` 連續被拒；`S05` 狀態重送、聊天不清且走新連線、pos 重送、舊 socket 遲到不算；`S06`；`S07` 卸載／資格失去／按門；`S08` 沒 ready 過（含 open 過沒 hello）不排；`S10` `canReconnect` 回 false 就放棄）；`tests/realtime-client.test.ts`（既有檔）多「意外 close 之後舊 socket 的 message／open 不再打到 client」；`tests/scene-provider.test.tsx`（或既有檔）多 `recovering` 的推導（過場開始不顯示、ready 清）；`tests/scene-notices.test.tsx` 多 `role="status"` 通知
- [ ] 3.2 `client.ts`：`#handleClose` 拆三個 listener；`RemoteWorld`：`open()` 包裝、每組 callback 比對 `client === current`、`everReady`、`onClosed` 分支（清容器、發 `recovering`、`schedule(open)`）、執行前問 `canReconnect`、cleanup `cancel()`；`SceneProvider`：`recovering: wsScene | null`＋推導、`canReconnect`；`SceneNotices`：通知（`ui-ux-pro-max` 先問位置）
- [ ] 3.3 突變：不清容器 → `S01` 紅；沒 ready 也重連（或用 `opened` 當條件）→ `S08` 紅；cleanup 不 cancel → `S07` 紅；`#handleClose` 不拆 listener 且不比對身分 → `S05` 紅；不問 `canReconnect` → `S10` 紅；`ready` 不清通知 → `S05` 紅；provider 從 `closed.opened` 推通知 → `S08` 紅

## 4. `--e2e`：真瀏覽器（〈真瀏覽器裡斷線再恢復〉）

- [ ] 4.1 `tests/e2e/reconnect.mjs` 的 `S09`（兩個瀏覽器 process、`routeWebSocket` 偽造、腳本對 A 的假 socket close、再接受新連線）；`player-status`、`name-tags`、`scene-switch` 沒變紅
- [ ] 4.2 截圖貼 PR（通知、B 消失、B 回來）；效能：world chunk 前後差、斷線期間每次嘗試一條握手、沒斷線時零計時器

## 5. 收尾

- [ ] 5.1 每片：`pnpm exec eslint .`、`pnpm exec tsc --noEmit`、`pnpm test` 全綠；每片 PR 回報效能影響
- [ ] 5.2 合併後 `vercel deploy --prod`、閘道一次人工 smoke（只走不壓：兩個瀏覽器互見即可，斷線恢復在本機 e2e 驗）
- [ ] 5.3 tasks 全勾後、archive 前：`archive-review.sh fe-r12-reconnect`；需修正修完 `--rereview` 一次、每條 `--judge`
- [ ] 5.4 Sheet `FE-R12` → Done（瀏覽器層驗過之後才打）
