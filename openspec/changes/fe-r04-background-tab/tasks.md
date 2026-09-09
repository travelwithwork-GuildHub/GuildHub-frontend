## 1. 規格

- [ ] 1.1 規格已在 PR 上談定（`spec/fe-r04-background-tab` 合併進 `main`）。
      驗證：`npx --no-install openspec validate fe-r04-background-tab --strict` 通過且 PR 已合併

## 2. 不斷線（不改正式碼，補測試）

- [ ] 2.1 `FE-R04-S01`：`blur`／`visibilitychange`(hidden)／`pagehide` 之後，
      連線仍是 `ready`、`close` 沒被呼叫、**`selfId` 沒有改變**
      （第三個斷言才是重點 —— 只驗前兩個的話，「關掉再立刻開一條」照樣綠）

## 3. 回到前景不補送（不改正式碼，補測試）

- [ ] 3.1 `FE-R04-S02`：只推進一幀、那一幀 300 秒 → 正好送一則，
      而且座標是當下的位置

## 4. 輸入狀態的生命週期（**唯一的正式碼變更**）

- [ ] 4.1 `LocalPlayer` 除了 `blur`，再掛 `visibilitychange`（只在 `hidden` 時清）
      與 `pagehide`；`useEffect` 的 cleanup 要一起移除
- [ ] 4.2 `FE-R04-S03`：按著鍵 → 派送 `visibilitychange`(hidden) → 角色停下來
- [ ] 4.3 `FE-R04-S04`：`pagehide` 與 `blur` 也要清

## 5. 真實瀏覽器的人工檢查（**沒有自動驗收，見 design.md 的 D4**）

- [ ] 5.1 開兩個分頁，在 A 按著方向鍵不放，切到 B，等三秒切回 A。
      **角色必須是停著的。** 把觀察結果寫進 PR
      （headless Chromium 重現不了背景分頁，所以這一條只能是人工的）

## 6. 負向驗證

**驗收條件不是「測試全綠」，是「把防禦拿掉，測試要變紅」。**

- [ ] 6.1 拿掉 `visibilitychange` 監聽器 → **FE-R04-S03** 要紅
- [ ] 6.2 拿掉 `pagehide` 監聽器 → **FE-R04-S04** 要紅
- [ ] 6.3 拿掉 `blur` 監聽器 → **FE-R04-S04** 要紅
- [ ] 6.4 把 `visibilitychange` 改成不看 `visibilityState`（隱藏或顯示都清）→
      要有測試紅（否則那個條件是死的）
- [ ] 6.5 在 `PositionSync` 裡把「每幀最多一則」改成迴圈補送 → **FE-R04-S02** 要紅
- [ ] 6.6 在客戶端加一個 `visibilitychange` → `close()` 的處理 → **FE-R04-S01** 要紅
