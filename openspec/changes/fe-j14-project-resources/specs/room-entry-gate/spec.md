## Applicability

權限：適用 —— 本地 `enter` 成功後，這個 session 對那間房的讀取權（`FE-J14` 的非 owner 讀取資源）要能被本地後端驗證。
併發：不適用 —— 不改送出與進房的時序。
持久資料相容性：不適用 —— 票的記法只在本地後端的回應與 cookie 裡，不寫資料庫。
失敗路徑：適用 —— 沒有 enter 過、enter 的是別間房、換了身分。
測試連線：契約測試只打本機自己起的可拋棄後端；單元不連任何服務。

## MODIFIED Requirements

### Requirement: 本地後端的 enter 在下列語意上與真後端相同，票本地替身收得下

`local` 目標 SHALL 提供 `POST /api/projects/{project_id}/enter`：body 合 `EnterIn`，成功回 `EnterOut`。
判斷順序 SHALL 照真後端：session 無效（沒有、簽章壞）→ 401；`password_hash IS NULL`（專案不存在或還沒成軍）→ 404；
密碼不合 → 403；否則簽票 —— **不看 `status`**（`closed` 但有 `password_hash` 照樣簽，跟真後端一樣）、不看座位。錯誤形狀 SHALL 走 `internal-backend` 既有的管線（`{ "detail": … }`）。
「相同」只涵蓋這裡列出的回應分類、下面的 WS 驗票語意，以及**伺服器端記住票**的語意；**已知差異**（不承諾相同）：本地票不過期、**session 指向已不存在的名片**：真後端的 `get_current_user` 不查名片、`enter_room` 對那個 session 照簽 200；本地 SHALL 回 401、回應 MUST NOT 含票（走既有管線）—— 這一列不進兩個目標共用的矩陣，由 `S16` 單獨對本地驗。
簽出的票 SHALL 綁房間**與簽出時的身分**：本地即時層替身對 `room:<project_id>` 的握手 SHALL 只在「票的房間＝scene ∧ 票的身分＝握手 cookie 的身分」時接受；
另一間房、或另一個人拿著這張票 MUST NOT 被接受（跟真後端 `verify()` 同樣的可觀察語意；**本地票不過期**是已知差異，記在 design D7）。

**伺服器端記住票**（真後端把票存進 session 的 `room_tokens`，給需要票的 REST 端點驗）：本地 `enter` 成功時 SHALL 同時讓**這個 session** 在之後的 REST 請求上被本地後端認得「持有這間房的票」，
而 MUST NOT 要求前端在請求上另外帶票（真後端不收 header 或 body 裡的票，前端的資料層對兩個目標送的請求 SHALL 相同）。
被認得的條件 SHALL 是：這個 session 對**同一個** `project_id` 成功 `enter` 過，**且**當時的身分等於現在 session 的身分；
對 A 房成功不算持有 B 房；同一個 session 先後或**同時**進過多間房，每一間各自算數、互不覆蓋。
那份記錄 SHALL 是**簽章過的**，而且簽章 SHALL 同時涵蓋房間與身分：把一間房的有效記錄搬到另一間房的名下 MUST NOT 生效。
用這個語意的是 `FE-J14` 的資源讀取（`internal-backend`〈本地專案資源四端點〉）；`FE-J13` 的座位端點之後沿用同一個，不另做一套。

本地 handler MUST NOT 讀座位、MUST NOT 因座位滿而拒絕。
`enterProject` 的契約測試 SHALL 對 `local` 與 `guildhub` 兩個目標跑同一份。

> 拔掉什麼會紅：handler 不驗密碼 → S12 的 403 那列；handler 與替身用不同的簽章 → S12 握手那段；票不綁身分 → S12 換 cookie 那段；
> handler 看座位 → S12 滿座那列；handler 加 `status === 'active'` 才簽 → S12 的 closed 那列；operation 改路徑或 body 欄位名 → S13 兩個目標都紅（兩個後端都不認）；
> handler 繞過 `handle()`、只驗 cookie 簽章不查名片 → S16 紅；enter 成功不記住票 → S34 的第一個 200 紅；記住的票不分房間 → S34 的 B 房那列紅；不綁身分 → S34 換人那列紅；grant 用明文或不驗簽章 → S37 的偽造那段紅。

#### Scenario: [FE-N08-S12] 本地 enter 的矩陣與票的效力

- **WHEN** 對本地後端依序：未登入、專案不存在、`recruiting`（沒有 `password_hash`）、`active` 密碼錯、`active` 密碼對、`closed` 但有 `password_hash` 密碼對
- **THEN** SHALL 分別得到 401、404、404、403、`200` 且 body 合 `EnterOut`、`200`
- **AND** 用那張票、同一個 session cookie 對本地替身開 `scene=room:<同一個 id>` 的 socket SHALL 收到 `hello`；
  對 `scene=room:<另一個 uuid>` SHALL 被拒絕握手；換另一個人的 session cookie 帶同一張票 SHALL 被拒絕握手
- **AND** 同一個 `active` 專案，在座位表是空的、以及 `seat_count` 格全部被佔滿兩種資料下，密碼正確都 SHALL 回 200
- → 驗於：單元（契約測試，本機起的可拋棄後端＋替身）

#### Scenario: [FE-N08-S13] 兩個目標呈現同一份契約結果；換身分讀不到別人的票

- **WHEN** 對 `local` 與 `guildhub` 目標各執行 enter 的契約測試
- **THEN** 兩個目標 SHALL 都收到 `POST /api/projects/{project_id}/enter` 帶 `EnterIn`；成功 body SHALL 都通過 `EnterOut`；401／403／404 SHALL 翻譯成同一個 `kind`
- **AND WHEN** P 經視窗拿到 R 的票後，同一分頁改以 Q 的身分載入 `/world?room=R`
- **THEN** Q 的第一條連線 MUST NOT 帶 P 的票；場景 SHALL 依 `FE-V01-S14` 回到大廳
- → 驗於：單元（契約）、e2e（換身分）

#### Scenario: [FE-N08-S16] 本地 enter：session 指向已刪的名片 → 401、回應不含票

- **WHEN** 對本地 handler 送一個簽章正確、但名片查不到的 session cookie，body 合 `EnterIn`
- **THEN** SHALL 回 401 `{"detail":"未登入"}`，body 裡 SHALL 沒有 `room_token`；MUST NOT 查 `password_hash`（資料層只收到查名片那一道 SQL；簽章是純計算，這裡不宣稱「沒算過」）
- → 驗於：單元（node、資料層換成記錄 SQL 的假物件；這是本地獨有的義務，不進兩個目標共用的契約檔）

#### Scenario: [FE-J14-S34] enter 成功後，同一個 session 在 REST 上被認得持票；別間房、別人不算

- **GIVEN** active 專案 A、B 都有房間密碼，非 owner 甲登入（harness 的 cookie jar）
- **WHEN** 甲 `GET /api/projects/A/resources`
- **THEN** SHALL 是 `403`
- **AND WHEN** 甲對 A `enter` 成功，再 `GET /api/projects/A/resources`、`GET /api/projects/B/resources`
- **THEN** SHALL 分別是 `200`、`403`
- **AND WHEN** 甲再對 B `enter` 成功，`GET` A 與 B
- **THEN** SHALL 都是 `200`
- **AND WHEN** 同一個 cookie jar 改以乙登入（沒有 enter 過），`GET /api/projects/A/resources`
- **THEN** SHALL 是 `403`
- → 驗於：契約測試（兩個目標，同一份檔案）

#### Scenario: [FE-J14-S37] 本地的票記錄不可偽造，且屬性跟 session cookie 同級（本地獨有）

- **WHEN** 對本地後端 `enter` 成功，檢查回應的 `Set-Cookie`
- **THEN** 記住票的那個 cookie SHALL 帶 `HttpOnly`、`Path=/`、`SameSite=Lax`（非 `local` 環境另帶 `Secure`）
- **AND WHEN** 以 `raw()` 自行構造一個內容看起來正確、但簽章錯誤或沒有簽章的同名 cookie，`GET /api/projects/A/resources`
- **THEN** SHALL 是 `403`（沒有 enter 過的非 owner）
- **AND WHEN** 把甲對 A 的那個 cookie 原封帶到乙的 session（乙的 session cookie ＋ 甲的票記錄）
- **THEN** SHALL 是 `403`
- **AND WHEN** 甲把自己對 A **有效的** cookie 值原封改放到 B 那一間的 cookie 名稱下（沒有對 B `enter` 過），`GET /api/projects/B/resources`
- **THEN** SHALL 是 `403` —— 簽章要同時綁房間與身分；只綁身分的實作會在這裡變成 200
- **AND WHEN** 換一組專案 C、D：甲以同一個 cookie jar **同時**（兩個並行請求）對 C 與 D `enter` 成功，接著 `GET` C 與 D 的資源
- **THEN** SHALL 都是 `200` —— 後回來的那一次記錄 MUST NOT 覆蓋掉先回來的那一間（一間房一份記錄）
- → 驗於：單元（契約測試 harness 的 `raw()`，只對 `local` 目標 —— 真後端的票在它自己的 session 裡，格式不是前端的事，ADR 0008）
- 並行 enter 那段只對 `local`：真後端把所有票放在同一個 session cookie 裡，兩個並行的 `enter` 各自回一整份 session，
  後回來的 `Set-Cookie` 蓋掉先回來的。2026-09-17 對真後端實測同一個 cookie jar 並行 enter C、D，結果是 `403`／`200`；
  循序 enter 則是 `200`／`200`（S34 驗的就是循序）。`enter` 是凍結的既有端點，這是 D4 記下的已知差異，不是真後端要修的 bug。
