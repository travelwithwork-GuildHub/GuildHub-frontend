## Applicability

權限：適用 —— 入座仍要通過房間密碼（`POST /seats` 靠 room_token；票失效走既有 403／401 鎖定）；本 change 不改授權，只改觸發入口。
併發：適用 —— 「走近顯示提示」是 render loop 每幀選取目標，「按 E 入座」是有副作用、會失敗的 claim；MUST 邊緣觸發＋送出中鎖定，不得每幀重送、不得走近自動送。
持久資料相容性：適用 —— 不動座位版面與座標，`FE-J13-S08` 里程計尺、`seat_index` 索引域（`FE-W16`）維持不變。
失敗路徑：適用 —— 兩種 409、票失效、服務失敗的回饋與座位重取沿用既有〈失敗回饋〉〈以重取為準〉，只是觸發入口從點按鈕變成按 E。

## MODIFIED Requirements

### Requirement: 一鍵入座：空位有「入座」，按下去就是 `POST seats`；一人一格

這是一個 3D 世界 —— 坐下 SHALL 以**空間動作**為主：走到座位旁邊、按 E，而不是點一顆飄在座位上的常駐按鈕。

有人登入、房間是 `active`、自己還沒有座位時，每個空位 SHALL 是一個**世界裡的互動目標**，掛在該工位的**站位**上
（角色走上通道、站到座位旁邊時面對的那個點 —— 不是標籤、不是桌子；標籤仍是非互動 DOM，見〈房間裡每個座位有一個標籤〉）。
本地角色走進該互動範圍、面對它時，SHALL 顯示互動提示（提示指名「入座」，沿用 `world-interactive-objects` 的提示與目標選取，跟門、看板同一套）；
按 E SHALL 送 `POST /api/projects/{id}/seats` 帶 `{ seat_index, desk_template: 0 }`。

入座 SHALL NOT 由「走近」自動觸發 —— 只有按 E 才承諾入座（入座是有副作用、會失敗的一人一格 claim，不是穿門那種冪等導覽；
自動觸發會把路過、調整走位、旁觀變成意外入座）。同一次按鍵 SHALL 只送一次（送出中該座位鎖定、連按 E 只送一次）；
201 之後 SHALL 重取座位並把那一格畫成自己的。

自己已經有座位時，所有空位 SHALL NOT 是互動目標（一人一格，不用等後端 409）；SHALL NOT 提供換座（走近別的空位不顯示入座提示），
也 SHALL NOT 以「走離開」當離座 —— 後端沒有釋放座位的端點（`BE-G07` 未實作），前端造一個會與後端權威狀態不一致的離座／換座是錯的。
`closed` 的房間 SHALL NOT 有任何入座互動（後端結案後舊票仍能坐，`FE-O08` anomaly `close-keeps-token`，前端不給入口）。

既有的常駐「入座」按鈕 SHALL 移除 —— 那正是「看得到 3D 卻在操作網頁」的那種按鈕；世界的移動本來就要鍵盤，按 E 入座與此一致。

#### Scenario: [FE-J13-S02] 按「入座」送對 payload、送出中停用且只送一次、成功後那一格是我的且沒有「入座」了；closed 沒有「入座」

- **WHEN** 房間 `active`、`seat_count = 4`、座位空的，本地角色走到 1 號座位的站位、面對它
- **THEN** SHALL 顯示指名「入座」的互動提示；此時 SHALL NOT 有任何 `POST .../seats`（走近不送）
- **AND WHEN** 連按 E 兩次
- **THEN** SHALL 恰好送出一個 `POST /api/projects/{id}/seats`，body SHALL 是 `{"seat_index":1,"desk_template":0}`；回應回來之前 SHALL NOT 再送第二個
- **AND WHEN** 回 201 `{seat_index:1,user_id:me,…}`
- **THEN** SHALL 重取 `GET .../seats` 一次，錨點 1 的標籤 SHALL 是自己的；走到任何空位（0、2、3）SHALL NOT 再顯示入座提示（已有座位）
- **AND WHEN** 房間是 `closed`（座位回一筆別人的）
- **THEN** 有人的標籤照顯示名字，走到空位 SHALL NOT 顯示入座提示

### Requirement: 失敗回饋可恢復、兩種 409 分得開、不猜原因

`POST seats` 的失敗 SHALL 有一則可辨識的回饋（`role="status"` 或 `role="alert"`），而且之後仍能操作：
- 409 且 `detail` 是「這個座位已經有人了」→ SHALL 重取座位、那一格 SHALL 變成占用者、回饋 SHALL 說出「被搶」這件事；其餘空位 SHALL 仍可走近按 E 入座
- 409 且 `detail` 是「你已經在這個房間有座位了」→ SHALL 重取座位、標出自己的座位、所有空位 SHALL NOT 再是互動目標、回饋 SHALL 說出「你已經有座位」
- 403／401 → 回饋 SHALL 說要回大廳重新進房，SHALL NOT 說成密碼錯或座位問題；按 E 入座 SHALL 停止有效（票已失效，再按沒有意義）
- 400（超出座位數）、5xx、斷線 → 回饋用 `FE-X03` 的語彙，該空位 SHALL 仍可走近按 E 再試
兩種 409 以 `detail` 文字分（後端只給文字 —— 給後端的清單 1.4 要 `code`，來了就換判斷、可見行為不變）；後端的字 SHALL NOT 原樣當回饋（不回顯後端字串，`FE-N08` 同一條）。

#### Scenario: [FE-J13-S03] 被搶、已有座位、票失效、伺服器壞了：四種回饋各自對，而且都還能操作

- **WHEN** 走到 1 號空位、按 E 入座，回 409 `{"detail":"這個座位已經有人了"}`，重取回 `[{seat_index:1,user_id:乙}]`
- **THEN** 錨點 1 SHALL 顯示乙的名字、回饋 SHALL 可辨識為「被搶」、走到 0／2／3 號空位 SHALL 仍能按 E 入座
- **AND WHEN** 走到 2 號空位、按 E 入座，回 409 `{"detail":"你已經在這個房間有座位了"}`，重取回 `[{seat_index:1,user_id:乙},{seat_index:3,user_id:me}]`
- **THEN** 錨點 3 SHALL 是自己的、走到任何空位 SHALL NOT 再顯示入座提示、回饋 SHALL 可辨識為「你已經有座位」
- **AND WHEN** （另一次進房，座位空的）走到空位按 E，回 403 `{"detail":"尚未通過房間密碼驗證"}`
- **THEN** 回饋 SHALL 說要回大廳重新進房、SHALL NOT 含「密碼錯」、按 E 入座 SHALL 停止有效
- **AND WHEN** （另一次進房）走到空位按 E，回 500
- **THEN** 回饋 SHALL 是 `FE-X03` 的服務失敗語彙、該空位 SHALL 仍可按 E 再試；再按且回 201 SHALL 正常坐下

### Requirement: 真瀏覽器裡兩個人各自進房、坐位、看到彼此

這條的判準 SHALL 在真瀏覽器裡對本機自起的 `next start`＋`internal` 資料層跑（兩個 context 各一個身分；投影、hidden、指標事件、互動提示只有真瀏覽器算得出來）：
兩個人 SHALL 看到同一份座位、都以**走到座位旁按 E** 入座、其中一人的動作 SHALL 在另一人的畫面上經 409 重取或 30 秒輪詢反映出來。

#### Scenario: [FE-J13-S05] 真瀏覽器：兩人進房、B 先看到空位、A 坐 0 號、B 搶 0 號被拒、B 坐 1 號、A 30 秒內看到、A 重新整理仍在 0 號

- **GIVEN** 對本機自起的 `next start`＋`internal` 資料層：一個 `active` 的案子（密碼已知、`seat_count ≥ 2`），A、B 各一個 context、各自建身分、各自從門口輸入密碼進房
- **WHEN** 兩人都進了房、座位都空、各自走到 0 號座位的站位
- **THEN** 兩人的畫面 SHALL 都顯示 0 號的「入座」互動提示
- **AND WHEN** A 按 E
- **THEN** A 的 0 號 SHALL 變成 A 的名字並標成自己的、`POST .../seats` SHALL 是 201、A 走到任何空位 SHALL NOT 再有入座提示
- **AND WHEN** B（畫面還是舊的、沒等輪詢）也在 0 號站位按 E
- **THEN** B SHALL 看到「被搶」的回饋、0 號 SHALL 變成 A 的名字（不是「空位」、不是 id）、走到 1 號空位 SHALL 能按 E 入座
- **AND WHEN** B 走到 1 號站位按 E
- **THEN** 1 號 SHALL 變成 B 的名字；A 的畫面在 30 秒內 SHALL 看到 1 號是 B 的名字
- **AND WHEN** A 重新整理 `/world?room=<id>`
- **THEN** 0 號 SHALL 仍是 A 的、1 號 SHALL 是 B 的、走到任何空位 SHALL NOT 有入座提示（A 已有座位）
