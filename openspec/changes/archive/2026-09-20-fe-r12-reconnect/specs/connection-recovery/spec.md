## Purpose

世界連線在進入 `ready` 之後意外斷掉（後端重新部署、網路切換、瀏覽器把連線收掉）時，前端要自己站起來：
當下把別人的角色清掉（不留鬼影）、讓使用者知道現在沒有連線、用單一的退避迴圈把同一個場景再連一次，
重新握手之後靠既有的「每條連線一次」的路把名單、位置、狀態文字、聊天接回來；卸載、換場景、失去分頁資格時迴圈要停。
協定沒有 session 續接，所以這裡的「恢復」就是誠實地重來一次，而且只在該重來的時候重來 —— 沒有 `ready` 過的失敗歸過場管。

## Applicability

權限：不適用 —— 重連沿用同一個身分與同一張票，不做任何授權判斷
併發：適用 —— 舊 socket 遲到的事件、等待期間再斷、等待期間換場景／卸載、過場進行中原場景斷線、Strict Mode 雙重 effect
持久資料相容性：不適用 —— 不讀寫 Web Storage（票的持有是 `FE-V01`／`FE-N08` 既有的事）
失敗路徑：適用 —— 重連時握手再被拒、後端長時間不在、票失效
測試連到什麼：單元判準不連任何外部服務（socket 用替身、時間與亂數由測試注入）；真瀏覽器判準只打本機自起的 `next start`，WebSocket 用 `routeWebSocket` 偽造、REST 用 `page.route` 偽造，「伺服器關掉連線」由測試腳本對假 socket 呼叫 close。不連任何團隊共用的位址。

## ADDED Requirements

### Requirement: `ready` 之後意外斷線要當下清鬼影、讓使用者知道，並自動重連

世界連線在**這個場景的連線曾經進入 `ready`** 之後收到不是自己發起的 `close` 事件時（任何關閉碼 —— 客戶端分不出原因，`realtime-client` 那條量過），系統 SHALL 在同一個 tick：
清空遠端名單與動態容器（畫面上 SHALL NOT 留下任何遠端角色）、把在線人數回報成「未知」（`null`，SHALL NOT 是 0）、
以及開始一則 `role="status"` 的通知，讓使用者可辨識**目前沒有連線、系統正在重新連線**（不是 `alert`：這不是使用者做錯什麼）。
系統 SHALL 對**同一個 scene、同一張票**重連：等待期間 SHALL NOT 建立任何連線，等待時間到 SHALL 建立恰好一條新連線，位址的 `scene` 與 `token` 跟斷掉的那條一樣。
重連 SHALL NOT 改網址、SHALL NOT 換場景、SHALL NOT 丟票。斷線期間送狀態文字 SHALL 得到 `FE-K05-S03` 既有的 offline 回饋。

#### Scenario: [FE-R12-S01] 伺服器關掉連線：名單立刻清空、人數未知、通知出現、等待後恰好一條新連線

- **GIVEN** 大廳連線 `ready`、名單裡有乙、在線人數 2
- **WHEN** socket 發出 `close`（code 1012、`wasClean=false`），前端沒有呼叫過 `close()`
- **THEN** 名單 SHALL 立刻是空的、遠端動態容器 SHALL 是空的、在線人數回報 SHALL 是 `null`
- **AND** DOM SHALL 有一則 `role="status"` 的通知，可辨識為「連線中斷、正在重新連線」
- **AND** 等待時間到之前 SHALL NOT 建立任何新連線；到了 SHALL 建立恰好一條，位址的 `scene` 是 `lobby`、沒有 `token`（房間的話 `token` SHALL 跟原來那條相同）
- **AND** 網址 SHALL 不變；持有的票 SHALL 仍在

#### Scenario: [FE-R12-S02] 斷線期間設狀態文字：offline 回饋，不拋

- **GIVEN** `S01` 之後、重連還沒 `ready`
- **WHEN** 設定狀態文字
- **THEN** 結果 SHALL 是 `offline`（`FE-K05-S03`）、SHALL NOT 送出任何訊息、SHALL NOT 拋錯

### Requirement: 重連的等待時間是指數退避加 full jitter；成功後歸零；沒有次數上限

第 `n` 次重連（`n` 從 0 起算）距上一次關閉的等待時間 SHALL 是 `r × min(30 秒, 1 秒 × 2^n)`，`r` 是一個 `[0, 1)` 的亂數（full jitter；亂數來源可注入）。
重連進入 `ready` 之後 `n` SHALL 歸零。重連時握手再被拒（`close` 且從未 `open`）、`open` 了但沒等到 `hello` 就 `close`、或 `ready` 後再次斷線，SHALL 各算下一次（`n + 1`）；
系統 SHALL 繼續重連，MUST NOT 因為次數放棄；等待時間 SHALL NOT 超過 30 秒。

#### Scenario: [FE-R12-S03] 退避的區間：0 → 1s、3 → 8s、5 以上 → 30s 封頂；成功後回到第 0 次

- **GIVEN** 亂數來源固定回 0.5
- **WHEN** 第 0、3、5、10 次重連
- **THEN** 距上一次關閉 SHALL 分別是 0.5 秒、4 秒、15 秒、15 秒才建立新連線；那之前 SHALL NOT 建立
- **AND WHEN** 亂數來源固定回 0.999、第 20 次重連
- **THEN** 等待 SHALL 小於 30 秒
- **AND WHEN** 連續 3 次握手被拒（`close` 且從未 `open`）之後第 4 次 `ready`、再斷一次
- **THEN** 第 1～3 次的等待 SHALL 分別是 1、2、4 秒（亂數 0.5）；再斷之後那一次 SHALL 是 0.5 秒（歸零）

#### Scenario: [FE-R12-S04] 後端長時間不在：每次握手被拒都再等再連，不放棄；回來就接上

- **GIVEN** `S01` 之後
- **WHEN** 連續 6 次重連都在 `open` 之前就收到 `close`
- **THEN** 每一次之後 SHALL 各再建立一條（總共 7 條，任何時刻至多一條尚未 `close` 的）；通知 SHALL 一直在；SHALL NOT 出現任何 `alert`、SHALL NOT 回大廳
- **AND WHEN** 第 7 條 `open`、收到 `hello` 與 `snapshot`
- **THEN** 連線 SHALL 是 `ready`；名單 SHALL 是新 snapshot 的內容；通知 SHALL 消失

### Requirement: 重連之後走既有的「每條連線一次」的路把一切接回來；舊連線的事件不算

重連成功後（新連線 `ready`）：狀態文字 SHALL 依 `FE-K05-S04` 重送、聊天記憶體 SHALL 依 `FE-R11-S06` 不清（同一個 `wsScene`）、
之後送出的聊天與狀態文字 SHALL 走新連線、位置同步 SHALL 在下一幀就在新連線上送出一則 `pos`（不受舊連線的節流影響）、
名單 SHALL 由新的 `snapshot` 整份重建、在線人數 SHALL 回到有值、通知 SHALL 消失。
舊 socket 在關閉之後遲到的任何事件（`open`／`message`／`close`）MUST NOT 影響名單、連線狀態或重連的排程。

#### Scenario: [FE-R12-S05] 重連成功：狀態重送一則、聊天不清且走新連線、位置重送、名單重建、通知消失；舊 socket 遲到的事件不算

- **GIVEN** `S01` 之後（自己的狀態文字是「趕工中」、聊天記憶體有一則）
- **WHEN** 新連線 `open`、收到 `hello` 與含丙的 `snapshot`
- **THEN** 新連線 SHALL 收到恰好一則 `{"t":"status","text":"趕工中"}`；聊天記憶體 SHALL 仍有那一則；名單 SHALL 只有丙；在線人數回報 SHALL 是 2；通知 SHALL 消失
- **AND** 下一幀位置同步 SHALL 在新連線上送出一則 `pos`
- **AND WHEN** 送一則聊天、設一次狀態文字
- **THEN** 兩則 SHALL 都出現在新連線上；舊 socket SHALL NOT 收到任何東西
- **AND WHEN** 舊 socket 此時再發 `message`（含乙的 `snapshot`）與 `close`
- **THEN** 名單 SHALL 仍只有丙；連線 SHALL 仍是 `ready`；等待時間過後 SHALL NOT 多建立任何連線

### Requirement: 單一迴圈；卸載、換場景、失去分頁資格時停；過場進行中不重連；沒有 `ready` 過的失敗不歸這裡

任何時刻 SHALL 至多一條尚未呼叫 `close()` 的世界連線（`world-scenes` 那條的同一個約束），等待中的重連 SHALL 至多一次。
等待期間離開世界（卸載，含 React Strict Mode 的第二次 effect）、換場景（含換身分、換外觀那種關掉重開）、分頁資格失去（`FE-R06`）時，
系統 SHALL 取消等待中的重連、等待時間過後 MUST NOT 對原場景建立任何連線；「正在重新連線」的通知 SHALL 消失。
等待時間到的那一刻，系統 SHALL 再確認這條連線仍是**目前場景**的、而且**沒有過場進行中**；不是的話 SHALL 放棄這次重連、不建連線（過場自己會建它的那條）。
**從未 `ready` 過**的連線失敗（第一次進場、過場中握手被拒、`open` 了但沒收到 `hello` 就斷）MUST NOT 觸發重連、MUST NOT 出現「正在重新連線」的通知 ——
那是 `world-scenes` 過場失敗的路（回大廳、`alert`），兩套機制 MUST NOT 對同一次失敗都動手。

#### Scenario: [FE-R12-S06] 等待期間再收到 close、或舊 socket 再發事件：仍只等一次、只建一條

- **GIVEN** `S01` 之後（等待中）
- **WHEN** 舊 socket 再發一次 `close`、再發一則 `message`
- **THEN** 名單 SHALL 仍是空的；等待時間到 SHALL 仍只建立恰好一條新連線

#### Scenario: [FE-R12-S07] 等待期間離開世界、換場景或失去分頁資格：不再對原場景連

- **GIVEN** `S01` 之後（等待中）
- **WHEN** 元件卸載、或分頁資格失去
- **THEN** 等待時間過後 SHALL NOT 建立任何連線；通知 SHALL 消失
- **AND WHEN**（另一回）等待中使用者按門進 `room:<id>`
- **THEN** 等待時間過後 SHALL NOT 對 `lobby` 建立任何連線；房間的連線 SHALL 照 `FE-V01` 的過場建立、恰好一條

#### Scenario: [FE-R12-S08] 從沒 ready 過就失敗：不重連、沒有通知

- **GIVEN** 剛掛載、socket 建了
- **WHEN** socket 在 `open` 之前就 `close`；或（另一回）`open` 了、沒收到 `hello` 就 `close`
- **THEN** 等待時間過後 SHALL NOT 建立任何新連線；SHALL NOT 出現「正在重新連線」的通知；既有的過場結果 SHALL 照舊（過場中就是回大廳＋`alert`，`FE-V01-S06`）

#### Scenario: [FE-R12-S10] 過場進行中原場景斷線：不對原場景重連、任何時刻至多一條連線

- **GIVEN** 大廳連線 `ready`，使用者按門、房間的過場開始（房間那條連線建立中，大廳那條已由過場關閉或正要關閉）
- **WHEN** 大廳的舊 socket 此時發出 `close`（不是過場那次 `close()` 引發的那一則也一樣）
- **THEN** SHALL NOT 對 `lobby` 建立任何新連線；任何時刻至多一條尚未 `close()` 的連線；SHALL NOT 出現「正在重新連線」的通知
- **AND** 過場 SHALL 照 `FE-V01` 結束（進房成功、或失敗回大廳＋`alert`）

### Requirement: 真瀏覽器裡斷線再恢復，兩個人互見的畫面要回來

兩個真瀏覽器在同一個場景互見時，其中一人的連線被伺服器關掉，他的畫面 SHALL 立刻沒有別人、有「正在重新連線」的通知；
系統自動重連成功後（不重新整理、不按任何東西），他的畫面 SHALL 重新看到別人、通知消失，而且他的狀態文字在別人那邊 SHALL 仍看得到。

#### Scenario: [FE-R12-S09] A 被伺服器斷線，自動回來

- **GIVEN** A、B 各自在一個瀏覽器 process、都在大廳、互相在名單裡；A 的狀態文字是「趕工中」，B 看得到
- **WHEN** 伺服器（測試腳本的假 socket）對 A 的連線呼叫 close（code 1012）
- **THEN** A 的畫面上 B 的名字牌 SHALL 消失、SHALL 有 `role="status"` 的「正在重新連線」通知
- **AND WHEN** 假伺服器接受 A 的新連線、送 `hello` 與含 B 的 `snapshot`
- **THEN** A 的畫面上 B 的名字牌 SHALL 回來、通知 SHALL 消失；A 的新連線 SHALL 收到一則 `status` 「趕工中」；B 的畫面上 A 的名字牌 SHALL 仍含「趕工中」
- **AND** 整個過程 A 的網址 SHALL 不變、SHALL NOT 出現任何 `alert`
