## Applicability

權限：適用 —— 兩個端點都要登入（401）而且要這間房的票（`enter` 發的房間 cookie；沒有 → 403）
併發：適用 —— 兩個人同時坐同一格：靠資料庫的兩個約束擋（PK 與 unique），不先查再寫
持久資料相容性：不適用 —— 可拋棄的資料庫（`seats` 表已在 schema）
失敗路徑：適用 —— 未登入、沒票、專案不存在、一格兩人、一人兩格、超出座位數、型別錯（`seat_index` 不是整數 → 422，`FE-O03-S03` 的形狀）
測試連到什麼：契約判準對**本機自起**的 `internal`（Route Handler ＋ `INTERNAL_TEST_DATABASE_URL`）與 `guildhub`（`scripts/contract-guildhub.mjs` 起的 loopback 真後端）各跑一次。不連任何團隊共用的位址。

## ADDED Requirements

### Requirement: 座位：替身照真後端

`GET /api/projects/{id}/seats` 與 `POST /api/projects/{id}/seats` SHALL 經 `handle()`（`auth: 'required'`），並要求這個 session 持有這間房的票
（`enter` 成功時發的房間 cookie，`src/server/roomGrant.ts` —— 跟 `resources` 同一道門）：沒有 → `403 {"detail":"尚未通過房間密碼驗證"}`（不看 `status`：`closed` 但有票照放行，真後端亦然、`FE-O08` anomaly `close-keeps-token`，由前端不給入口圍堵，契約套件不釘它）。
`GET` SHALL 回這個案子的全部座位（`SeatOut`：`seat_index`、`user_id`、`desk_template`、`claimed_at`），依 `seat_index` 排序；沒有座位是 `[]`。
`POST` 的 body 照 `SeatClaim`（`seat_index: int`、`desk_template: int = 0`）：SHALL 以**單一句 `INSERT … SELECT … WHERE seat_index < seat_count`** 寫入（不先查再寫），
成功 `201` 回那一筆 `SeatOut`；一格已有人 → `409 {"detail":"這個座位已經有人了"}`；這個人已有座位 → `409 {"detail":"你已經在這個房間有座位了"}`（**文字跟真後端逐字相同** —— 前端只靠這兩句分）；
`seat_index` 超出 `[0, 8)` → `400 {"detail":"座位編號超出範圍"}`；在範圍內但 `≥ seat_count` → `400`、`detail` 含座位數；專案不存在 → `404 {"detail":"專案不存在"}`；`seat_index` 不是整數 → `422`。
`POST /api/projects/{id}/close` 清座位是既有規則（`FE-J04-S13`）。

#### Scenario: [FE-J13-S06] 座位契約：沒票 403、空 []、201、一格兩人 409、一人兩格 409、超出座位數 400、不存在 404、未登入 401、型別錯 422

- **WHEN** 一個 `seat_count = 2` 的 `active` 案子，甲登入但**還沒** `enter`，`GET .../seats`
- **THEN** SHALL 是 `403 {"detail":"尚未通過房間密碼驗證"}`
- **AND WHEN** 甲 `enter` 成功後 `GET .../seats`
- **THEN** SHALL 是 `200 []`
- **AND WHEN** 甲 `POST .../seats` 送 `{"seat_index":0}`
- **THEN** SHALL 是 `201`，回應通過 `SeatOut` 解析、`user_id` 是甲、`desk_template` 是 0；接著 `GET` SHALL 恰好一筆
- **AND WHEN** 乙 `enter` 後對 0 號 `POST`
- **THEN** SHALL 是 `409 {"detail":"這個座位已經有人了"}`
- **AND WHEN** 甲對 1 號 `POST`
- **THEN** SHALL 是 `409 {"detail":"你已經在這個房間有座位了"}`
- **AND WHEN** 乙對 2 號 `POST`（在 `[0,8)` 內、`≥ seat_count`）
- **THEN** SHALL 是 `400`，`detail` SHALL 含「2」；對 9 號 SHALL 是 `400`
- **AND WHEN** 乙送 `{"seat_index":"零"}`
- **THEN** SHALL 是 `422`，`detail` 是陣列且每項通過 `ValidationError` 解析
- **AND WHEN** 沒有 cookie `GET`；以及甲對不存在的 id（有票的 cookie 也對不上）`GET`
- **THEN** 分別 SHALL 是 `401 {"detail":"未登入"}` 與 `403`（沒有那間房的票）—— 真後端亦是先驗票再查案子
