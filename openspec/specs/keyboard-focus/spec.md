# keyboard-focus Specification

## Purpose
鍵盤在這個世界裡有兩個主人：走路的世界，與面板、輸入框這些 DOM。這份 capability 決定
**同一個按鍵在什麼時候歸誰**，以及焦點在層與層之間怎麼走、關掉之後去哪裡。

世界命令（移動、E 互動、之後的熱鍵）由一把**可合成的鎖**治理：多個持有者、最後一個放掉才恢復；
持有鎖的有面板、也有取得焦點的文字輸入框 —— 打字不是走路。鎖著時世界的監聽不吃掉按鍵的預設行為。
Escape **每次只關最上層**：詳情 → 列表 → 關面板，一次按鍵一層。持有鎖的面板 Tab 在裡面循環；
詳情關了焦點回那張卡；由世界開的面板關了焦點在明確的世界焦點錨上，不是 `body`。
`AvatarPicker` 這種非阻斷式的彈出層 Escape 關、Tab 走離就關、關了焦點回按鈕、**不鎖世界**。

它改寫了 `list-panel` 與 `talent-directory` 各一條 Requirement（Escape 有子層時不關面板），
不做 aria 全面稽核（`FE-X07`）、不做任何輸入框本身。

## Requirements

### Requirement: Escape 每次只關最上層

一個以上可關閉的 UI 層同時開啟時，按一次 Escape SHALL 只關閉最上層那一層；
沒有子層時，Escape 才關閉該層本身。一次按鍵 SHALL NOT 造成一層以上的變化。

⚠️ **連續看很多個人才的人**：詳情上按一次 Escape 回列表，列表的頁碼與位置還在。
**按錯了想立刻回世界的人**：從詳情要按兩次。後者多一次按鍵，前者省的是重開面板、翻回原頁。

#### Scenario: [FE-X06-S01] 兩次 Escape，一次一層

- **WHEN** 人才面板開著且詳情蓋在上面，使用者按一次 Escape
- **THEN** 詳情 SHALL 不再顯示，面板 SHALL 仍然開啟，列表 SHALL 仍是離開前的頁碼
- **AND** 使用者再按一次 Escape 之後，面板 SHALL 關閉，世界的移動輸入 SHALL 恢復作用

#### Scenario: [FE-X06-S02] 沒有子層時一次就關面板

- **WHEN** 人才面板開著、沒有詳情，使用者按一次 Escape
- **THEN** 面板 SHALL 關閉，世界的移動輸入 SHALL 恢復作用

> ⚠️ **`S01` 與 `S02` 要成對。** 只有 `S01` 的話，「Escape 一律只關詳情、永遠關不掉面板」全綠。
> 而「一次按鍵只有一層變化」的反面是兩個 `window` 監聽在同一次 Escape 裡各關各的。

### Requirement: 世界命令有一把可合成的鎖

世界命令（移動、E 互動、以及之後的世界熱鍵）SHALL 由一把鎖治理。鎖 SHALL 可以被多個持有者
同時持有；任一持有者在，世界命令就不動作；**最後一個持有者釋放之後**才恢復。
每一次取得 SHALL 是獨立的一次，釋放 SHALL 冪等（同一個釋放呼叫兩次不影響別的持有者）。

鎖著時，世界的監聽 SHALL NOT 取消那些按鍵的 DOM 預設行為 —— 那些預設行為是面板或輸入框的。
Escape、Tab 與文字輸入 SHALL 不受鎖影響。

⚠️ **單一 boolean 的鎖是這一列最可能做錯的地方**：文字輸入框還有焦點時關掉一個面板，
面板把鎖寫回 `false` —— 接著打字就變成走路，而畫面上看不出焦點在哪。

#### Scenario: [FE-X06-S03] 兩個持有者，放掉一個不算放

- **WHEN** 鎖被兩個持有者持有，其中一個釋放
- **THEN** 世界命令 SHALL 仍不動作
- **AND** 另一個也釋放之後，世界命令 SHALL 恢復

#### Scenario: [FE-X06-S04] 釋放兩次不影響別人

- **WHEN** 一個持有者的釋放被呼叫兩次，而另一個持有者仍在
- **THEN** 世界命令 SHALL 仍不動作

#### Scenario: [FE-X06-S05] 鎖著時 E 不觸發互動

- **WHEN** 鎖被持有，角色站在互動目標前面，使用者按 E
- **THEN** 互動 SHALL NOT 被觸發

#### Scenario: [FE-X06-S06] 鎖著時世界不吃掉按鍵的預設行為

- **WHEN** 鎖被持有，焦點在一個方向鍵有預設行為的控制上（例如可捲動的列表），使用者按下方向鍵與 E
- **THEN** 那些按鍵事件 SHALL NOT 被 `preventDefault`

> 今天 `LocalPlayer` 已經是「鎖著就 return，不 `preventDefault`」。這一條守的是那個順序：
> 把 `preventDefault` 搬到鎖的判斷前面，或之後加的世界熱鍵順手取消預設行為，這一條要紅。

### Requirement: 焦點在能輸入文字的控制上時，打字不是走路

焦點位於能接受文字的控制（文字類的 `input`、`textarea`、`contenteditable`）時，
鎖 SHALL 被持有；焦點離開這類控制、且沒有轉移到另一個這類控制時，那個持有 SHALL 釋放。
判定 SHALL 在焦點轉移完成後依當時的 `activeElement` 重算，SHALL NOT 在 `focusout` 當下就釋放
（從一個輸入框移到另一個，中間不放鎖 —— 那是內部不變量，由 design 與單元測試守，不是這裡的 Scenario）。
checkbox、radio、button 等不接受文字的控制 SHALL NOT 算在內。

⚠️ **今天世界裡沒有任何文字輸入框**（狀態文字、聊天、搜尋都還沒做）。這一條用測試用的
`<input>` 證明；等第一個輸入框來的時候不必再發明一次鎖 —— 那正是 Alarm 說的「晚做要改每一個面板」。

#### Scenario: [FE-X06-S07] 輸入框有焦點時打 W 不走路、打 E 不互動，而且字進得了欄位

- **WHEN** 一個文字輸入框取得焦點，使用者按下 W 與 E
- **THEN** 世界裡的角色 SHALL NOT 移動，互動 SHALL NOT 被觸發
- **AND** 那兩個按鍵事件 SHALL NOT 被 `preventDefault`

#### Scenario: [FE-X06-S09] 焦點離開輸入框之後，人走得動

- **WHEN** 焦點從文字輸入框移到一個按鈕（或 `body`）
- **THEN** 世界命令 SHALL 恢復

#### Scenario: [FE-X06-S10] 面板關了但輸入框還有焦點，仍然鎖著

- **WHEN** 一個文字輸入框有焦點，期間開啟又關閉一個面板
- **THEN** 面板關閉後世界命令 SHALL 仍不動作，直到焦點離開輸入框

### Requirement: 焦點有邊界，關閉之後有地方去

持有鎖的面板開啟期間，Tab 與 Shift+Tab SHALL 只在面板內循環。
子層（詳情）關閉時焦點 SHALL 回到開啟它的控制（那張卡）；
由 DOM 控制開啟的彈出層關閉時焦點 SHALL 回到那個控制；
由世界互動開啟的最外層面板關閉時，焦點 SHALL 位於一個明確的世界焦點錨 ——
SHALL NOT 落在 `body`，也 SHALL NOT 落在與這次操作無關的標題列控制上。

⚠️ **規格不指定錨是 canvas 還是哪個元素**，也不得寫成「呼叫 `canvas.focus()`」；
它要求的是「關閉之後鍵盤焦點在一個可預測的地方」。

#### Scenario: [FE-X06-S11] 面板內的 Tab 循環

- **WHEN** 人才面板開著，焦點在面板內最後一個可聚焦的元素上，使用者按 Tab
- **THEN** 焦點 SHALL 回到面板內第一個可聚焦的元素，SHALL NOT 到標題列

#### Scenario: [FE-X06-S12] 詳情關閉，焦點回那張卡

- **WHEN** 從某張人才卡開啟詳情，再關閉詳情
- **THEN** 焦點 SHALL 在那張卡上

#### Scenario: [FE-X06-S13] 面板關閉，焦點在世界焦點錨上

- **WHEN** 由按 E 開啟的面板關閉
- **THEN** `activeElement` SHALL 是世界焦點錨，SHALL NOT 是 `body`

### Requirement: 非阻斷式的彈出層：Escape 關、Tab 走離就關、不鎖世界

`AvatarPicker` 這種由 DOM 控制開啟、不阻斷世界的彈出層，SHALL 能以 Escape 關閉，
焦點移出它的範圍時 SHALL 自動關閉；關閉後焦點 SHALL 回到開啟它的控制。
它 SHALL NOT 持有世界命令的鎖 —— 邊走邊看新外觀是 `FE-A05` 的產品意圖。

⚠️ 它開著時按 E 開出看板面板，面板取得焦點 → 彈出層依「焦點移出就關」關掉，草稿被丟
（等同取消，`FE-A05-S03`）。結果是一層、有定義，不需要第二種鎖。

#### Scenario: [FE-X06-S14] 彈出層開著，人走得動

- **WHEN** `AvatarPicker` 開啟，使用者按下移動鍵
- **THEN** 世界裡的角色 SHALL 移動

#### Scenario: [FE-X06-S15] Escape 關彈出層，焦點回按鈕

- **WHEN** `AvatarPicker` 開啟，使用者按 Escape
- **THEN** 彈出層 SHALL 關閉，焦點 SHALL 在「更換角色」按鈕上

#### Scenario: [FE-X06-S16] Tab 走離就關

- **WHEN** `AvatarPicker` 開啟，焦點移到它範圍以外的元素
- **THEN** 彈出層 SHALL 關閉

#### Scenario: [FE-X06-S17] 彈出層開著時按 E 開面板：面板開、彈出層關、草稿丟

- **WHEN** `AvatarPicker` 開啟且有未儲存的草稿，角色站在看板前，使用者按 E
- **THEN** 面板 SHALL 開啟並取得焦點
- **AND** 彈出層 SHALL 關閉，畫面上的自己 SHALL 回到已儲存的外觀
