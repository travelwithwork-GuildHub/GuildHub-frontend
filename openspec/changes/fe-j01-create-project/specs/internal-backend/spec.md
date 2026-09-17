## Applicability

權限：適用 —— 建案要登入；owner 是 session 指向的那張名片
併發：不適用
持久資料相容性：適用 —— 寫進可拋棄庫的 `projects`，欄位與預設值照 `db/schema/001_schema.sql`（複製自真後端）
失敗路徑：適用 —— 未登入、body 型別錯
測試連到什麼：契約套件對**本機自起**的 `internal` 與 `guildhub`（loopback、可拋棄庫）各跑一次，不連任何共用位址

## ADDED Requirements

### Requirement: 建案：形狀、預設值與到期日照真後端

`POST /api/projects` SHALL 經 `handle()`（`auth: 'required'`）以 `contract.ProjectCreate` 解析 body（`title`、`body` 必填字串；
`needed_skills` 預設 `[]`；`seat_count` 預設 4），插入 `projects`（`owner_id` = session 的名片、`status` 由資料庫預設 `recruiting`、
`room_template` NULL、`expires_at` 由資料庫預設 `now() + 7 days`），回 `201` 與 `ProjectOut`（不含 `password_hash`）。
跟真後端一樣 SHALL NOT 檢查長度與範圍（那些在前端的 `FORM_LIMITS`）；型別錯的 body → `422`（`FE-O03-S03` 的形狀）；未登入 → `401`（`FE-O03-S01`）。

#### Scenario: [FE-J01-S09] 建案回 201，欄位與預設值對，7 天後到期，列表第一筆是它

- **WHEN** 登入後 `POST /api/projects` 送 `{"title":"契約建案","body":"內容","needed_skills":["a"],"seat_count":2}`
- **THEN** SHALL 是 `201`，body 通過 `ProjectOut` 的 Zod 解析，`owner_id` SHALL 等於 `/api/me` 的 `id`，`status` SHALL 是 `recruiting`，
      `room_template` SHALL 是 `null`，`seat_count` 2、`needed_skills` `["a"]`，`expires_at` SHALL 在建立時刻 ＋7 天的 ±5 分鐘內，`updated_at` SHALL 是有效的 ISO 時間
- **AND WHEN** 只送 `{"title":"預設值","body":"內容"}`
- **THEN** SHALL 是 `201`，`needed_skills` SHALL 是 `[]`、`seat_count` SHALL 是 4
- **AND WHEN** 接著 `GET /api/projects?page=0`
- **THEN** 第一筆的 `id` SHALL 是剛建的那一筆

#### Scenario: [FE-J01-S10] 型別錯是 422、未登入是 401

- **WHEN** 登入後送 `{"title":1,"body":"x"}`、`{"title":"x","body":"y","seat_count":"four"}`、`{"body":"沒有標題"}`
- **THEN** 三個都 SHALL 是 `422`，`detail` 是陣列且每項通過 `ValidationError` 解析，`loc` 以 `"body"` 開頭
- **AND WHEN** 沒有 cookie 送合法的 body
- **THEN** SHALL 是 `401 {"detail":"未登入"}`，SHALL NOT 建立任何一筆

## MODIFIED Requirements

### Requirement: 每個 handler 走同一條管線，錯誤形狀複製真後端

所有**有實作的** `/api/*` method handler（每個 route 檔匯出的 `GET`／`POST`／`PATCH`）SHALL 經由同一個 `handle()` 包裝
（沒有匯出的 method 由 Next 回 405，那不經過 `handle()`，`S05`）：讀 session → 以 Zod 解析 body／query → 呼叫操作 → 對映回應。
錯誤對映 SHALL 是：
- 未登入 → `401`、`Content-Type: application/json`、body `{"detail":"未登入"}`（`POST /api/login` 除外）
- 資源不存在 → `404 {"detail":"<中文>"}`（名片：`名片不存在`；專案：`專案不存在`）
- Zod 解析失敗 → `422 {"detail":[{loc, msg, type, input?}, …]}`，每一項的 `loc` 以 `"body"` 或 `"query"` 開頭，形狀對得上 `src/api/contract/errors.ts` 的 `ValidationError`
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

- **WHEN** 登入後打替身宣稱沒做的端點（目前只剩 `GET /api/projects/{id}/seats`，清單在契約 harness 的 `contractUnimplemented`；真後端是空清單）
- **THEN** SHALL 是 Next 自己的 `405`（路由檔在、沒那個 method）或 `404`（沒有路由檔），不是 `{"detail":…}` 的 JSON、也不是 `501`
- **AND WHEN** 登入後打 `POST /api/projects`（`fe-j01-create-project` 起替身有它）
- **THEN** SHALL NOT 是 `404`／`405`／`501`
