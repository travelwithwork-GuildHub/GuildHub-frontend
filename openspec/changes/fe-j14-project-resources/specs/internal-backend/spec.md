## Applicability

權限：適用 —— 本地四個端點複製真後端的 owner／room token／狀態矩陣。
併發：適用 —— 兩個並行新增不得讓一個專案超過 50 筆。
持久資料相容性：適用 —— 讀寫 `disposable-db` 的 `project_resources`（後端 `sql/001_schema.sql` 的逐位元組複本）；不新增 `1xx` 表。
失敗路徑：適用 —— 401、403、404、409、422、500 text/plain、非法 UUID、壞 JSON。
測試連線：契約測試只打本機自己起的可拋棄後端（`local`：harness 起 `next start`＋`INTERNAL_TEST_DATABASE_URL`；`guildhub`：wrapper 自起真後端）；
單元測試不連任何服務。MUST NOT 連 Railway 或任何共用實例。

## MODIFIED Requirements

### Requirement: 每個 handler 走同一條管線，錯誤形狀複製真後端

所有**有實作的** `/api/*` method handler（每個 route 檔匯出的 `GET`／`POST`／`PATCH`／`DELETE`）SHALL 經由同一個 `handle()` 包裝
（沒有匯出的 method 由 Next 回 405，那不經過 `handle()`，`S05`）：讀 session → 以 Zod 解析 body／query／path → 呼叫操作 → 對映回應。
成功回應 SHALL 照真後端的碼：`200`／`201` 帶 JSON body；`204` SHALL 沒有 body。
錯誤對映 SHALL 是：
- 未登入 → `401`、`Content-Type: application/json`、body `{"detail":"未登入"}`（`POST /api/login` 除外）
- 資源不存在 → `404 {"detail":"<中文>"}`（名片：`名片不存在`；專案：`專案不存在`；專案資源：與真後端逐字相同的那一句，由契約測試比對）
- 權限不足、狀態衝突 → `403`／`409 {"detail":"<中文>"}`，`detail` 與真後端逐字相同（契約測試比對）
- Zod 解析失敗 → `422 {"detail":[{loc, msg, type, input?}, …]}`，每一項的 `loc` 以 `"body"`、`"query"` 或 `"path"` 開頭，形狀對得上 `src/api/contract/errors.ts` 的 `ValidationError`
- 資料庫 check／唯一鍵違反 → `500`、`Content-Type: text/plain; charset=utf-8`、body 正好是 `Internal Server Error`
- 其他未預期的例外 → 同上的 500

handler SHALL NOT 自行檢查長度上限 —— 那是資料庫的事，跟真後端一樣。

#### Scenario: [FE-O03-S01] 未登入打任何一個需要登入的端點

- **WHEN** 沒有 cookie 打 `GET /api/me`、`GET /api/profiles`、`GET /api/projects`、`GET /api/rooms`、`PATCH /api/profiles/me` 各一次
- **THEN** 每一次 SHALL 是 `401`、JSON、`{"detail":"未登入"}`，且沒有其他鍵

#### Scenario: [FE-O03-S02] 超長欄位：500 text/plain，不是 422

- **WHEN** 登入後 `PATCH /api/profiles/me` 送 `bio` 為 301 個 code point
- **THEN** SHALL 是 `500`、`text/plain`、body `Internal Server Error`
- **AND** 之後 `GET /api/me` 的 `bio` SHALL 是改之前的值（拒絕後沒有部分寫入）

#### Scenario: [FE-O03-S03] 驗證失敗的形狀

- **WHEN** `POST /api/login` 送 `{}`（三種模式一種都沒給）
- **THEN** SHALL 是 `422`，`detail` SHALL 是陣列，每一項 SHALL 通過 `ValidationError` 的 Zod 解析

#### Scenario: [FE-O03-S04] 不存在的資源

- **WHEN** 登入後打 `GET /api/profiles/00000000-0000-4000-8000-000000000000` 與 `GET /api/projects/00000000-0000-4000-8000-000000000000`
- **THEN** 分別 SHALL 是 `404 {"detail":"名片不存在"}`、`404 {"detail":"專案不存在"}`

#### Scenario: [FE-O03-S05] W2 沒做的端點不假裝存在

- **WHEN** 登入後打 `POST /api/projects`（路由檔存在但沒有 `POST`）、`GET /api/messages`（沒有路由檔）
- **THEN** 分別 SHALL 是 Next 自己的 `405` 與 `404`（不是 `{"detail":…}` 的 JSON，也不是 `501`）—— 之後那些能力來的時候自己加

#### Scenario: [FE-J14-S28] DELETE 走同一條管線；204 沒有 body

- **WHEN** 沒有 cookie 打 `DELETE /api/projects/<seed active 專案>/resources/<uuid>`
- **THEN** SHALL 是 `401`、JSON、`{"detail":"未登入"}`
- **AND WHEN** owner 刪除自己 active 專案的一筆資源
- **THEN** SHALL 是 `204`，body SHALL 是空的（長度 0）
- **AND WHEN** owner 打 `DELETE …/resources/not-a-uuid`
- **THEN** SHALL 是 `422`、`detail` 是陣列、`detail[0].loc[0]` 是 `path`
  （證明 DELETE 真的走同一條管線，而不是另外寫了一份剛好同形的 handler）
- → 驗於：契約測試（兩個目標）

## ADDED Requirements

### Requirement: 本地專案資源四端點：權限、狀態、上限、驗證與真後端相同

`local` 目標 SHALL 提供：
`GET /api/projects/{project_id}/resources`、`POST /api/projects/{project_id}/resources`、
`PATCH /api/projects/{project_id}/resources/{resource_id}`、`DELETE /api/projects/{project_id}/resources/{resource_id}`，
輸入輸出形狀取自 `src/api/contract/`。

回應 SHALL 依下表（「持票」＝這個 session 對該專案有效的 room token，本地的記法由 `room-entry-gate` 規定）：

| 情況 | GET | POST／PATCH／DELETE |
|---|---|---|
| 未登入 | 401 | 401 |
| 專案不存在 | 404 | 404 |
| active，owner | 200 | 201／200／204 |
| active，非 owner，持票 | 200 | 403 |
| active，非 owner，沒有票 | 403 | 403 |
| closed，owner | 200 | 409 |
| closed，非 owner（有沒有票都一樣） | 403 | 403 |
| recruiting，owner | 200 `[]` | 409 |
| recruiting，非 owner | 403 | 403 |
| 已有 50 筆時 POST | —— | 409 |
| `resource_id` 不存在或不屬於 path 的專案 | —— | 404 |
| path 的 `project_id`／`resource_id` 不是 UUID | 422 | 422 |
| 缺必填欄位、型別錯、非法 `type`、明確 `null`、body 不是 JSON | —— | 422 |
| `label`／`url` 長度違反、`url` 不符資料庫的格式 check、`label` 只含空白 | —— | 500 text/plain（資料庫 check） |
| 未知欄位（含 `id`、`project_id`、`created_at`） | —— | 靜默忽略 |
| PATCH `{}` | —— | 200，原樣回傳 |

⚠️ 資料庫的網址格式 check 是 **`url ~* '^https?://[^[:space:]]+$'`**：`~*` 在 PostgreSQL 是**不分大小寫**的比對，
所以 `HTTPS://EXAMPLE.COM/x` 是合法的、存得進去。本地複本 MUST NOT 把它實作成區分大小寫。

GET SHALL 回該專案**全部**資源，`created_at ASC, id ASC`，不分頁。
POST 成功 SHALL 回 201 與新建的那一筆。PATCH SHALL 只改有給的欄位，SHALL NOT 改 `created_at`，順序因此不變。
同一專案 SHALL 允許重複的 `url`。handler SHALL NOT trim `label` 或正規化 `url`。
同時違反多項時（例如非 owner 送缺欄的 body），回應碼的先後 SHALL 與真後端相同 —— 由契約測試對兩個目標跑同一組組合決定，本規格不另寫死；
401 SHALL 永遠最先。

寫入 SHALL 在同一個交易裡先鎖住那個專案列、再計數與寫入（跟真後端同一個形狀，design D3）：兩個並行的新增 MUST NOT 讓總數超過 50。

每一個情況 SHALL 由契約測試對 `local` 與 `guildhub` 兩個目標跑**同一組**（`contract-tests`）；
`closed`、`recruiting` 狀態與「別人的專案」由 harness 以可拋棄資料庫的 seed 或直接寫入準備，測試檔不分目標。

#### Scenario: [FE-J14-S29] 權限 × 狀態矩陣

- **WHEN** 對兩個目標依序打上表「未登入」到「recruiting，非 owner」每一列（讀一次、寫三種各一次）
- **THEN** 每一列的回應碼 SHALL 與表相同；403／404／409 的 body SHALL 是 JSON `{"detail":<字串>}`，兩個目標的 `detail` 逐字相同
- **AND** closed 專案非 owner 那一列 SHALL 在「已經對它 `enter` 成功過」的 session 上驗（closed 仍拿得到票 —— `FE-N08-S12`），仍是 403
- → 驗於：契約測試（兩個目標）

#### Scenario: [FE-J14-S30] 驗證：422、500 text/plain、靜默忽略、PATCH `{}`、非法 path

- **WHEN** owner 對 active 專案 POST：少 `url`、`type` 為 `other`、`label` 為 `null`、`label` 為 `123`、body 為文字 `not json`
- **THEN** 每一次 SHALL 是 `422`，`detail` 陣列的每一項通過 `ValidationError`
- **AND WHEN** POST `label` 為 `"   "`、`url` 為 `ftp://example.com`、`url` 為含一個空白的 `https://example.com/a b`
- **THEN** 每一次 SHALL 是 `500`、`text/plain`、`Internal Server Error`，且之後 GET 的筆數 SHALL 不變
- **AND WHEN** POST `url` 為 `HTTPS://EXAMPLE.COM/x`（大寫 scheme 與 host）
- **THEN** SHALL 是 `201`，回傳的 `url` SHALL 逐字是送出的那一串（不分大小寫的 check、不正規化）
- **AND WHEN** POST 合法三欄外加 `"id":"<另一個 uuid>"`、`"project_id":"<別的專案>"`、`"created_at":"2000-01-01T00:00:00Z"`
- **THEN** SHALL 是 `201`，回應的 `id` SHALL NOT 等於送出的、`project_id` SHALL 是 path 的專案、`created_at` SHALL NOT 是 2000 年
- **AND WHEN** 對那一筆 PATCH `{}`、PATCH `{"label":null}`、PATCH `{"label":"新名字","id":"<另一個 uuid>","created_at":"2000-01-01T00:00:00Z"}`
- **THEN** 第一次 SHALL 是 `200` 且與 PATCH 之前 GET 到的那一筆逐欄相同；第二次 SHALL 是 `422`；
  第三次 SHALL 是 `200`，`label` 是新名字、`id` 與 `created_at` 不變
- **AND WHEN** 把非法 UUID 放進**每一個** path 參數，四個端點都試：`GET`／`POST /api/projects/not-a-uuid/resources`、
  `PATCH`／`DELETE /api/projects/not-a-uuid/resources/<合法 uuid>`、`PATCH`／`DELETE /api/projects/<合法 uuid>/resources/not-a-uuid`
- **THEN** 六次 SHALL 都是 `422`，`detail[0].loc[0]` 是 `path`（這一組同時釘住四個端點都走同一條管線；
  非法 path 與權限／body 錯誤同時存在時的先後，依上面「先後與真後端相同」那一句由契約測試決定，本規格不寫死）
- → 驗於：契約測試（兩個目標）

#### Scenario: [FE-J14-S31] 部分更新、順序、重複網址、刪除

- **GIVEN** owner 依序 POST 三筆 A、B、C（B 與 C 的 `url` 相同，兩次都 201）
- **WHEN** PATCH B 只給 `label`
- **THEN** 回應的 `label` SHALL 是新給的值，`type`、`url`、`created_at` SHALL 與原本相同；
  GET SHALL 仍是 A、B、C 的順序，且 B 的 `label` SHALL 是新值
- **AND WHEN** DELETE B
- **THEN** SHALL 是 `204`；GET SHALL 是 A、C；再 DELETE B SHALL 是 `404`
- **AND WHEN** 以專案 P 的 path 去 PATCH／DELETE 屬於另一個專案 Q 的資源（Q 也是同一個 owner）
- **THEN** SHALL 是 `404`，Q 的資源 SHALL 不變
- → 驗於：契約測試（兩個目標）

#### Scenario: [FE-J14-S32] 50 筆上限：第 51 筆 409；兩個並行新增不超過 50

- **GIVEN** owner 的 active 專案已有 50 筆
- **WHEN** 再 POST 一筆合法的
- **THEN** SHALL 是 `409`，GET SHALL 仍是 50 筆
- **AND GIVEN** 另一個 active 專案已有 49 筆
- **WHEN** 同一個 owner 以兩條連線**同時** POST 各一筆合法的（重複 10 輪，每輪重建到 49 筆）
- **THEN** 每一輪 SHALL 恰好一個 `201`、一個 `409`，GET SHALL 是 50 筆
- → 驗於：契約測試（兩個目標）
