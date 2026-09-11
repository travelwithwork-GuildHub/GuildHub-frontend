## Applicability

權限：**不適用** —— 契約測試自己登入自己的名片；權限規則本身是 `FE-O03`／真後端的義務
併發：**不適用** —— 套件循序跑（`fileParallelism: false`），兩個目標各一個程序
持久資料相容性：**適用** —— 寫入的是可拋棄的庫；每次跑之前 reset
失敗路徑：**適用** —— 目標不是 loopback、目標不是自己起的、庫沒有可拋棄標記、真後端不在本機

測試連到什麼：`internal` 是 harness **自己起的** `next start`（隨機 port）＋ `INTERNAL_TEST_DATABASE_URL` 的可拋棄 Postgres；
`guildhub` 是 wrapper **自己起的** `./run.sh`（`GUILDHUB_BACKEND_DIR`）＋ 一個由 `db:reset` 建立、專給這一輪用的庫。
**不連任何團隊共用的位址；不接受任何既有的程序。**

## ADDED Requirements

### Requirement: 唯一一份，兩個目標各跑一次，都走真 HTTP

契約測試 SHALL 只存在於 `tests/contract/**`（`*.contract.ts`，不在 `npm test` 的 include 裡）。
`CONTRACT_TARGET` SHALL 是 `internal` 或 `guildhub`，缺席或其他值 → 套件整個失敗（不是 skip）。
兩個目標 SHALL 跑**同一組**測試檔；目標的差異只能出現在 harness（起什麼、reset 什麼），SHALL NOT 出現在測試檔的 `if (target === …)`。
請求 SHALL 走 HTTP 到 `CONTRACT_BASE_URL`；SHALL NOT import 任何 Route Handler 模組。
harness 的 client SHALL 維護 cookie jar（`Set-Cookie` → 後續的 `Cookie`），並提供 `raw()`：任意 method／path／body／headers，不經 `operations.ts`。

#### Scenario: [FE-O05-S01] 沒有指定目標：失敗，不是 skip

- **WHEN** `CONTRACT_TARGET` 缺席，跑契約套件
- **THEN** SHALL 失敗，訊息 SHALL 列出兩個合法值；SHALL NOT 有任何測試被算成 pass 或 skip

#### Scenario: [FE-O05-S02] 測試檔裡沒有目標分支

- **WHEN** 掃 `tests/contract/**/*.contract.ts` 的原始碼
- **THEN** SHALL 沒有任何一處讀 `CONTRACT_TARGET`（只有 harness 讀）；SHALL 沒有 `from '@/app/api/`、`from '@/server/` 的 import

#### Scenario: [FE-O05-S03] cookie jar 讓登入延續

- **WHEN** 用 harness 的 client `POST /api/login {"nickname":"契約"}`，再 `GET /api/me`
- **THEN** 第二次 SHALL 是 `200` 且是同一個人 —— 用**不帶 jar 的** `fetch` 打同樣兩次，第二次 SHALL 是 `401`（證明 jar 不是恆真）

### Requirement: 目標必須是自己起的、可拋棄的

`CONTRACT_BASE_URL` 的 host SHALL 是 loopback；否則在送出任何請求之前失敗。
`internal`：harness SHALL 自己 `next start` 在隨機 port，並在開跑前 `db:reset` `INTERNAL_TEST_DATABASE_URL`（沒有可拋棄標記 → 失敗）。
`guildhub`：wrapper（`scripts/contract-guildhub.mjs`）SHALL 自己以 `GUILDHUB_BACKEND_DIR` 的 `./run.sh` 起後端、
`DATABASE_URL` 指向一個由 `db:reset` 建立的庫（`INTERNAL_TEST_DATABASE_URL` 那一個，**兩個後端讀同一份 schema 複本**）、
等它 ready、跑套件、結束時 kill 自己起的 PID。**wrapper SHALL NOT 接受一個已經在聽的 8000**：port 有人在聽 → 失敗，不借用。

#### Scenario: [FE-O05-S04] 目標不是 loopback：不送請求就失敗

- **WHEN** `CONTRACT_BASE_URL=http://api.example.com`
- **THEN** SHALL 在建立任何連線之前失敗，訊息 SHALL 說明只接受 loopback

#### Scenario: [FE-O05-S05] guildhub 的 port 已經有人在聽：拒絕借用

- **WHEN** 跑 `contract-guildhub.mjs` 之前 8000 已經有程序在聽
- **THEN** wrapper SHALL 失敗並說明「不接受既有的後端」，SHALL NOT 送任何請求給它

#### Scenario: [FE-O05-S06] 後端 repo 不在本機：明說

- **WHEN** `GUILDHUB_BACKEND_DIR` 不存在，跑 wrapper
- **THEN** SHALL 失敗並印出找過的路徑（不是 skip，不是假綠）

### Requirement: 成對邊界從 `limits.ts` 產生

邊界案例 SHALL 由 `tests/contract/boundaries.ts` 產生：**值**來自 `FE-O06` 的 `boundaryValues(limit)`（`src/api/contract/boundaries.ts`，
純函式：`max` 個 CJK、`max` 個 emoji 接受；`max+1` 拒絕；`min > 0` 時 `min-1` 拒絕），這裡只負責把每個欄位對到**端點與鍵**（`via`）。
測試檔 SHALL NOT 出現任何長度數字。
W2 端點到得了的欄位：`displayName`（`POST /api/login` 的 `nickname`、`PATCH` 的 `display_name`）、`bio`（`PATCH`）。
到不了的（`messageBody`、`seatIndex`、`password`、`loginId`）SHALL 在表裡標成 `pending: '<能力>'`，測試 SHALL 印出 pending 的清單但不算失敗。
「拒絕」的形狀由表指定：資料庫 check 擋的是 `500 text/plain`；應用層擋的是 `422`。

#### Scenario: [FE-O05-S07] display_name 的四個邊界

- **WHEN** `PATCH /api/profiles/me` 依序送 `display_name` 為 20 個 CJK、20 個 emoji、21 個 CJK、空字串
- **THEN** 前兩次 SHALL 是 `200` 且回傳的 `display_name` 逐字相同；後兩次 SHALL 是 `500 text/plain`；每一次拒絕之後 `GET /api/me` 的 `display_name` SHALL 是最後一次成功的值

#### Scenario: [FE-O05-S08] bio 的邊界與純空白

- **WHEN** `PATCH` 送 `bio` 為 300 個字、301 個字、`""`、`"   "`（三個空白）
- **THEN** SHALL 分別是 `200`、`500`、`200`（`bio` 是 `""`）、`200`（`bio` 是 `"   "` —— 後端不 trim，這是要記下來的事實）

#### Scenario: [FE-O05-S09] 上限收緊會被抓到

- **WHEN** 把 `limits.ts` 的 `bio.max` 改成 200（模擬後端收緊而前端沒跟）
- **THEN** 對兩個目標跑，`max+1`（201）那一條 SHALL 都紅 —— 因為後端仍接受 201 個字（測試預期拒絕）；改回 300 SHALL 全綠

> 這是「只送超長抓不到收緊」那條 Alarm 的直接判準。

### Requirement: 形狀與型別：兩邊一字不差

以下案例 SHALL 對兩個目標得到相同的 status、`Content-Type`、與 body 形狀（`detail` 的字串逐字相同；422 陣列比 `loc[0]` 與 `type` 的存在）：
`page=abc`、`page=1.5`、`page=-1`、`status=bogus`、`POST /api/login` 送 body 字面 `null`、送非 JSON 的文字、JSON 但缺 `Content-Type`、
`resume_token` 不是 uuid、`{"nickname": null}`、`{"nickname": 123}`。**每一個都要有 Scenario 或在 golden 表裡**（`S16`）。
時間欄位（`updated_at`、`expires_at`）SHALL 是同一個 regex 能匹配的形狀（design 待答：實測真後端後定案，寫進 golden）。

#### Scenario: [FE-O05-S10] 型別強制轉換不會靜默成功

- **WHEN** `GET /api/profiles?page=abc` 與 `?page=1.5`
- **THEN** 兩次 SHALL 都是 `422`（不是當成 0），`detail[0].loc[0]` SHALL 是 `query`

#### Scenario: [FE-O05-S11] null、缺欄、錯型別

- **WHEN** `POST /api/login` 送 `{"nickname": null}`、`{}`、`{"nickname": 123}`、`{"resume_token": "not-a-uuid"}`
- **THEN** 四次 SHALL 都是 `422`，`detail` SHALL 是陣列且每一項通過 `ValidationError` 解析

#### Scenario: [FE-O05-S12] golden 形狀對得上，而且錄製那一次不算驗收

- **WHEN** `CONTRACT_RECORD=1` 對 `guildhub` 錄一次（寫 `tests/contract/golden/422.json`），再**不帶** `CONTRACT_RECORD` 對 `guildhub` 與 `internal` 各跑一次
- **THEN** 錄製那一次 SHALL 以**非 0 的 exit code** 結束並印「已錄製，不算通過」，之後兩次 SHALL 逐項相同；
  compare 模式下 golden 檔 SHALL 是唯讀（跑完 `git diff` 沒有變化）

#### Scenario: [FE-O05-S16] body 的三種壞法與負頁碼

- **WHEN** `POST /api/login` 分別送：body 字面 `null`、文字 `not json`、合法 JSON 但沒有 `Content-Type`；以及 `GET /api/profiles?page=-1`
- **THEN** 前三個的 `{status, contentType, loc[0]?}` SHALL 與 golden 相同（兩個目標）；`page=-1` SHALL 與 `page=0` 回同樣的 20 筆（兩個目標）

### Requirement: WS 契約對兩邊各跑一次

`tests/contract/ws/*.contract.ts` SHALL 對 `CONTRACT_WS_URL`（`internal` 是 harness 起的替身，`guildhub` 是 wrapper 起的後端的 `/ws`）跑：
未知 `t` 靜默、浮點座標靜默、超過 12 個 code point 的狀態靜默、握手後靜止 500 ms 內除了 `hello` 與 `snapshot` 沒有第三則、自己的 `move` 會回到自己。
判準 SHALL 只用 `src/api/contract/ws.ts` 的 schema 解析收到的訊息。

#### Scenario: [FE-O05-S13] 靜止時封包數為 0

- **WHEN** 連上 `lobby`，握手完成後 500 ms 內不送任何東西
- **THEN** 兩個目標都 SHALL 正好收到 `hello`、`snapshot` 各一則，之後 0 則

#### Scenario: [FE-O05-S14] 不合協定的三種輸入之後連線仍活著

- **WHEN** 依序送未知 `t`、`x` 為 1.5 的 `move`、13 個字的 `status`，再送一則合法的 `status`
- **THEN** 兩個目標都 SHALL 沒有回 `err`、沒有關連線，最後那則合法的 `status` SHALL 被廣播回來

### Requirement: CI 只跑 internal；guildhub 在本機

CI SHALL 有一個 job 跑 `CONTRACT_TARGET=internal`（service container 的 Postgres、用 `next build` 的產物 `next start`）。
CI SHALL NOT 設定 `GUILDHUB_BACKEND_DIR`，也 SHALL NOT 有任何步驟跑 `contract-guildhub.mjs`。
`npm run test:contract:internal`、`npm run test:contract:guildhub` 兩個指令 SHALL 存在；後者就是 wrapper。

#### Scenario: [FE-O05-S15] CI 的 job 結構：有 Postgres service、跑 internal、不起真後端

- **WHEN** 解析 `.github/workflows/ci.yml` 的 YAML
- **THEN** SHALL 存在一個 job：`services` 裡有 `postgres`，且某個 step 的 `run` 含 `test:contract:internal`；
  所有 job 的所有 step 的 `run`／`uses` SHALL 沒有 `contract-guildhub`、`run.sh`、`CONTRACT_TARGET=guildhub`（比的是 step 內容，不是整檔文字 —— 註解與 step 名稱不算）
