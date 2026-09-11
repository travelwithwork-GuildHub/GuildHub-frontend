# `FE-O03` 任務

## 1. 規格

- [x] 1.1 規格已在 PR 上談定（`spec/fe-o03-internal-backend`）；`FE-O04` 已實作（要有資料庫）；`FE-O05` 的 harness 片已合併

## 2. 骨架：管線、session、login

對應 Requirement〈每個 handler 走同一條管線，錯誤形狀複製真後端〉、〈session 是簽章的 HttpOnly cookie〉、〈登入有三種模式，剛好給一組〉

- [x] 2.1 真後端 422 golden cases（design `D3`）→ `tests/contract/golden/422.json`
- [x] 2.2 `src/server/http/handle.ts`、`errors.ts`、`src/server/session.ts`、`src/server/passwords.ts`（scrypt 同參數）
- [x] 2.3 `src/app/api/login/route.ts`、`src/app/api/me/route.ts`；`.env.example` 加 `INTERNAL_SESSION_SECRET`；`FE-O14` 閘門加這個鍵
- [x] 2.4 `db/schema/100_test_account.sql`（把 seed 第一張名片加上帳號密碼，**不新增名片**）
- [x] 2.5 判準：`tests/contract/rest/login.contract.ts`、`me.contract.ts`：`S01`（me 那一支）、`S03`、`S06`～`S12`
- [x] 2.6 **突變**：cookie 不驗簽 → `S07` 紅；login 允許兩組 → `S10` 紅；resume 不存在時建新名片 → `S12` 紅

## 3. 名片、清單、走廊

對應 Requirement〈我的名片：讀與部分更新〉、〈人才與案件清單：分頁形狀複製真後端〉

- [x] 3.1 `PATCH /api/profiles/me`、`GET /api/profiles`、`GET /api/profiles/[id]`
- [x] 3.2 `GET /api/projects`、`GET /api/projects/[id]`、`GET /api/rooms`
- [x] 3.3 判準：`S01`（其餘四支）、`S02`、`S04`、`S05`、`S13`～`S17`
- [x] 3.4 **突變**：handler 擋長度回 422 → `S02` 紅；分頁回 total → `S15` 紅；過期不過濾 → `S16` 紅

## 4. 即時層替身

對應 Requirement〈即時層替身照 `protocol.py`，怪癖一併複製〉

- [x] 4.1 `ws`、`tsx` 依賴；`scripts/realtime-stub.ts`（重用 `src/api/contract/ws.ts`；room token）；`npm run realtime:stub`（`tsx`）
- [x] 4.2 `/online` 查詢口，`GET /api/rooms` 接上（design `D5`）
- [x] 4.3 判準：`S18`～`S23`（`tests/contract/ws/`；`S17` 用 `withoutStub()`）
- [x] 4.4 **突變**：不合法訊息回 `err` → `S20` 紅；靜止送空 `pos` → `S18` 紅；自己的 move 不回自己 → `S19` 紅；rooms 寫死 0 → `S22` 紅

## 4b. transport 在 internal 下打同源的 Route Handlers

對應 MODIFIED Requirement〈元件不知道自己連的是誰〉（`FE-O02-S02` 改寫）

- [x] 4b.1 `src/api/transport.ts`：`internal` → 同源 `/api/...`，拿掉 `AdapterNotImplementedError` 那條路（型別留著給 `FE-O02-S03`）
- [x] 4b.2 判準：`FE-O02-S02`（改寫版）；`FE-O02-S01`／`S03` 不變

## 5. 收尾

- [x] 5.1 `npm run typecheck`、`npm run lint`、`npm test` 全綠；`CONTRACT_TARGET=internal` 全綠
- [x] 5.2 `NEXT_PUBLIC_DATA_ADAPTER=internal` 起 dev，人才看板真的從本地資料庫開出來（截圖 `docs/evidence/fe-o03/`）
- [x] 5.3 封存（`archive/fe-o03-internal-backend`，下一個 PR）
