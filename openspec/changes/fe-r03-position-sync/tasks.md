# Tasks

兩個 `feat/` slice：

- `feat/fe-r03-position-sync--throttle` —— 1、2 節（純函式）
- `feat/fe-r03-position-sync--wire` —— 3、4、5 節

## 1. 前置

- [x] 1.1 規格已在 PR 上談定並合併進 `main` —— 用 `git log --oneline main -- openspec/changes/fe-r03-position-sync/` 確認
- [x] 1.2 確認座標換算用 `world-coordinates` 的 `toProtocol`，**不改它**；`git diff --stat` 的檔案清單當證據

## 2. 節流與去重（Requirement：最多每 100 毫秒／只在整數像素改變時送）

- [x] 2.1 純函式：吃「上次成功送出的整數像素、距上次送出的時間、目前的世界座標」，回傳要不要送與送什麼
- [x] 2.2 取整之後才比對（design 的 D3）；驗證 `FE-R03-S03` 通過
- [x] 2.3 100 毫秒的節流；驗證 `FE-R03-S02` 通過（1 秒內不超過 10 則）
- [x] 2.4 停在還沒送出的位置，節流時間到仍然要送；驗證 `FE-R03-S04` 通過
- [x] 2.5 卡頓造成多幀落後時只送最新的一筆，不補送
- [x] 2.6 **負向驗證**：把比對改成取整**之前**，確認 `FE-R03-S03` 變紅；還原
- [x] 2.7 **負向驗證**：把節流拿掉（每幀都送），確認 `FE-R03-S02` 變紅；還原

## 3. 接上（Requirement：專用的 ref／ready 才送／換連線重置）

- [ ] 3.1 `LocalPlayer` 每幀把權威座標寫進一個**專用的** ref，**不重用相機的跟隨目標**（D1）；驗證 `FE-R03-S01` 通過
- [ ] 3.2 同步元件在 render loop 裡讀那個 ref，**不直接讀 Three 物件或 rigid body**
- [ ] 3.3 送出前確認連線 `ready`；**不用 try/catch 吞錯**（D4）；驗證 `FE-R03-S05` 通過（含「ready 之後立刻送，不必再等 100 毫秒」）
- [ ] 3.4 連線被換掉時重置節流與「上次送出的位置」（D4）；驗證 `FE-R03-S06` 通過
- [ ] 3.5 **負向驗證**：把「只有送出成功才更新上次送出的位置」改成「不管有沒有送都更新」，確認 `FE-R03-S05` 變紅；還原
- [ ] 3.6 **負向驗證**：把重置拿掉，確認 `FE-R03-S06` 變紅；還原

## 4. 對真後端驗一次（不進 CI）

- [ ] 4.1 兩個連線：A 觀察、B 用同步邏輯送位置，斷言 A 看到 B 的座標跟著變。沿用 `FE-R07` 的整合測試 harness
- [ ] 4.2 斷言**送出的頻率不超過 10 Hz**，而且**靜止時是 0**
- [ ] 4.3 貼實際輸出

## 5. 完成前的驗證

- [ ] 5.1 `openspec validate fe-r03-position-sync --strict` 通過，貼輸出
- [ ] 5.2 `npm run lint && npm run typecheck && npm test && npm run build` 全綠，貼輸出（測試數量要看得到）
- [ ] 5.3 `bash .github/scripts/progress.sh --check` rc=0，貼輸出
- [ ] 5.4 跑缺口報告並對每一條缺口說出處置。**Scenario ID 寫在 `it` 標題上**
- [ ] 5.5 確認這一刀**沒有**決定背景頁籤的策略、沒有處理回聲、沒有做插值 —— `git diff --stat` 的檔案清單當證據
