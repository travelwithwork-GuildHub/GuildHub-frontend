# `FE-O04` 設計：難逆轉的決定與代價

## D1｜Postgres，不是 SQLite（三輪討論）

第一輪：一位審查者選 SQLite（零依賴、每個測試臨時 DB、防漂移靠 HTTP 契約測試不靠引擎），一位選 Postgres
（直接執行 `sql/001_schema.sql`）。第二輪兩位**互換立場**。第三輪用一個可判定的準則收斂：
**「schema 對齊」能不能被機器驗？** Postgres 可以（逐位元組 diff 複本），SQLite 不行（翻過方言的 DDL 對不回去）。
另外 W6–W12 先長在這裡的新表用 Postgres DDL 寫，後端可以直接拿走。兩位一致選 Postgres。

代價：`internal` adapter 之前要有一個在跑的 Postgres。本機：Homebrew（這台已裝）或 `docker compose up -d`；CI：service container。
Node 端多一個依賴 `pg`。

## D2｜複本，不是 symlink、不是 submodule

後端 repo 不一定在本機（CI 沒有）。複本進版控，diff 測試在後端 repo 在時才跑。
不用 submodule：那把兩個 repo 的版本綁在一起，而後端是別人的 repo。

## D3｜可拋棄標記是一張表，不是資料庫名稱的慣例

「名稱含 `test` 就當可拋棄」看起來夠用，直到有人把開發庫取名 `guildhub_test_local`。
標記表是 `db:reset` 自己寫進去的，只有它寫過的資料庫會有 —— 這是「證明」，不是「猜」。
`--init` 只在資料庫沒有任何使用者表時允許，所以一個真的資料庫（有表、沒標記）永遠不會被初始化。

## D4｜連線字串的環境變數是 `INTERNAL_*`，沒有 `NEXT_PUBLIC_` 前綴

它們只在伺服器端讀。`NEXT_PUBLIC_` 會被編進 client bundle（`.env.example` 開頭那段），連線字串進去就是外洩。
`src/config/env.ts` 是唯一讀取點（`FE-O09`），這裡加兩個 server-only 的鍵。

## D5｜`db:reset` 用 `psql` 還是 `pg` 執行 `.sql`？

用 `pg`（Node）：`psql` 不一定在 PATH（Docker 的人沒有），而 `pg` 是 runtime 本來就要的依賴。
整個檔案當一個 multi-statement query 送（`pg` 的簡單查詢協定支援多句）。
seed 檔裡沒有 `\` 開頭的 psql 指令（實測過），所以可以。

## 待答問題

1. **Homebrew 的 Postgres 版本。** 這台是 `postgresql@17`？`gen_random_uuid()` 在 13+ 內建，沒問題；記在 README。
2. **`1xx` 的第一個檔案是什麼。** `FE-O03` 需要一個可登入的測試帳號（seed 沒有 `login_id`）：`100_test_account.sql`，
   內容是 `update profiles set login_id = …, password_hash = … where id = '11111111-…-000000000001'` —— **不新增名片**，分頁的筆數不變（審查抓到的）。

## 這一份怎麼驗

- `S01`／`S02`：純檔案測試（`tests/db-schema-copy.test.ts`），不連資料庫。
- `S03`～`S11`：`@vitest-environment node`，連 `INTERNAL_TEST_DATABASE_URL`；沒設就 skip（`S11` 本身用一個假的 `INTERNAL_DATABASE_URL` 指向沒人聽的 port，並斷言沒有連線嘗試）。
- `S07`：不連線就失敗 —— 用一個沒人聽的 port 也能驗（連了會是 ECONNREFUSED，不連是我們自己的訊息）。
- `S12`：jsdom 環境 `import('@/server/db')` reject。
- **不連任何團隊共用的位址。**
- 驗收不是全綠：拿掉標記檢查 → `S08` 紅；拿掉 loopback 檢查 → `S07` 紅；測試退回開發庫 → `S11` 紅；複本改一個字元 → `S01` 紅。
