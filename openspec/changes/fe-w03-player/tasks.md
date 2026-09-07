## 1. 規格

- [x] 1.1 規格已在 PR 上談定：`spec/fe-w03-player` 合併進 `main`；驗證：`git log --oneline main -- openspec/changes/fe-w03-player/proposal.md` 有輸出

## 2. 輸入（Requirement: 鍵盤輸入變成方向）

- [x] 2.1 純函式：按鍵集合 → X／Z 方向向量，WASD 與方向鍵等價；驗證：Scenario `FE-W03-S01` `FE-W03-S02`
- [x] 2.2 相反的鍵互相抵消，沒按鍵回零向量；驗證：Scenario `FE-W03-S03` `FE-W03-S04`
- [ ] 2.3 接上真的鍵盤事件，**卸載時要移除監聽**；驗證：卸載前後 `window` 上的監聽數量回到基準（沿用 `FE-W01-S08` 那套量法）

## 3. 移動（Requirement: 移動有速度上限，對角線不得更快）

- [x] 3.1 方向正規化之後乘速度與 `dt`；驗證：對角線的位移不大於直線（Scenario `FE-W03-S05`）
- [x] 3.2 與影格率無關；驗證：一次長間隔 vs 多次短間隔位移相同（Scenario `FE-W03-S06`）
- [x] 3.3 非有限的 `dt` 拋錯；驗證：Scenario `FE-W03-S07`
- [x] 3.4 **負向驗證**：拿掉正規化，`S05` 要從綠變紅 —— 那正是「斜著走比較快」那個 bug；驗證：記錄兩次的退出碼

## 4. 朝向（Requirement: 朝向用既有的那一份對映）

- [x] 4.1 import `world-coordinates` 的 `facingFromDirection`，**不得自己再寫一次判斷**；驗證：Scenario `FE-W03-S08`
- [x] 4.2 靜止時保留前一個朝向；驗證：Scenario `FE-W03-S09`
- [x] 4.3 確認沒有第二份朝向判斷：`grep -rn "facing\|FACING" src/` 的命中只有 `coords.ts` 的定義與這裡的 import；驗證：貼出 grep 結果

## 5. 動畫（Requirement: Idle 與 Walk 的程式動畫）

- [x] 5.1 純函式：速度 → 動畫狀態（Idle／Walk）；驗證：Scenario `FE-W03-S10` `FE-W03-S11`
- [x] 5.2 相位用**累積時間**推進，切換狀態時不重置；驗證：Scenario `FE-W03-S12`
- [ ] 5.3 角色用 primitive 組出來，**不載入任何外部模型**；驗證：`grep -rn "useGLTF\|GLTFLoader\|\.glb\|\.gltf" src/` 沒有命中
- [x] 5.4 **負向驗證**：切換狀態時重置相位，`S12` 要從綠變紅；驗證：記錄兩次的退出碼

## 6. 相機接上角色（Requirement: 相機跟著角色）

- [ ] 6.1 角色的位置寫進相機的 target ref，**不經過 React state**；驗證：Scenario `FE-W03-S13`
- [ ] 6.2 **負向驗證**：把位置改成 React state 每幀 setState，`S13` 要從綠變紅；驗證：記錄兩次的退出碼

## 7. 完成前的驗收

- [ ] 7.1 交出 Scenario ID ↔ 測試的對照表，`FE-W03-S01`–`S13` 每一條都指得出對應的測試；驗證：表格中沒有空格
- [ ] 7.2 貼出 `npm run lint` / `typecheck` / `test` / `build` 四個指令的實際輸出
- [ ] 7.3 **走完 `design.md`〈驗證方式〉的 V1–V5（production build）**。**V1 是 `FE-W02` 交接過來的完成條件** —— 按 S／↓ 角色要在畫面上往下走，截圖為證；驗證：五列都有截圖或目視結論
- [ ] 7.4 在程式碼註解寫明速度、Walk 週期、bounce 幅度是**暫定值**且**沒有測試釘住**（design 的 D3／R3）；驗證：註解存在
- [ ] 7.5 `npx openspec validate fe-w03-player --strict` 通過，且本檔案沒有殘留的未完成項
