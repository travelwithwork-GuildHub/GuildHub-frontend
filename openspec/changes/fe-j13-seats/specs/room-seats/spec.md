## Purpose

進了房間的人看得到誰坐哪、哪裡是空位，按一下就坐下；被搶、已經有座位、票失效各自有分得開的回饋，而且都能繼續操作。
後端只有「一格一人、一人一格」兩個約束、兩種 409 只靠文字分、沒有釋放座位、沒有即時事件，所以前端以重取為準（自己動作後、
409 後、每 30 秒），標籤跟著 `FE-W16` 的投影錨點走，不進 3D、不鎖世界。

## Applicability

權限：適用 —— 座位端點要票（`enter` 發的）：403／401 是失敗路徑；訪客進不了房間所以沒有這個畫面
併發：適用 —— 兩個人同時坐同一格（後端以約束擋、前端拿 409 重取）；送出中連按只送一次；離開房間後晚到的回應作廢
持久資料相容性：不適用 —— 不讀寫任何本機儲存
失敗路徑：適用 —— 409 兩種、400（超出座位數）、403／401（票失效／未登入）、500／斷線、名字查不到、`closed` 的房間
測試連到什麼：單元判準只連**本機自起**的 `contract-server` 替身；真瀏覽器判準連**本機自起**的 `next start`＋`internal` 資料層（真的 Route Handler、真的 Postgres），WS 用 `routeWebSocket` 偽造。不連任何團隊共用的位址。

## ADDED Requirements

### Requirement: 房間裡每個座位有一個標籤，說出誰坐這裡或這裡是空位

場景是 `room` 時，前端 SHALL 請求 `GET /api/projects/{id}/seats` 與 `GET /api/projects/{id}`（要 `seat_count` 與 `status`），
並為 `seat_index` 在 `[0, seat_count)` 的每個工位掛一個座位標籤（`data-seat-index` 同錨點）；`seat_count` 以外的工位 SHALL NOT 有標籤。
有人的座位 SHALL 顯示占用者的名字（`GET /api/profiles/{user_id}`，每個占用者在這一次進房期間查一次；查不到 SHALL 顯示可辨識的「有人」而不是空白或 id）；
自己的座位 SHALL 可辨識為自己的；沒人的座位 SHALL 顯示「空位」。標籤 SHALL 掛在 `FE-W16` 的投影錨點上（跟著錨點移動、錨點 hidden 時一起 hidden），
SHALL 是 DOM（在 `<Canvas>` 外面）、SHALL NOT 持世界命令鎖、SHALL NOT 進互動系統（桌子仍不是互動物件）。
座位還沒載到之前 SHALL 沒有標籤（不畫「空位」——那會是謊言）；載入失敗 SHALL 有一則可辨識的回饋與重試。場景回到 `hall` SHALL 一個標籤都沒有。

#### Scenario: [FE-J13-S01] 四個座位、兩個有人：兩個名字、兩個空位、四個以外沒有標籤；大廳沒有

- **WHEN** 場景是 `room`（`seat_count = 4`），座位回 `[{seat_index:0,user_id:甲},{seat_index:2,user_id:me}]`，`GET /api/profiles/甲` 回「阿甲」
- **THEN** 錨點 0 的標籤 SHALL 顯示「阿甲」、錨點 2 的標籤 SHALL 顯示自己的名字且標成自己的、錨點 1 與 3 SHALL 顯示「空位」、錨點 4～7 SHALL NOT 有標籤
- **AND** 座位回來之前 SHALL 沒有任何標籤；`GET /api/profiles/甲` 回 404 時錨點 0 SHALL 顯示「有人」（不是空白、不是 id）
- **AND WHEN** 場景變成 `hall`
- **THEN** SHALL 一個標籤都沒有，房間期間在飛的請求 SHALL 被中止

### Requirement: 一鍵入座：空位有「入座」，按下去就是 `POST seats`；一人一格

有人登入、房間是 `active`、自己還沒有座位時，每個空位 SHALL 有「入座」；按下 SHALL 送 `POST /api/projects/{id}/seats` 帶 `{ seat_index, desk_template: 0 }`；
送出中 SHALL 全部「入座」停用、連按只送一次；201 之後 SHALL 重取座位並把那一格畫成自己的。自己已經有座位時 SHALL NOT 有任何「入座」（一人一格，不用等後端 409）。
`closed` 的房間 SHALL NOT 有任何「入座」（後端結案後舊票仍能坐，`FE-O08` anomaly `close-keeps-token`，前端不給入口）。

#### Scenario: [FE-J13-S02] 按「入座」送對 payload、送出中停用且只送一次、成功後那一格是我的且沒有「入座」了；closed 沒有「入座」

- **WHEN** 房間 `active`、`seat_count = 4`、座位空的，按錨點 1 的「入座」兩次
- **THEN** SHALL 恰好送出一個 `POST /api/projects/{id}/seats`，body SHALL 是 `{"seat_index":1,"desk_template":0}`；回應回來之前四個「入座」SHALL 都停用
- **AND WHEN** 回 201 `{seat_index:1,user_id:me,…}`
- **THEN** SHALL 重取 `GET .../seats` 一次，錨點 1 SHALL 是自己的，錨點 0、2、3 SHALL 是「空位」但 SHALL NOT 有「入座」
- **AND WHEN** 房間是 `closed`（座位回一筆別人的）
- **THEN** 有人的標籤照顯示名字，空位 SHALL NOT 有「入座」

### Requirement: 失敗回饋可恢復、兩種 409 分得開、不猜原因

`POST seats` 的失敗 SHALL 有一則可辨識的回饋（`role="status"` 或 `role="alert"`），而且之後仍能操作：
- 409 且 `detail` 是「這個座位已經有人了」→ SHALL 重取座位、那一格 SHALL 變成占用者、回饋 SHALL 說出「被搶」這件事；其餘空位的「入座」SHALL 回來
- 409 且 `detail` 是「你已經在這個房間有座位了」→ SHALL 重取座位、標出自己的座位、所有「入座」SHALL 消失、回饋 SHALL 說出「你已經有座位」
- 403／401 → 回饋 SHALL 說要回大廳重新進房，SHALL NOT 說成密碼錯或座位問題；「入座」SHALL 停用（票已失效，再按沒有意義）
- 400（超出座位數）、5xx、斷線 → 回饋用 `FE-X03` 的語彙，「入座」SHALL 回來可再按
兩種 409 以 `detail` 文字分（後端只給文字 —— 給後端的清單 1.4 要 `code`，來了就換判斷、可見行為不變）；後端的字 SHALL NOT 原樣當回饋（不回顯後端字串，`FE-N08` 同一條）。

#### Scenario: [FE-J13-S03] 被搶、已有座位、票失效、伺服器壞了：四種回饋各自對，而且都還能操作

- **WHEN** 按錨點 1 的「入座」，回 409 `{"detail":"這個座位已經有人了"}`，重取回 `[{seat_index:1,user_id:乙}]`
- **THEN** 錨點 1 SHALL 顯示乙的名字、回饋 SHALL 可辨識為「被搶」、錨點 0／2／3 的「入座」SHALL 可按
- **AND WHEN** 按錨點 2 的「入座」，回 409 `{"detail":"你已經在這個房間有座位了"}`，重取回 `[{seat_index:1,user_id:乙},{seat_index:3,user_id:me}]`
- **THEN** 錨點 3 SHALL 是自己的、SHALL NOT 有任何「入座」、回饋 SHALL 可辨識為「你已經有座位」
- **AND WHEN** （另一次進房，座位空的）按「入座」回 403 `{"detail":"尚未通過房間密碼驗證"}`
- **THEN** 回饋 SHALL 說要回大廳重新進房、SHALL NOT 含「密碼錯」、全部「入座」SHALL 停用
- **AND WHEN** （另一次進房）按「入座」回 500
- **THEN** 回饋 SHALL 是 `FE-X03` 的服務失敗語彙、那一格的「入座」SHALL 可再按；再按且回 201 SHALL 正常坐下

### Requirement: 座位以重取為準：進房、坐下後、409 後各一次，每 30 秒一次；不可見時停；晚到作廢

座位 SHALL 在進房時取一次、自己 201 之後與 409 之後各重取一次、房間裡每 30 秒輪詢一次（頁籤不可見時 SHALL 停、可見時恢復 —— `world-interactive-objects`〈輪詢在頁籤不可見時停止〉同一條規則）；
離開房間 SHALL 停止輪詢並中止在飛的請求；換了房間或身分，前一間的回應 SHALL NOT 套進來。輪詢失敗 SHALL 保留上一次的座位（stale），SHALL NOT 把標籤清空。

#### Scenario: [FE-J13-S04] 30 秒一次；不可見停、可見恢復；離開房間停；輪詢失敗留舊的；換房間的晚到不混

- **WHEN** 在房間裡，假時鐘前進 30 秒
- **THEN** SHALL 多送一個 `GET .../seats`；再前進 30 秒 SHALL 再多一個
- **AND WHEN** 頁籤變成不可見、前進 60 秒
- **THEN** SHALL NOT 多送；變回可見 SHALL 立即重取一次
- **AND WHEN** 一次輪詢回 500
- **THEN** 標籤 SHALL 仍是上一次的內容（沒有清空、沒有「空位」冒出來）
- **AND WHEN** 換到另一間房、前一間壓住的回應此時才回
- **THEN** 新房間的標籤 SHALL NOT 出現前一間的座位；回到 `hall` 後前進 60 秒 SHALL NOT 再送任何 `GET .../seats`

### Requirement: 真瀏覽器裡兩個人各自進房、坐位、看到彼此

這條的判準 SHALL 在真瀏覽器裡對本機自起的 `next start`＋`internal` 資料層跑（兩個 context 各一個身分；投影、hidden、指標事件只有真瀏覽器算得出來）：
兩個人 SHALL 看到同一份座位、其中一人的動作 SHALL 在另一人的畫面上經 409 重取或 30 秒輪詢反映出來。

#### Scenario: [FE-J13-S05] 真瀏覽器：兩人進房、B 先看到空位、A 坐 0 號、B 搶 0 號被拒、B 坐 1 號、A 30 秒內看到、A 重新整理仍在 0 號

- **GIVEN** 對本機自起的 `next start`＋`internal` 資料層：一個 `active` 的案子（密碼已知、`seat_count ≥ 2`），A、B 各一個 context、各自建身分、各自從門口輸入密碼進房
- **WHEN** 兩人都進了房、座位都空
- **THEN** 兩人的畫面 0 號與 1 號 SHALL 都是「空位」有「入座」
- **AND WHEN** A 按 0 號的「入座」
- **THEN** A 的 0 號 SHALL 變成 A 的名字並標成自己的、`POST .../seats` SHALL 是 201、A 的畫面 SHALL NOT 再有任何「入座」
- **AND WHEN** B（畫面還是舊的、沒等輪詢）立刻按 0 號的「入座」
- **THEN** B SHALL 看到「被搶」的回饋、0 號 SHALL 變成 A 的名字（不是「空位」、不是 id）、1 號的「入座」SHALL 可按
- **AND WHEN** B 按 1 號的「入座」
- **THEN** 1 號 SHALL 變成 B 的名字；A 的畫面在 30 秒內 SHALL 看到 1 號是 B 的名字
- **AND WHEN** A 重新整理 `/world?room=<id>`
- **THEN** 0 號 SHALL 仍是 A 的、1 號 SHALL 是 B 的、沒有任何「入座」（A 已有座位）
