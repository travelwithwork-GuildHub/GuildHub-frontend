## Applicability

權限：**不適用** —— 這一列沒有使用者，只有開發者與測試
併發：**不適用** —— `db:reset` 是單一程序的循序指令；連線池的併發由 `pg` 處理，不在這裡定義
持久資料相容性：**適用** —— 這個資料庫的 schema 是後端 `sql/001_schema.sql` 的複本，漂移要被機器抓到
失敗路徑：**適用** —— 位址不是 loopback、測試庫等於開發庫、資料庫沒有可拋棄標記、複本與後端不同

測試連到什麼：**本機自己起的、可拋棄的 Postgres**（Homebrew 或 `docker compose up`；CI 是 service container）。
連線字串只從環境變數來；**不連任何團隊共用的位址。**

## ADDED Requirements

### Requirement: schema 與 seed 是後端檔案的逐字複本，漂移由機器抓

`db/schema/001_schema.sql` 與 `db/schema/002_seed.sql` SHALL 是後端 repo `sql/001_schema.sql`、`sql/002_seed.sql` 的**逐字複本**。
前端自己新增的東西（W6+ 的表、可登入的測試帳號）SHALL 放在 `db/schema/1xx_*.sql`（編號從 100 起），
檔頭第一行 SHALL 是 `-- 前端自己加的，後端沒有：` 開頭的註解。
後端 repo 在本機時（`GUILDHUB_BACKEND_DIR`，預設 `../GuildHub-backend`），一條測試 SHALL 逐位元組比對兩份複本；
不在本機時那條測試 SHALL 明確 skip 並說出路徑。

⚠️ 這是選 Postgres 而不是 SQLite 的**唯一理由**：翻過方言的 DDL 沒有任何機器能對回原檔。

#### Scenario: [FE-O04-S01] 複本與後端一字不差

- **WHEN** 後端 repo 在 `GUILDHUB_BACKEND_DIR`，比對 `db/schema/001_schema.sql` 與它的 `sql/001_schema.sql`（seed 同）
- **THEN** 兩份 SHALL 逐位元組相同；任何一個字元不同，測試 SHALL 紅並印出第一個不同的行號

#### Scenario: [FE-O04-S02] 後端不在本機：明說，不假綠也不假紅

- **WHEN** `GUILDHUB_BACKEND_DIR` 指的目錄不存在（CI 就是這樣）
- **THEN** 比對那條測試 SHALL 是 skip，訊息 SHALL 含它找過的路徑

### Requirement: 一個指令回到乾淨狀態

`npm run db:reset` SHALL 依序：終止這個資料庫上**其他**連線（`pg_terminate_backend`；開著的 GUI client 或背景的 dev server 會讓 drop 卡住）、
`drop schema public cascade`、`create schema public`、執行 `db/schema/` 底下**全部** `.sql`（依檔名排序）、寫入可拋棄標記（見下一條）。執行兩次的結果 SHALL 相同。`npm run db:seed` SHALL 只執行 `002_seed.sql`，可重複執行（seed 本身是 `on conflict do nothing`）。
兩個指令 SHALL 只接受 loopback 位址（`localhost`、`127.0.0.1`、`::1`）；其他 host SHALL 直接失敗、不連線。

#### Scenario: [FE-O04-S03] reset 之後是乾淨的、有 seed 的

- **WHEN** 先塞一筆自己的名片，再 `db:reset`
- **THEN** 那筆 SHALL 不在；`profiles` SHALL 是 28 筆、`projects` 24 筆、`seats` 4、`messages` 4（**實測**：seed 檔的 values 有 32／28 列，但 4＋4 個 id 重複，`on conflict do nothing` 吃掉；數字記在 `db/schema/README.md`；複本改了 `S01` 會先紅，數字跟著改）；`1xx_*.sql` SHALL NOT 新增名片（測試帳號是把 seed 的第一張名片加上帳號密碼）

#### Scenario: [FE-O04-S04] reset 是冪等的，而且別的連線開著也做得完

- **WHEN** 另開一條連線對 `profiles` 下 `select … for update` 且不 commit，然後連續 `db:reset` 兩次
- **THEN** 兩次 SHALL 都在 10 秒內成功（那條連線被終止），表的集合與每張表的筆數 SHALL 相同

#### Scenario: [FE-O04-S05] seed 可重複

- **WHEN** `db:seed` 連跑兩次
- **THEN** 第二次 SHALL 成功，`profiles` 筆數 SHALL 與第一次相同

#### Scenario: [FE-O04-S06] 前端自己的表另外標明

- **WHEN** `db/schema/` 底下有 `1xx_*.sql`
- **THEN** 每一個檔案的第一行 SHALL 是 `-- 前端自己加的，後端沒有：` 開頭的註解（測試逐檔檢查）；`db:reset` SHALL 在 `002_seed.sql` 之後執行它們

#### Scenario: [FE-O04-S07] 位址不是 loopback：不連線就失敗

- **WHEN** `INTERNAL_DATABASE_URL` 的 host 是 `db.example.com`，執行 `db:reset`
- **THEN** SHALL 在建立任何連線之前失敗，訊息 SHALL 說明只接受 loopback

### Requirement: 破壞性操作之前先證明連的是可拋棄的那一份

`db:reset` SHALL 在資料庫裡建立標記表 `_guildhub_disposable`（一列：`created_at`、`schema_files` 清單）。
任何會刪資料的路徑（`db:reset` 的 drop、測試的 truncate）在動手之前 SHALL 先查這張表：
**沒有標記 → 直接失敗，不動任何東西**。唯一的例外是 `db:reset --init`：只在資料庫裡**沒有任何使用者表**時允許（第一次初始化）。

⚠️ `AGENTS.md`〈測試環境隔離〉第 3 條：不是「相信環境變數設對了」，是在動手前實際檢查一次。

#### Scenario: [FE-O04-S08] 沒有標記的資料庫不能被 reset

- **WHEN** 一個有 `profiles` 表、但沒有 `_guildhub_disposable` 的資料庫，執行 `db:reset`
- **THEN** SHALL 失敗，`profiles` 的內容 SHALL 原封不動

#### Scenario: [FE-O04-S09] 全空的資料庫可以初始化

- **WHEN** 一個沒有任何表的資料庫，執行 `db:reset --init`
- **THEN** SHALL 成功並建立標記；之後不帶 `--init` 的 `db:reset` SHALL 也成功

### Requirement: 測試用另一個資料庫，不動開發資料

測試 SHALL 只連 `INTERNAL_TEST_DATABASE_URL`。它與 `INTERNAL_DATABASE_URL` 相同 SHALL 被拒絕（測試整檔紅，不是 skip）；
它沒設，需要資料庫的測試 SHALL 是 skip，**不退回 `INTERNAL_DATABASE_URL`**。

#### Scenario: [FE-O04-S10] 測試庫等於開發庫：拒絕

- **WHEN** `INTERNAL_TEST_DATABASE_URL` 與 `INTERNAL_DATABASE_URL` 是同一個字串
- **THEN** 需要資料庫的測試 SHALL 在連線之前失敗，訊息 SHALL 說明兩者必須分開

#### Scenario: [FE-O04-S11] 沒設測試庫：skip，不退回

- **WHEN** `INTERNAL_TEST_DATABASE_URL` 沒設、`INTERNAL_DATABASE_URL` 有設
- **THEN** 需要資料庫的測試 SHALL 是 skip；`INTERNAL_DATABASE_URL` 那個資料庫 SHALL 沒有收到任何連線

### Requirement: 連線只在伺服器端

連線池 SHALL 只存在於 `src/server/db.ts`，該模組 SHALL import `server-only`；
client 元件或任何會進 client bundle 的模組 import 它 SHALL 在建置時失敗。連線字串 SHALL 經由 `src/config/env.ts` 讀取（`FE-O09`）。

#### Scenario: [FE-O04-S12] 在瀏覽器環境 import 資料庫模組：import 那一刻就拋錯

- **WHEN** 在 jsdom（模擬瀏覽器）裡 `import('@/server/db')`
- **THEN** SHALL 在 import 時 reject（`server-only` 的保護），不是等到第一次查詢才炸
- **AND** `next build` 對一個 `'use client'` 元件 import 它 SHALL 失敗（人工驗一次，記在 PR）

#### Scenario: [FE-O04-S13] 連線字串沒有第二個讀取點

- **WHEN** 掃 `src/**` 裡 `process.env.INTERNAL_DATABASE_URL` 與 `process.env.INTERNAL_TEST_DATABASE_URL` 的出現位置
- **THEN** SHALL 只在 `src/config/env.ts`（`FE-O09` 的 lint 規則已擋，這條是它的判準）
