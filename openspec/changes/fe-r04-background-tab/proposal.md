## Why

分頁切到背景時 `requestAnimationFrame` 會停。位置同步、本地角色、遠端角色的
render loop **全部**掛在 rAF 上，所以那一刻起：本地角色不動、位置不送、畫面不更新。
**這件事目前沒有任何一行程式碼決定過** —— 它是三個 `useFrame` 的副作用。

工作分解表上的原文是「決定要斷線還是降頻」。量過與讀過之後，答案是**兩個都不做**，
但**有一件事非做不可**，而它不在原本的敘述裡。

### 為什麼不斷線

匿名連線的身分是**每條連線一個新的 `uuid4`**（後端 `_identify()`：
沒有 session 就 `str(uuid.uuid4())`）。切到背景就斷線的話：

- 回來時是**另一個人** —— 別人看到你離開又進來，而且是新的 id
- 名單、狀態文字、房間裡的位置全部重來

### 為什麼不另外做降頻

rAF 停下來的時候，送出這件事**已經停了**。再寫一套「背景就降頻」是在
既有的 0 Hz 上再加一層狀態，而多一種狀態就多一種只在特定時序下出現的 bug。

### 那件非做不可的事

**按著方向鍵切到背景，`keyup` 不會回到這一頁。** 回到前景時
`pressed` 集合裡那個鍵還在，角色會自己一直走 —— 而且會一直送位置出去。

現在只有 `window` 的 `blur` 會清掉按鍵狀態。`blur` 涵蓋不到
「分頁被隱藏但視窗仍有焦點」與「頁面被放進 bfcache」這兩種。

> 這一條是 codex 的 gpt-5.6-terra 與 Antigravity 的 Gemini 3.1 Pro **各自獨立**
> 指出來的 —— 我原本的結論是「什麼都不做」。

## What Changes

- **連線在分頁隱藏時保持開啟**，不主動關閉、不重連。寫成 Requirement
- **不新增任何背景降頻邏輯**。rAF 停止就是降頻，這是刻意的
- **輸入狀態在 `blur`、`visibilitychange`→`hidden`、`pagehide` 都要清掉**
  （目前只有 `blur`）—— 這是唯一的正式碼變更
- 補一條「回到前景不補送」的 Scenario：一個超長的幀最多只送一則

## Capabilities

### New Capabilities

（無）

### Modified Capabilities

- `realtime-client`: 新增「分頁隱藏時不主動關閉連線」
- `position-sync`: 新增「超長的一幀最多只送一則，不補送中間的位置」
- `world-player`: 新增「失去焦點或分頁隱藏時清掉按鍵狀態」——
  目前 `blur` 的行為**根本沒有寫進規格**，這一條同時把它補上

## Impact

- 正式碼：`src/world/player/LocalPlayer.tsx` 多掛兩個事件監聽器
- 測試：`tests/` 新增四條 Scenario
- **驗收方式受限**：headless Chromium **無法重現背景分頁**（見 design.md），
  所以這個 change 的驗收是 jsdom 層的事件測試，真實瀏覽器的部分是人工檢查
