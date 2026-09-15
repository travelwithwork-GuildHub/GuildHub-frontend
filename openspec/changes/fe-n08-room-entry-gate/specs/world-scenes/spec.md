## Applicability

權限：不適用 —— 本 delta 只加一個通知的消失條件。
併發：不適用。
持久資料相容性：不適用。
失敗路徑：適用 —— 這條本來就是失敗處置。
測試連線：jsdom 不連任何服務。

## MODIFIED Requirements

### Requirement: 進不去就回 Guild Hall、說一句話、不重試、票留著

新連線在 `open` 之前就關閉（`opened === false`），或自呼叫 `connect()` 起 **10 秒**內沒有 `ready`，系統 SHALL 視為進入失敗：
自動回到 Guild Hall（重新以 `scene=lobby`、不帶票建立連線）、網址以 `replaceState` 改回 `/world`（不多一層紀錄）、
顯示一則 `role="alert"` 的通知。通知 MUST NOT 宣稱失敗原因（客戶端分不出來）；語彙固定為
「進不了這間房 —— 可能暫時連不上，或通行證已經失效、房間已經關閉。已回到 Guild Hall。」
系統 MUST NOT 自動重試進入那間房；MUST NOT 丟棄持有的票（連不上跟票失效分不出來，丟票會讓網路瞬斷的人重輸一次密碼；換票是 `FE-N08` 的事）。
通知 SHALL 留到下一次**使用者發起的**成功進入任何場景（按 E、按「回到 Guild Hall」、上一頁）、使用者關閉它、使用者從通知啟動「重新輸入密碼」**且票已確認丟棄、視窗開啟**（`room-entry-gate`，`FE-N08`；丟票失敗時通知留著）、或被下一則通知取代為止。
失敗之後**系統自動**回大廳的那次連線 `ready` MUST NOT 清掉它 —— 大廳的 `hello` 在幾毫秒內就到，清了沒有人看得到通知。

10 秒 SHALL 是一個具名常數、測試可注入；背景分頁的計時器被瀏覽器節流時允許晚觸發（`FE-R04` 管背景分頁）。

回大廳的連線本身也可能失敗 —— 那時過場狀態 SHALL 仍然結束（覆蓋層消失、輸入解鎖、場景是 `hall`），
交給大廳既有的失敗呈現；MUST NOT 永久 busy。

#### Scenario: [FE-V01-S06] 10 秒沒有 hello 就回大廳，票還在、網址不多一層

- **GIVEN** `sessionStorage` 持有 `room:<id>` 的票，在 `/world?panel=profiles`
- **WHEN** 進入房間，新 socket `open` 了但 10 秒內沒有送 `hello`（假時鐘）
- **THEN** 第 10 秒時 SHALL 關閉那條連線、建立 `scene=lobby` 的連線、顯示上述通知；第 9.9 秒時 SHALL 還在過場中
- **AND** 那張票 SHALL 仍在；網址 SHALL 是 `/world`，且瀏覽器上一頁 SHALL 回到 `/world?panel=profiles`（中間沒有一層 `?room=`）

#### Scenario: [FE-V01-S07] 握手被拒：回大廳、不再試

- **WHEN** 進入房間，新 socket 在 `open` 之前就 `close`（`code=1006`）
- **THEN** SHALL 建立 `scene=lobby` 的連線並顯示通知
- **AND** 跑完所有排程中的計時器之後，對 `room:<id>` 的 `createSocket` SHALL 仍只被呼叫過一次
- **AND WHEN** 再走到門前按 E（**沒有**關閉通知）
- **THEN** SHALL 以同一張票再開始一次過場（重試是使用者做的，不是系統做的）；過場開始時那則通知 SHALL 還在
- **AND WHEN** 第二次也被拒
- **THEN** `role="alert"` SHALL 恰好一個（被取代，不是疊兩個）
- **AND WHEN** 使用者關閉通知
- **THEN** SHALL 沒有 `role="alert"` 的元素
- **AND WHEN** 第三次按 E 且這次 `ready`；接著再讓第四次被拒、然後按「回到 Guild Hall」成功
- **THEN** 第三次 `ready` 時 SHALL 沒有 alert；第四次之後有一個；回大廳成功後 SHALL 沒有（使用者發起的成功進入都清）
- **AND** 每一次被拒之後系統自動回大廳的那條連線 `ready` 時，alert SHALL 仍在

#### Scenario: [FE-V01-S16] 回大廳也連不上時，不會永久 busy

- **WHEN** 進入房間被拒，接著大廳的連線也在 `open` 之前關閉
- **THEN** 覆蓋層 SHALL 在大廳連線關閉時消失、輸入 SHALL 解鎖、場景 SHALL 是 `hall`
- **AND** SHALL 沒有第三條連線被建立
