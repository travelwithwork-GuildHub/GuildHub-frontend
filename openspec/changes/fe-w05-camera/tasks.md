## 1. 規格

- [ ] 1.1 規格已在 PR 上談定：`spec/fe-w05-camera` 合併進 `main`；驗證：`git log --oneline main -- openspec/changes/fe-w05-camera/proposal.md` 有輸出

## 2. 平滑的純函式（Requirement: 跟隨是平滑的，而且與影格率無關）

- [ ] 2.1 寫 `src/world/camera.ts` 的衰減函式，以**半衰期**參數化，不得用每幀固定係數；驗證：經過一個半衰期剩餘距離減半（Scenario `FE-W05-S04`）
- [ ] 2.2 與影格率無關；驗證：一次 `0.1` 秒 vs 十次 `0.01` 秒得到相同結果（Scenario `FE-W05-S05`）
- [ ] 2.3 極大的 `dt` 收斂到 target 且不越過；驗證：`dt = 60` 秒（Scenario `FE-W05-S06`）
- [ ] 2.4 非有限的 `dt` 拋錯；驗證：Scenario `FE-W05-S07`
- [ ] 2.5 **負向驗證**：把衰減改成每幀固定係數（`* 0.1`），`S05` 要從綠變紅；驗證：記錄兩次的退出碼

## 3. 相機本體（Requirement: 固定的 Orthographic Elevated 相機）

- [ ] 3.1 用 orthographic 取代 `FE-W01` 的 perspective；驗證：Scenario `FE-W05-S01`
- [ ] 3.2 相機位於 target 上方且 +Z 側、看向 target；驗證：投影世界座標 `(+1,0,0)` 與 `(0,0,+1)`，斷言 NDC 的 x 更右、y 更下（Scenario `FE-W05-S02`）
- [ ] 3.3 沒有任何讓使用者旋轉相機的機制；驗證：Scenario `FE-W05-S03`
- [ ] 3.4 **負向驗證**：把相機的 Z 偏移改成負的，`S02` 要從綠變紅 —— 那正是「+Z 變成畫面上方」的錯；驗證：記錄兩次的退出碼

## 4. target 以 ref 傳遞（Requirement: target 以 ref 傳遞，不進 React state）

- [ ] 4.1 target 透過 mutable ref 讀取，不得每幀寫入 React state 或以值當 prop；驗證：Scenario `FE-W05-S08`
- [ ] 4.2 **負向驗證**：把 target 改成 React state 每幀 setState，`S08` 要從綠變紅；驗證：記錄兩次的退出碼

## 5. 構圖（Requirement: 視窗尺寸改變時維持構圖）

- [ ] 5.1 垂直可見範圍固定，水平隨長寬比；驗證：`4:3` → `21:9` 時垂直不變、水平變大（Scenario `FE-W05-S09`）
- [ ] 5.2 世界不被拉扁；驗證：投影一個世界座標上的正方形，畫面長寬比與畫布一致（Scenario `FE-W05-S10`）

## 6. 完成前的驗收

- [ ] 6.1 交出 Scenario ID ↔ 測試的對照表，`FE-W05-S01`–`S10` 每一條都指得出對應的測試；驗證：表格中沒有空格
- [ ] 6.2 貼出 `npm run lint` / `typecheck` / `test` / `build` 四個指令的實際輸出
- [ ] 6.3 人工確認一次：production build 開 `/world`，畫面是俯視、**平行線保持平行**（orthographic 的特徵，perspective 會收斂）；留截圖
- [ ] 6.4 在 `camera.ts` 註解寫明垂直可見高度與半衰期是**暫定值**，`FE-W14` 會調，且**沒有測試釘住它們**（design 的 R1）；驗證：註解存在
- [ ] 6.5 `npx openspec validate fe-w05-camera --strict` 通過，且本檔案沒有殘留的未完成項
