# `FE-O05` 設計：難逆轉的決定與代價

## D1｜真 HTTP，不 import handler（兩位審查者第一輪一致）

`vitest.contract.mts`：`environment: 'node'`、`include: ['tests/contract/**/*.contract.ts']`、`fileParallelism: false`、`globalSetup` 是 harness。
`internal` 的 harness：`db:reset`（測試庫）→ `next start -p 0`（隨機 port，從 stdout 抓實際 port）→ 把 `CONTRACT_BASE_URL` 寫進環境 → 跑 → kill。
代價：契約套件要先 `next build`（CI 已經有；本機第一次約一分鐘）。**不用 `next dev`**：dev 的第一次請求會編譯，timeout 判準會亂。

## D2｜cookie jar 與 raw request 是 harness 的一部分，不是每個測試自己寫

`tests/contract/client.ts`：`login(nickname)` 回一個帶 jar 的 client；`client.raw(method, path, { body, headers })` 回 `{ status, contentType, text, json? }`。
**不用 `operations.ts`**：那一層在送出前就用 Zod 擋了 `max+1`，經過它永遠看不到後端的 500。

## D3｜guildhub 的 wrapper 自己起後端、自己給它一個庫

`scripts/contract-guildhub.mjs`：
1. `GUILDHUB_BACKEND_DIR` 存在？8000 沒人聽？（有人聽 → 拒絕，不借用 —— 「自己起的」才是可拋棄的證明）
2. `db:reset` `INTERNAL_TEST_DATABASE_URL`（同一份 schema 複本，兩個後端讀同一個庫的 DDL）
3. `DATABASE_URL=<那個庫> SESSION_SECRET=contract ./run.sh`，等 `GET /api/me` 回 401（ready）
4. `CONTRACT_TARGET=guildhub CONTRACT_BASE_URL=http://127.0.0.1:8000 CONTRACT_WS_URL=ws://127.0.0.1:8000/ws vitest --config vitest.contract.mts`
5. kill 自己的 PID（`SIGTERM`，3 秒後 `SIGKILL`）

`.env.example` 的 `TEST_DATABASE_URL` 在後端是給**它自己的** pytest 用的（會 drop schema）；我們不碰它，也不碰它的 `DATABASE_URL` 開發庫。

## D4｜邊界表是資料，測試是迴圈

`boundaries.ts` 匯出 `BOUNDARY_CASES: Array<{ field, via: { method, path, key }, accept: string[], reject: Array<{ value, expect: 500 | 422 }>, pending?: string }>`，
從 `LIMITS` 算出來。測試 `for (const c of BOUNDARY_CASES)` 一條一條打。`pending` 的印出來不跑。
`FE-O06` 盯的就是這個檔案「真的從 `LIMITS` 取值」（`FE-O06-S01`）。

## D5｜golden 是兩邊共同的裁判

`tests/contract/golden/422.json` 由**第一次對 guildhub 跑**時產生（`CONTRACT_RECORD=1`），之後兩邊都對它比。
「以 internal 為準」會讓替身的形狀變成契約；「以 guildhub 每次的即時回應為準」在 CI 沒有 guildhub。golden 檔進版控，重錄要 PR。

## 待答問題

1. **真後端時間字串的實際形狀**（asyncpg `timestamptz` → Pydantic → JSON）：微秒位數、`+00:00` 還是 `Z`。第一次錄 golden 時定。
2. **`next start -p 0` 會不會印出實際 port。** 不會的話改成先找一個空 port 再傳給它。
3. **CI 的 `next build` 產物能不能直接給契約 job 用**（同一個 job 內接著跑，或 artifact）。

## 這一份怎麼驗

- `S01`、`S02`、`S04`：純檔案／環境變數判準，`npm test` 裡跑（不需要後端）。
- `S03`、`S07`～`S14`：契約套件本身（`internal` 在 CI；`guildhub` 本機）。
- `S05`、`S06`：wrapper 的判準（node 測試，起一個假的 8000 監聽 → wrapper 要拒絕）。
- `S15`：`.github/scripts/test-*.sh` 形狀的自檢（走 `governance/`）。
- **不連任何團隊共用的位址。**
- 驗收不是全綠：`S09` 本身就是突變；jar 拿掉 → `S03` 紅；loopback 檢查拿掉 → `S04` 紅；wrapper 借用既有 8000 → `S05` 紅；
  邊界表寫死數字 → `FE-O06-S01` 紅。
