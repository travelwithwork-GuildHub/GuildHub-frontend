## 1. 規格

- [ ] 1.1 規格已在 PR 上談定（`spec/fe-w06-spatial-interaction` 合併進 `main`）。
      驗證：`npx --no-install openspec validate fe-w06-spatial-interaction --strict` 通過且 PR 已合併

## 2. 目標選擇（純函式，`FE-W06-S01`～`S07`）

- [ ] 2.1 `src/world/interaction/target.ts`：`chooseTarget(候選、角色位置與朝向、目前目標)`。
      **不 import React 也不 import three** —— 跟 `physics/world.ts` 同一個理由，
      這樣它在 jsdom 裡完全驗得到
- [ ] 2.2 `FE-W06-S01`／`S02`：範圍外沒有目標；範圍內只有一個時它就是目標
- [ ] 2.3 `FE-W06-S03`：等距時朝向的那一個贏，轉身之後換人。
      **負向**：把朝向的權重設成 0 → 這條必須紅
- [ ] 2.4 `FE-W06-S04`：微幅來回時目標維持不變，切換次數有上界。
      **負向**：把遲滯門檻設成 0 → 這條必須紅，而且要記錄它切換了幾次
- [ ] 2.5 `FE-W06-S05`：完全平手且沒有目前目標時，結果由 id 決定且可重複
- [ ] 2.6 `FE-W06-S06`／`S07`：距離跟著移動改變；**沒有目標時距離不得是 0**

## 3. 註冊表與 contract（`FE-W06-S15`、`S16`）

- [ ] 3.1 `src/world/interaction/registry.ts`：建立一次就不換掉的 Map，
      register／unregister。**不進 React state**
- [ ] 3.2 `FE-W06-S15`：卸載後不得再被選為目標，而且如果它原本是目標，React 要收到更新
- [ ] 3.3 `FE-W06-S16`：id 重複要明顯失敗。
      **負向**：拿掉那個檢查 → 這條必須紅

## 4. 接上 render loop 與 React（`FE-W06-S08`、`S09`）

- [ ] 4.1 `src/world/interaction/SpatialInteraction.tsx`：每幀算，比對前一個 id，
      只有改變才 `setState`
- [ ] 4.2 `FE-W06-S08`：連續移動很多幀、目標改變 N 次 → React 更新次數與 N 同階。
      **負向**：拿掉比對 → 更新次數變成跟幀數同階
- [ ] 4.3 `FE-W06-S09`：走出所有範圍時 React 收到「沒有目標」

## 5. 按鍵與提示（`FE-W06-S10`～`S14`）

- [ ] 5.1 `E` 只觸發 active target，且只觸發一次
- [ ] 5.2 `FE-W06-S11`：沒有目標時按 `E` 不得拋錯
- [ ] 5.3 `FE-W06-S12`：目標在按鍵被處理之前註銷 → 不得觸發已消失的物件、不得拋錯
- [ ] 5.4 `FE-W06-S13`／`S14`：DOM 提示出現、**含物件的顯示名稱**、換人時跟著換

## 6. 修訂已封存的 world-physics（`FE-W04-S09`）

- [ ] 6.1 `FE-W04-S09`：角色與 sensor 之間隔一道實心 collider，重疊**仍然**回 true。
      這條是把量測釘住，避免之後有人假設 sensor 處理了遮蔽
- [ ] 6.2 `FE-W04-S07` 補上「物理世界已經步進過」這個前提。
      **負向**：在 `world.step()` 之前查 → 回 false（無聲）

## 7. 待答問題的答案

- [ ] 7.1 Q1 遲滯門檻：記錄**開始閃爍的那個值**，不是只記最後選的
- [ ] 7.2 Q2 互動範圍半徑：記錄今天取的值，並註明真正的數字要等 `FE-W12`
- [ ] 7.3 Q3 朝向權重：兩個判準情況都要貼實際輸出
