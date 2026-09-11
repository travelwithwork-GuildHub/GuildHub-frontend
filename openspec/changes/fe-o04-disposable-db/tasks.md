# `FE-O04` 任務

## 1. 規格

- [x] 1.1 規格已在 PR 上談定（`spec/fe-o04-disposable-db`）

## 2. 複本與漂移

對應 Requirement〈schema 與 seed 是後端檔案的逐字複本，漂移由機器抓〉

- [x] 2.1 `db/schema/001_schema.sql`、`002_seed.sql` 逐字複製；`db/schema/README.md` 說明來源與規則
- [x] 2.2 判準：`S01`、`S02`（`tests/db-schema-copy.test.ts`）
- [x] 2.3 **突變**：複本改一個字元 → `S01` 紅

## 3. reset／seed 與可拋棄標記

對應 Requirement〈一個指令回到乾淨狀態〉、〈破壞性操作之前先證明連的是可拋棄的那一份〉

- [x] 3.1 `pg`、`server-only` 依賴；`docker-compose.yml`（只有 Postgres）
- [x] 3.2 `src/config/env.ts`：`INTERNAL_DATABASE_URL`、`INTERNAL_TEST_DATABASE_URL`（server-only 鍵）；`.env.example` 說明
- [x] 3.3 `scripts/db.mjs`：`reset [--init]`、`seed`；loopback 檢查；標記表；`package.json` 的 `db:reset`／`db:seed`
- [x] 3.4 判準：`S03`～`S09`（`tests/db-reset.test.ts`，node 環境，沒設測試庫就 skip）
- [x] 3.5 **突變**：拿掉標記檢查 → `S08` 紅；拿掉 loopback 檢查 → `S07` 紅；reset 不執行 `1xx` → `S06` 紅

## 4. 測試庫與伺服器端連線

對應 Requirement〈測試用另一個資料庫，不動開發資料〉、〈連線只在伺服器端〉

- [x] 4.1 `src/server/db.ts`：`server-only`、連線池、`testDatabase()`（相同就拒絕、沒設就 skip 的判斷）
- [x] 4.2 判準：`S10`～`S13`
- [x] 4.3 **突變**：測試退回開發庫 → `S11` 紅；相同不拒絕 → `S10` 紅；拿掉 `server-only` → `S12` 紅

## 5. 收尾

- [x] 5.1 `npm run typecheck`、`npm run lint`、`npm test` 全綠；本機 `db:reset --init` 一次、人工驗 `S12` 的 `next build`
- [ ] 5.2 封存（`archive/fe-o04-disposable-db`，獨立 PR）
