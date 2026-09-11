# `db/schema/` —— 可拋棄資料庫的 schema

規格 `FE-O04`（`openspec/changes/fe-o04-disposable-db/`）。

| 檔案 | 來源 | 規則 |
|---|---|---|
| `001_schema.sql` | 後端 repo `sql/001_schema.sql` | **逐字複本。不得改任何一個字元。** 後端改了就重新複製。`tests/db-schema-copy.test.ts` 在後端 repo 在本機時逐位元組比對 |
| `002_seed.sql` | 後端 repo `sql/002_seed.sql` | 同上。今天 seed 有 **32** 張名片、**28** 個專案、seats 與 messages 若干（`tests/db-reset.test.ts` 用這兩個數字；複本改了那條會先紅，數字跟著改） |
| `1xx_*.sql` | 前端自己 | **前端自己加的，後端沒有** —— 第一行必須是 `-- 前端自己加的，後端沒有：` 開頭的註解。W6+ 先長在這裡的表、可登入的測試帳號都放這裡。之後交給後端時整個檔案搬過去 |

## 指令

```bash
npm run db:reset -- --init   # 第一次：資料庫是空的
npm run db:reset             # 之後：drop schema → 全部 .sql → 標記
npm run db:seed              # 只套 002_seed.sql（可重複）
```

連線字串：`INTERNAL_DATABASE_URL`（開發）、`INTERNAL_TEST_DATABASE_URL`（測試；**必須是另一個庫**）。
只接受 loopback。`db:reset` 只對**它自己標記過**（`_guildhub_disposable` 表）的資料庫動手；沒有標記直接失敗。

## 本機起 Postgres

這台已裝 Homebrew 的 `postgresql@16`：

```bash
pg_ctl -D /opt/homebrew/var/postgresql@16 start
psql -d postgres -c "create role guildhub with login password 'guildhub' createdb"
psql -d postgres -c "create database guildhub_frontend owner guildhub"
psql -d postgres -c "create database guildhub_frontend_test owner guildhub"
```

或 `docker compose up -d`（repo 根目錄的 `docker-compose.yml`，同樣的角色與兩個庫）。CI 用 service container。
