## Applicability

權限：不適用 —— 離開房間不做授權判斷（回大廳一律允許）。
併發：適用 —— 穿門觸發是 render loop 每幀讀位置，與過場狀態機同時運作，要防重複觸發。
持久資料相容性：適用 —— 回大廳 MUST NOT 丟票（沿用既有 `sessionStorage` 票儲存）。
失敗路徑：適用 —— 大廳連線失敗沿用〈進不去就回 Guild Hall〉既有處置；本 change 不改那條。

## MODIFIED Requirements

### Requirement: 房間裡隨時回得了 Guild Hall

離開房間 SHALL 以**空間動作**為主：這是一個 3D 世界，離開一個場景的直覺是「走出去」，不是點畫面角落的按鈕。
系統 SHALL 同時提供三條回大廳的路，全部走**同一套過場**（關房間連線、以 `scene=lobby` 不帶票重連、角色放到 Guild Hall 出生點、`pushState` 成 `/world`）、且全部 MUST NOT 丟棄持有的票：

1. **穿門即走（主要）**：`room` 場景南牆中央的門洞是出口。本地角色往南穿過門洞、進到門廊，位置到達 `z ≥ 10.5` 且 `|x| ≤ 0.75` 時，
   系統 SHALL 自動開始回大廳的過場，**不需要按任何鍵**。觸發 SHALL 是**一次性的**：同一次進房只觸發一次（過場一開始移動就被既有的過場鎖鎖住，
   角色不會在門廊繼續往南、也不會重複觸發）。門檻刻意放在門洞**以南**（門在 `z = 9.75`、出生點在 `z = 6.75`）：要**刻意往南穿過門**才會觸發，
   在房間裡正常走動 MUST NOT 誤觸。
2. **門前按 E（對稱、可發現）**：本地角色走到那扇門的互動範圍、面對它時，SHALL 顯示互動提示「回到大廳」；按 E SHALL 開始同一套回大廳過場。
   這讓出口「看得出是出口」，也給習慣「門前按 E」的使用者一個對稱選項。
3. **DOM 按鈕（無障礙後備）**：`room` 場景 SHALL 常駐一顆 DOM 按鈕「回到 Guild Hall」（在標題列，不被 Canvas 蓋住），`hall` 場景 SHALL 沒有它。
   它是純鍵盤／讀屏使用者、以及在 3D 裡卡住的人的**逃生門**，SHALL 保留；按下走同一套過場。

進房需要按 E、離開用走的**不對稱是刻意的**：進房是「決策」（大廳有多扇門，要確認），離開是「釋放」（房間單一出口，走出去意圖已經很明確）。
這個不對稱同時**避免了傳送迴圈** —— 回大廳後即使按著前進鍵也 MUST NOT 自動再進房（進房一律要按 E）。

> 拔掉什麼會紅：不註冊穿門觸發 → S20（穿過門洞沒有回大廳）；穿門觸發不是一次性 → S20 的「只建一條大廳 socket」；
> 門檻放在門北（`z < 9.75`）或不限 `x` → S20 的「正常走動不誤觸」；不註冊門的 E 互動 → S21（門前沒有提示、按 E 沒反應）；
> 拿掉 DOM 按鈕 → S13（`room` 場景該有那顆按鈕）。

#### Scenario: [FE-V01-S13] 按「回到 Guild Hall」

- **GIVEN** 在 `room:<id>`，連線 `ready`
- **WHEN** 按下「回到 Guild Hall」
- **THEN** 房間 socket SHALL 先關閉，新 socket 的位址 SHALL 是 `scene=lobby` 且**沒有** `token`；網址 SHALL 是 `/world`
- **AND** `sessionStorage` 裡那間房的票 SHALL 仍在
- **AND WHEN** 瀏覽器上一頁
- **THEN** 網址 SHALL 回到 `/world?room=<id>` 並開始進房間的過場（證明按鈕是 `pushState` 不是 `replaceState`／`back()`）；頁面 SHALL 沒有整個重新載入
- **AND WHEN** 場景是 `hall`
- **THEN** 那顆按鈕 SHALL 不存在於 DOM

#### Scenario: [FE-V01-S19] 上一頁進到進不去的房：失敗處置一樣，網址不留一層

- **GIVEN** 從 `room:<id>` 按「回到 Guild Hall」回到大廳（紀錄是 `…?room=<id>` → `/world`）
- **WHEN** 瀏覽器上一頁，這次房間的 socket 在 `open` 之前就 `close`
- **THEN** SHALL 建立 `scene=lobby` 的連線、顯示通知；網址 SHALL 是 `/world`（`replaceState`）
- **AND WHEN** 再按瀏覽器上一頁
- **THEN** 網址 SHALL 是進房間**之前**的那一筆（不是 `?room=<id>`）—— 失敗那一格被 replace 掉了

#### Scenario: [FE-V01-S20] 穿過門洞往南走，自動回大廳（不用按鍵）；正常走動不誤觸

- **GIVEN** 在 `room:<id>`、連線 `ready`、`sessionStorage` 持有那間房的票、角色在出生點（`z = 6.75`）
- **WHEN** 角色在房間裡正常走動（沒有穿過南邊門洞、`z` 一直 `< 10.5`）
- **THEN** SHALL 沒有回大廳的過場、SHALL 沒有新的大廳 socket（不誤觸）
- **AND WHEN** 角色往南穿過門洞、位置到達 `z ≥ 10.5` 且 `|x| ≤ 0.75`
- **THEN** 系統 SHALL 開始回大廳的過場：房間 socket 關閉、新 socket 是 `scene=lobby` 不帶 `token`、網址 `pushState` 成 `/world`
- **AND** 那張票 SHALL 仍在
- **AND** 這一次穿門 SHALL 只建立**一條**大廳 socket（一次性觸發，過場鎖住移動後不重複觸發）
- → 驗於：jsdom（餵位置序列給觸發器、斷言 `returnToHall` 恰好一次）、e2e（真瀏覽器：往南走穿門、量到回大廳、只有一條 lobby socket）

#### Scenario: [FE-V01-S21] 走到出口門前，提示「回到大廳」、按 E 離開

- **GIVEN** 在 `room:<id>`、連線 `ready`、角色走到南邊那扇門的互動範圍、面對它
- **WHEN** 讀互動提示
- **THEN** 提示 SHALL 是「回到大廳」
- **AND WHEN** 按 E
- **THEN** 系統 SHALL 開始回大廳的過場（同 S13 的連線與網址處置）；票 SHALL 仍在
- → 驗於：jsdom、e2e
