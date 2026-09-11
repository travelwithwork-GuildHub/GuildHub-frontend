# `FE-O04` 可拋棄的資料庫

## Why

`CLAUDE.md`：「沒有任何一項在等後端。前端有自己的後端：Next.js Route Handlers ＋ 一個可拋棄的資料庫。」
今天那個資料庫**不存在** —— `NEXT_PUBLIC_DATA_ADAPTER=internal` 的每個操作都拋 `AdapterNotImplementedError`（`FE-O02-S02`）。
W6–W12 的產品能力（Open Role、invitation、offer⋯⋯）真後端還沒有對應的表；沒有這個可拋棄的資料庫，
那些能力要嘛等後端、要嘛把資料放記憶體 —— 後者做出來的東西之後銜接是重寫不是切換。

不做會怎樣：`FE-O03`（本地後端）沒有地方放資料；`FE-O05`（契約測試）在 CI 裡沒有 `internal` 目標可打。

## What Changes

- **引擎是 Postgres**，不是 SQLite。三輪討論後兩位審查者一致：schema 對齊要能被**機器驗** ——
  後端的 `sql/001_schema.sql` 與 `sql/002_seed.sql` **逐字複製**進前端 repo，`db:reset` 直接執行它們；
  後端 repo 在本機時，一條測試 `diff` 兩份，不一樣就紅。SQLite 要翻方言（`text[]`→JSON、enum→check、
  `timestamptz`→text），翻過的 DDL 沒有機器能對回去；而且 W6–W12 先長在這裡的新表用 Postgres DDL 寫，
  後端可以直接拿走。代價：用 `internal` adapter 之前要先起 Postgres（這台機器已裝 Homebrew Postgres；CI 用 service container）。
- 前端自己新增的表（W6+）放在**另外編號、另外標明**的檔案裡（`db/schema/1xx_frontend_*.sql`），不混進複本。
- `npm run db:reset`：一個指令回到乾淨狀態（drop → schema → seed → 前端的表）；`npm run db:seed`：只套 seed，可重複執行。
- **測試用另一個資料庫**：`INTERNAL_TEST_DATABASE_URL` 與 `INTERNAL_DATABASE_URL` 分開；相同就拒絕；沒設就 skip，**不退回開發資料庫**。
- **破壞性操作之前先證明連的是可拋棄的那一份**（`AGENTS.md`〈測試環境隔離〉第 3 條）：`db:reset` 在資料庫裡留一個標記表；
  任何會清資料的路徑先看標記，沒有就直接失敗。
- `src/server/db.ts`：連線池，**只能在伺服器端 import**（`server-only`）；連線字串走 `src/config/env.ts`（`FE-O09` 的唯一讀取點）。

## ⚠️ 不做什麼

- **SHALL NOT 做 migration 框架。** 跟後端一樣：編號的 `.sql` 檔，一次性實例，重建就是 `db:reset`。
- **SHALL NOT 改複本的任何一個字元。** 後端的 schema 要改，去後端改，再複製過來。
- **SHALL NOT 在這一列做任何 Route Handler。** 那是 `FE-O03`。
- **SHALL NOT 提供 Docker Compose 之外的第二套啟動方式的文件**：本機用 Homebrew 或 Docker 都行，
  但 repo 只放一份 `docker-compose.yml`（CI 用 service container，不用它）。
- **SHALL NOT 讓 `db:reset` 能指向任何非 loopback 的位址**（`FE-O04-S07`）。
