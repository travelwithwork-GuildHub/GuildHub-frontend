# `FE-X06` 鍵盤與焦點

## Why

世界的移動監聽掛在 `window`。今天有一把鎖（`FE-B01`）：看板面板開著時角色不動。
但它是**一個 boolean**，持有者只有「面板開著」這一件事 —— 而下面四件事已經在 main 上或馬上要來：

1. 人才詳情（`FE-B04`）蓋在面板上：**Escape 是退一層還是關整個面板**，`FE-B04` 明寫留給這一列。
2. `AvatarPicker`（`FE-A05`）：**沒有 Escape、Tab 走出去它還開著**。
3. 世界裡的第一個文字輸入框（狀態文字、聊天、搜尋）來的時候，**打字會變成走路**，
   而且如果面板關閉時把鎖寫回 `false`，輸入框還有焦點也一樣走。
4. 按 E 開的面板關掉之後，**焦點掉到 `body`**；e2e 已經抓到過一次「返回之後 Tab 跑去標題列」。

工作分解表把這一列標成 **Alarm｜晚做要改每一個面板**。現在面板有兩層、彈出層有一種、
輸入框零個 —— 是最便宜的時候。

## What Changes

- **Escape 每次只關最上層**：詳情 → 列表 → 關面板，一次按鍵一層。
  這改變了兩條已封存的 Scenario（`FE-B01-S16`、`FE-B04-S14`），本 change 對那兩個 capability 提 MODIFIED，ID 不變。
- **鎖變成可合成的**：多個持有者、token 式、釋放冪等；`inputLockRef.current` 變成推導值。
  鎖著時**所有世界命令**（移動、E、之後的熱鍵）都不動作，且世界的監聽不 `preventDefault`；
  Escape、Tab、文字輸入不受影響。**今天 E 不看鎖** —— 輸入框有焦點時打一個 `e` 會觸發互動。
- **文字輸入框有焦點就持有鎖**：只算能接受文字的控制；焦點轉移完成後依 `activeElement` 重算。
  今天沒有實例，用測試用的 `<input>` 證明。
- **焦點邊界與歸還**：持有鎖的面板 focus trap；詳情關閉回那張卡；彈出層關閉回開它的按鈕；
  按 E 開的面板關閉後焦點在一個明確的世界焦點錨（不是 `body`）。
- **`AvatarPicker`**：補 Escape、Tab 走離即關、關閉回按鈕；**不鎖世界** —— 邊走邊看新外觀是 `FE-A05` 的產品意圖。

## ⚠️ 三輪討論談定的取捨

### Escape 是 pop，不是 close

兩個審查者第一輪就一致。連續看很多個人才的人省的是「重開面板、翻回原頁」；
按錯了想回世界的人多按一次。`FE-B04` 當時互換過立場、最後把這條交給這一列 —— 現在裁。

### 鎖是 token 式的，不是 reason 字串的 Set

同一個 reason 可能同時持有兩次（StrictMode 雙重掛載、兩個同類面板）；用字串當身分會提早釋放。
每次取得一個獨立 token，釋放只移除自己的、重複呼叫無效。

### `AvatarPicker` 不鎖世界，也不擋 E

一個審查者第二輪主張「不鎖移動但擋 E」（picker 底下按 E 開出面板會疊層）——
代價是鎖要有兩種治理能力。第三輪兩邊收斂到不擋：面板取得焦點 → picker 依「焦點移出就關」關掉，
草稿被丟等同取消（`FE-A05-S03`）。結果是一層、有定義，鎖只有一種。這條寫成獨立的 Scenario（`S17`）。

### 世界焦點錨是產品義務，錨是什麼元素不是

「關閉後焦點在可預測的地方」是義務；`canvas.focus()` 是手段。規格不指定元素，判準用語意識別。

## ⚠️ 不做什麼

- **SHALL NOT 做 aria 全面稽核、對比、螢幕閱讀器路徑。** 那是 `FE-X07`（W5）。
- **SHALL NOT 做任何文字輸入框本身**（狀態文字、聊天、搜尋歸各自的列）。
- **SHALL NOT 加 Escape 以外的快捷鍵。**
- **SHALL NOT 承諾 3D 世界本身可由螢幕閱讀器操作。**
- **SHALL NOT 把 `canvas.focus()`、`stopPropagation()` 或某個 React 寫法寫進 Requirement。**
- **SHALL NOT 做通用的 dialog framework。** 只交付可合成的鎖、層級式 Escape、兩種既有 UI 的接線。

## Impact

- 新增 `openspec/specs/keyboard-focus/`；MODIFIED `list-panel`、`talent-directory` 各一條 Requirement
- `src/world/interaction/InteractionProvider.tsx`：鎖改成 token 式（`holdInputLock`），`inputLockRef` 變推導值
- `src/world/interaction/SpatialInteraction.tsx`：E 看鎖
- 新增世界層的「文字輸入焦點持有鎖」元件與「世界焦點錨」
- `src/list-panel/`：Escape 只關最上層；focus trap；關閉回錨；詳情關閉回那張卡
- `src/app/world/AvatarPicker.tsx`：Escape、Tab 走離即關、關閉回按鈕
