## 1. 規格

- [ ] 1.1 規格已在 PR 上談定：`spec/fe-w04-physics` 合併進 `main`；驗證：`git log --oneline main -- openspec/changes/fe-w04-physics/proposal.md` 有輸出

## 2. 物理世界與角色 collider（Requirement: 角色會被靜態障礙物擋住）

- [ ] 2.1 導入 Rapier，角色用 **kinematic character controller**（不是 dynamic）；驗證：`npm run build` rc=0
- [ ] 2.2 走向牆會停下來；驗證：單元測試建世界、step、斷言位置沒有越過牆（Scenario `FE-W04-S01`）
- [ ] 2.3 沿著牆斜走會滑動，不完全停住；驗證：Scenario `FE-W04-S02`
- [ ] 2.4 空曠時位移等於期望值；驗證：Scenario `FE-W04-S03`

## 3. 邊界（Requirement: 遊玩區域有邊界）

- [ ] 3.1 四周用**靜態 collider**，**不得用夾座標**；驗證：朝邊界走很久仍在範圍內（Scenario `FE-W04-S04`）
- [ ] 3.2 **負向驗證**：把邊界改成夾座標，觀察 `S04` 是否仍過 —— 若仍過，補一條斷言讓它區分得出來；驗證：記錄結論

## 4. 穿牆防護（Requirement: 任何速度都不得穿牆）

- [ ] 4.1 單幀位移遠大於牆厚時仍不穿過；驗證：Scenario `FE-W04-S05`
- [ ] 4.2 **負向驗證**：把移動改成「先移動再檢查重疊」，`S05` 要從綠變紅（`S01` 可能仍綠 —— 那正是低速測不出高速問題的證明）；驗證：記錄兩次的退出碼與哪幾條變紅

## 5. Sensor（Requirement: Sensor 回報重疊但不擋路）

- [ ] 5.1 sensor 不擋住移動；驗證：Scenario `FE-W04-S06`
- [ ] 5.2 進入與離開時重疊查詢的結果會變；驗證：Scenario `FE-W04-S07`

## 6. 不進 React（Requirement: 物理狀態不進 React）

- [ ] 6.1 位置由 rigid body 持有，不每幀寫 React state；驗證：Scenario `FE-W04-S08`

## 7. 接上 world-player（MODIFIED Requirement）

- [ ] 7.1 `LocalPlayer` 改成把期望位移交給 character controller；**`FE-W03` 的純函式一個都不改**；驗證：`git diff` 顯示 `input.ts`／`movement.ts`／`animation.ts`／`facing.ts` 未變更
- [ ] 7.2 `tests/player.test.ts` 的 `FE-W03-S05`／`S06`／`S07` 仍然綠（它們驗的是**期望位移**，語意沒變）；驗證：`npm test` rc=0 且 Scenario ID 不變

## 8. 完成前的驗收

- [ ] 8.1 交出 Scenario ID ↔ 測試的對照表，`FE-W04-S01`–`S08` 每一條都指得出對應的測試；驗證：表格中沒有空格
- [ ] 8.2 貼出四個指令的實際輸出
- [ ] 8.3 走完 `design.md`〈驗證方式〉的 V1–V3（production build），留截圖
- [ ] 8.4 記錄 build 的 chunk 大小，跟 `FE-W01` 那次的 866K 對照，給 `FE-O12`；驗證：數字貼在 PR 上
- [ ] 8.5 `npx openspec validate fe-w04-physics --strict` 通過，且本檔案沒有殘留的未完成項
