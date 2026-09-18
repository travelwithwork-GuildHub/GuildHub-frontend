## Applicability

權限：適用 —— 兩個端點都要登入；只有 owner 能做（403）
併發：不適用
持久資料相容性：不適用 —— 可拋棄的資料庫
失敗路徑：適用 —— 未登入、非 owner、不存在、型別錯（`password` 不是字串 → 422，`FE-O03-S03` 的形狀）
測試連到什麼：契約判準對**本機自起**的 `internal`（Route Handler ＋ `INTERNAL_TEST_DATABASE_URL`）與 `guildhub`（`scripts/contract-guildhub.mjs` 起的 loopback 真後端）各跑一次；座位被清掉用 SQL 對同一個可拋棄庫驗。不連任何團隊共用的位址。

## ADDED Requirements

### Requirement: 成軍與結案：替身照真後端

`POST /api/projects/{id}/form-team` SHALL 經 `handle()`（`auth: 'required'`）以 `contract.FormTeamIn` 解析 body（`password: string`，不驗長度 —— 跟真後端一樣，上限由前端守）；
案子不存在 → `404 {"detail":"專案不存在"}`；不是 owner → `403 {"detail":"只有發起人可以做這件事"}`；成功 SHALL 把 `status` 設為 `active`、`room_template` 設為一個整數、
`password_hash` 設為密碼的雜湊（跟 `enter` 驗的是同一種格式），回 `200` 的 `ProjectOut`（十個鍵、沒有 `password_hash`）。
`active` 的案子再成軍 SHALL 換密碼與 `room_template`（舊密碼立即失效 —— 真後端亦然，這是 parity、要釘）。
`closed` 的案子再成軍：替身**目前不限制**（跟真後端一樣會變回 `active`），但這是 `FE-O08` 的 anomaly（`form-team-after-close`），由前端 UI 圍堵；**不寫成 SHALL、契約套件不釘它** —— 真後端修掉那天替身跟著改，不用改規格。
`POST /api/projects/{id}/close` SHALL 同樣的權限規則（401／404／403）；成功 SHALL 把 `status` 設為 `closed`、刪掉這個案子的全部座位、回 `200` 的 `ProjectOut`；重複 close SHALL 仍是 `200`（冪等）；
`password_hash` 與 `room_template` SHALL 留著（`closed` 但有密碼的 `enter` 仍 200，`FE-N08-S12` 既有 parity）。
成軍之後 `GET /api/rooms` SHALL 含這個案子；結案之後 SHALL NOT 含（既有的「只回 active」）。

#### Scenario: [FE-J04-S12] form-team：owner 200 變 active 且能 enter；再成軍換密碼；非 owner 403；未登入 401；不存在 404；型別錯 422

- **WHEN** owner 對自己 `recruiting` 的案子 `POST .../form-team` 送 `{"password":"guild1234"}`
- **THEN** SHALL 是 `200`，原始 JSON 的鍵集合 SHALL 恰好是 `ProjectOut` 的十個鍵（沒有 `password_hash`），`status` SHALL 是 `active`、`room_template` SHALL 是整數
- **AND** 接著 `GET /api/rooms` SHALL 含這個案子的 `project_id`；另一個人用 `guild1234` `POST .../enter` SHALL 是 `200`、用 `wrong` SHALL 是 `403`
- **AND WHEN** owner 對同一筆（已 `active`）再 `POST .../form-team` 送 `{"password":"second-pw"}`
- **THEN** SHALL 是 `200`、`status` `active`；另一個人用 `second-pw` enter SHALL 是 `200`、用 `guild1234` SHALL 是 `403`（舊密碼立即失效）
- **AND WHEN** owner 送 `{"password":123}`
- **THEN** SHALL 是 `422`，`detail` 是陣列且每項通過 `ValidationError` 解析（`FE-O03-S03` 的形狀）
- **AND WHEN** 另一個已登入的人對同一筆 `POST .../form-team`
- **THEN** SHALL 是 `403 {"detail":"只有發起人可以做這件事"}`，`status` SHALL 仍是 `active`
- **AND WHEN** 沒有 cookie 送；以及 owner 對一個不存在的 id 送
- **THEN** 分別 SHALL 是 `401 {"detail":"未登入"}` 與 `404 {"detail":"專案不存在"}`

#### Scenario: [FE-J04-S13] close：owner 200 變 closed、座位清掉、rooms 不含、重複 200；非 owner 403；未登入 401；不存在 404

- **WHEN** 一個 `active` 的案子有兩個座位（SQL 塞的），owner `POST .../close`
- **THEN** SHALL 是 `200`，`status` SHALL 是 `closed`，鍵集合 SHALL 是 `ProjectOut` 的十個鍵；`select count(*) from seats where project_id = <id>` SHALL 是 0；`GET /api/rooms` SHALL NOT 含它
- **AND WHEN** owner 再 `POST .../close` 一次
- **THEN** SHALL 仍是 `200`、`status` `closed`
- **AND WHEN** 另一個已登入的人對另一筆 `active` 的案子 `POST .../close`
- **THEN** SHALL 是 `403 {"detail":"只有發起人可以做這件事"}`，那筆 SHALL 仍是 `active`
- **AND WHEN** 沒有 cookie 送；以及 owner 對一個不存在的 id 送
- **THEN** 分別 SHALL 是 `401 {"detail":"未登入"}` 與 `404 {"detail":"專案不存在"}`
