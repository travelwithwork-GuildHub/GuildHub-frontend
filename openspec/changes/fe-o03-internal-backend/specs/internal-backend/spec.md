## Applicability

權限：**適用** —— 未登入一律 401；`PATCH /api/profiles/me` 只改自己的名片
併發：**不適用** —— W2 的操作都是單筆讀寫；座位認領（真後端靠唯一鍵衝突回 409）不在這一列
持久資料相容性：**適用** —— 讀寫的是 `FE-O04` 那個 schema 複本；回應形狀要跟真後端一字不差（`FE-O05` 盯）
失敗路徑：**適用** —— 未登入、名片／專案不存在、驗證失敗、資料庫 check 違反、cookie 被篡改、不合協定的 WS 訊息

測試連到什麼：REST 判準打**本機自己起的** Next（`next start` 在一個隨機 port）＋ `INTERNAL_TEST_DATABASE_URL` 的可拋棄 Postgres；
WS 判準打**本機自己起的** `realtime-stub`。**不連任何團隊共用的位址。**

## ADDED Requirements

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

- **WHEN** 登入後打 `POST /api/projects`（路由檔存在但沒有 `POST`）、`GET /api/messages`（沒有路由檔）
- **THEN** 分別 SHALL 是 Next 自己的 `405` 與 `404`（不是 `{"detail":…}` 的 JSON，也不是 `501`）—— 之後那些能力來的時候自己加

### Requirement: session 是簽章的 HttpOnly cookie

登入成功 SHALL `Set-Cookie: session=<id>.<hmac>; HttpOnly; Path=/; SameSite=Lax`（名稱跟真後端 Starlette 的預設一樣），
`<hmac>` 是以 `INTERNAL_SESSION_SECRET` 對 `<id>` 做 HMAC-SHA256 的 base64url。
以下 SHALL 一律視為未登入（401）：沒有 cookie、簽章對不上、`<id>` 不是 uuid、`<id>` 指向不存在的名片（資料庫重建過）。
`INTERNAL_SESSION_SECRET` 缺席時，`next dev` SHALL 用一個固定的開發用值；`next build` SHALL 失敗（`FE-O14` 的閘門形狀）。

#### Scenario: [FE-O03-S06] 登入之後帶 cookie 就是那個人

- **WHEN** `POST /api/login {"nickname":"契約測試員"}` 回 200 與 `Set-Cookie`；帶著那個 cookie 打 `GET /api/me`
- **THEN** SHALL 是 `200`，`id` 與 `display_name` 跟 login 回的那一筆相同

#### Scenario: [FE-O03-S07] 篡改的 cookie 是未登入

- **WHEN** 把 cookie 的 `<id>` 換成 seed 裡另一張名片的 id、簽章不動，打 `GET /api/me`
- **THEN** SHALL 是 `401 {"detail":"未登入"}`，不是另一個人的名片

#### Scenario: [FE-O03-S08] session 指向已不存在的名片

- **WHEN** 登入後 `db:reset`（名片沒了），帶原 cookie 打 `GET /api/me`
- **THEN** SHALL 是 `401 {"detail":"未登入"}`

### Requirement: 登入有三種模式，剛好給一組

`POST /api/login` 的 body SHALL 剛好是下列一組，多給或少給 → `422`（`detail` 陣列）：
- `{"nickname": string}` → 建一張新名片（`display_name = nickname`，`avatar_id = 0`），回 `200 ProfileOut`
- `{"resume_token": uuid}` → 拿回那張名片；不存在 → `404 {"detail":"名片不存在"}`
- `{"login_id": string, "password": string}` → 帳號密碼；帳號不存在或密碼錯 → **同一句** `403 {"detail":"帳號或密碼錯誤"}`；只給其中一個 → `422`

`nickname` 的長度 SHALL NOT 在 handler 檢查：空字串或 21 字由資料庫 check 擋 → `500`（真後端亦然）。
密碼比對 SHALL 用與真後端相同的 scrypt 格式（`scrypt$<salt>$<hash>`），使 seed／`1xx` 裡的帳號兩邊都登得進。

#### Scenario: [FE-O03-S09] 三種模式各一次

- **WHEN** 依序：`{"nickname":"新來的"}`；用它回的 `id` 當 `resume_token` 再登入一次；用 `1xx` seed 的測試帳號 `login_id`＋密碼登入
- **THEN** 三次 SHALL 都是 `200 ProfileOut`；第二次的 `id` SHALL 等於第一次的；第三次的 `display_name` SHALL 是那個帳號的

#### Scenario: [FE-O03-S10] 給兩組是 422，給半組也是 422

- **WHEN** 送 `{"nickname":"甲","resume_token":"<uuid>"}`，與 `{"login_id":"x"}`（沒有 password）
- **THEN** 兩次 SHALL 都是 `422`，`detail` 陣列

#### Scenario: [FE-O03-S11] 帳號不存在與密碼錯誤是同一句話

- **WHEN** `{"login_id":"nobody","password":"whatever1"}` 與 `{"login_id":"<存在的>","password":"wrong123"}`
- **THEN** 兩次 SHALL 都是 `403 {"detail":"帳號或密碼錯誤"}`，回應 body 逐位元組相同

#### Scenario: [FE-O03-S12] resume 一張已刪除的名片

- **WHEN** `{"resume_token":"00000000-0000-4000-8000-000000000000"}`
- **THEN** SHALL 是 `404 {"detail":"名片不存在"}`，且**沒有**建立新名片（`profiles` 筆數不變）

### Requirement: 我的名片：讀與部分更新

`GET /api/me` SHALL 回 session 那張名片的 `ProfileOut`。
`PATCH /api/profiles/me` 的 body SHALL 是 `ProfileUpdate`（`display_name`、`avatar_id`、`skills`、`hours_per_week`、`bio` 皆選填）；
**只更新有給的欄位**；**未知欄位 SHALL 被靜默忽略**（真後端 `profiles.py` 有一條「未知欄位 → 422」的分支，但 Pydantic 預設
`extra='ignore'`，`model_dump(exclude_unset=True)` 永遠不含未知欄位 —— 那條分支到不了；本地版複製**可觀察的行為**，不複製死碼）；
body 是 `{}` → 不更新、回目前的名片；成功 SHALL 更新 `updated_at` 並回更新後的 `ProfileOut`。

#### Scenario: [FE-O03-S13] 只改給的欄位

- **WHEN** 登入後 `PATCH {"bio":"新自介"}`
- **THEN** 回應的 `bio` SHALL 是 `新自介`，`display_name`、`skills`、`hours_per_week` SHALL 不變，`updated_at` SHALL 比之前新

#### Scenario: [FE-O03-S14] 未知欄位靜默忽略；空 body 不更新

- **WHEN** `PATCH {"bio":"x","nickname":"y"}`，再 `PATCH {}`
- **THEN** 第一次 SHALL 是 `200`，`bio` 是 `x`，回應裡 SHALL 沒有 `nickname` 鍵；第二次 SHALL 是 `200` 且 `updated_at` 與第一次相同

### Requirement: 人才與案件清單：分頁形狀複製真後端

`GET /api/profiles?page=N` SHALL 回 `ProfileOut[]`，`order by updated_at desc`，每頁 20 筆，`page` 0-based，負數視為 0，
翻過尾頁回 `[]`（不是 404）；回應 SHALL NOT 含 total、has_more 或任何 header 形式的總數。
`GET /api/projects?status=recruiting&page=N` 同形；`status` 預設 `recruiting`，不是三個值之一 → `422`；**過期的（`expires_at <= now()`）不出現**。
`GET /api/rooms` SHALL 回 `status = 'active'` 的專案（`order by updated_at desc`，最多 12 筆）的 `{project_id, title, online_count}`；
`online_count` SHALL 是向替身的 `GET /online?scene=room:<id>` 查到的整數（loopback、100 ms timeout）；替身連不上或逾時 → 0，回應仍是 200。

#### Scenario: [FE-O03-S15] 分頁：20 筆、0-based、尾頁後是空陣列

- **WHEN** seed 之後（32 張名片）依序 `GET /api/profiles?page=0`、`page=1`、`page=2`、`page=-1`
- **THEN** SHALL 分別是 20 筆、12 筆、`[]`、與 `page=0` 相同的 20 筆；每一筆 SHALL 通過 `ProfileOut` 解析；回應 SHALL 沒有 `total`

#### Scenario: [FE-O03-S16] 案件清單：預設 recruiting、過期不出現、status 不合法是 422

- **WHEN** 有一筆 `expires_at` 在過去的 recruiting 專案；打 `GET /api/projects`、`?status=active`、`?status=bogus`
- **THEN** 第一次 SHALL 只有未過期的 recruiting；第二次 SHALL 是 active 的；第三次 SHALL 是 `422`

#### Scenario: [FE-O03-S17] 走廊的門：替身不在也開得出來

- **WHEN** 替身**沒在跑**，seed 之後 `GET /api/rooms`
- **THEN** SHALL 是 `200`、seed 裡兩間 active 專案的 `{project_id, title, online_count}`，`online_count` 都是 0，回應時間 SHALL 少於 1 秒（不是等到 timeout 才放棄）

#### Scenario: [FE-O03-S22] 走廊的門：人數來自替身

- **WHEN** 替身在跑；兩條連線進 `room:<seed 第一間 active 專案的 id>`（用替身的測試 token，見替身那條 Requirement），`GET /api/rooms`；一條斷線後再 `GET`
- **THEN** 第一次那間的 `online_count` SHALL 是 2、另一間 0；第二次 SHALL 是 1

### Requirement: 即時層替身照 `protocol.py`，怪癖一併複製

`scripts/realtime-stub.ts`（以 `tsx` 執行 —— Node 原生的 type stripping 要求相對 import 帶副檔名，而 `ws.ts` 的 `./limits` 沒有；重用 `src/api/contract/ws.ts`）SHALL 在 `INTERNAL_REALTIME_PORT`（預設 3102）只綁 loopback，
路徑 `/ws?scene=<scene>`，另有 `GET /online?scene=<scene>` 回 `{"count": <整數>}`（給 `GET /api/rooms` 用）。
握手時 SHALL 讀同一個簽章 cookie 決定 `name`／`av`（沒有或無效 → `訪客`／`0`，**不拒絕**，跟真後端一樣）；
`scene` 是 `lobby` → 接受；`scene` 是 `room:<uuid>` → 要 `token` 查詢參數等於 `HMAC(INTERNAL_SESSION_SECRET, "room:<uuid>")` 才接受
（真後端的 room token 由 `enter` 端點簽發，`FE-W16`（W4）接上；今天只有測試會算這個 token）；其他 → close `1008`，**不送 `err`**。
連上後 SHALL 依序送 `hello`（`hz: 10`）與 `snapshot`；別人進出送 `presence`；
`move` SHALL 以 10 Hz 合併成 `pos` 廣播給**所有人（含自己）**；`status` SHALL 廣播 `{t:"status", id, text}`；`chat` SHALL 廣播 `{t:"chat", id, name, body}`。
以下 SHALL **靜默丟棄**（不回 `err`、不斷線）：`t` 未知、`move` 的 `x`／`y` 不是整數、`status` 的 `text` 超過 12 個 code point、非 JSON。
**沒有人移動時 SHALL NOT 送 `pos`**（不是送空陣列）。
訊息形狀 SHALL 以 `src/api/contract/ws.ts` 的 schema 驗證後才送出（替身自己不得另定義一份）。

#### Scenario: [FE-O03-S18] 握手：hello、snapshot，靜止時之後什麼都沒有

- **WHEN** 一條連線連上 `lobby`，之後 500 ms 內不送任何東西
- **THEN** 收到的 SHALL 正好是 `hello`（`hz` 為 10）與 `snapshot` 兩則；500 ms 內 SHALL 沒有第三則

#### Scenario: [FE-O03-S19] 自己的 move 會廣播回自己

- **WHEN** 送 `{"t":"move","x":120,"y":340,"f":2}`
- **THEN** 200 ms 內 SHALL 收到一則 `pos`，`p` 裡 SHALL 有 `[<自己的 id>,120,340,2]`

#### Scenario: [FE-O03-S20] 不合協定的訊息靜默丟棄

- **WHEN** 依序送 `{"t":"teleport"}`、`{"t":"move","x":1.5,"y":2,"f":0}`、`{"t":"status","text":"<13 個字>"}`、`not json`
- **THEN** 500 ms 內 SHALL 沒有收到任何 `err`，連線 SHALL 仍開著；之後送一則合法的 `status` SHALL 正常收到廣播

#### Scenario: [FE-O03-S21] 握手失敗不給 err

- **WHEN** 連 `/ws?scene=bogus`，以及 `/ws?scene=room:<uuid>` 不帶 `token`
- **THEN** 兩條連線 SHALL 都被以 `1008` 關閉，關閉之前 SHALL 沒有收到任何訊息

#### Scenario: [FE-O03-S23] `/online` 數的是活著的連線

- **WHEN** 兩條連線進 `lobby`，`GET /online?scene=lobby`；一條斷線，100 ms 後再查；查 `?scene=room:<沒人的 uuid>`
- **THEN** SHALL 分別是 `{"count":2}`、`{"count":1}`、`{"count":0}`
