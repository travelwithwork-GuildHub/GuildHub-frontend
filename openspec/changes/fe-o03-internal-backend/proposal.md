# `FE-O03` 本地後端

## Why

`NEXT_PUBLIC_DATA_ADAPTER=internal` 今天每個操作都拋 `AdapterNotImplementedError`（`FE-O02-S02` 刻意如此）。
W6–W12 的產品能力真後端沒有對應端點；`CLAUDE.md` 的答案是「前端有自己的後端：Route Handlers ＋ 可拋棄的資料庫，
功能先做完，之後再銜接」。這一列是那個後端的**骨架**：一條大家共用的請求管線（session → 驗證 → 操作 → 回應／錯誤對映），
以及當期用得到的操作。之後每個能力（Open Role W6、invitation W8⋯⋯）只加自己的 handler，點數算在那些項目。

不做會怎樣：`FE-O05` 的契約測試在 CI 裡沒有 `internal` 目標；W6 起的每個能力各自發明一套錯誤格式與 session 讀法。

## What Changes

- **請求管線**（`src/server/http/`）：每個 handler 走同一條 —— 讀 session、Zod 解析 body／query、呼叫操作、把結果或錯誤對映成回應。
  錯誤形狀**刻意複製真後端**：未登入 `401 {"detail":"未登入"}`、不存在 `404 {"detail":"…"}`、驗證失敗 `422 {"detail":[…Pydantic 形狀…]}`、
  **資料庫 check 違反 → `500 text/plain` `Internal Server Error`**（真後端長度只寫在 DB，應用層不重複檢查；本地版**也不擋**）。
- **session**：HttpOnly cookie，內容是 HMAC 簽章的 profile id（secret `INTERNAL_SESSION_SECRET`）；篡改、指向不存在名片 → 視為未登入。
- **W2 的操作**：`POST /api/login`（三模式）、`GET /api/me`、`PATCH /api/profiles/me`、`GET /api/profiles?page=`、`GET /api/profiles/{id}`、
  `GET /api/projects?status=&page=`、`GET /api/projects/{id}`、`GET /api/rooms`。
- **即時層替身**：獨立程序 `scripts/realtime-stub.ts`（Node 24 原生跑 `.ts`；`ws` 套件，另一個 port），訊息形狀**重用 `src/api/contract/ws.ts`**，
  怪癖照 `protocol.py`：靜止不送 `pos`、不合協定的訊息靜默丟棄、狀態文字超過 12 字靜默丟棄、自己的 `move` 廣播回自己、握手失敗 close 1008 不給 `err`。

## ⚠️ 討論談定的取捨

- **cookie 要簽章**（一位審查者主張 base64 就好）：裸 id 讓任何人改 cookie 就能冒充別人，session 語意跟真後端根本不同。
- **不模擬「沒帶 `credentials: 'include'` 就 401」**：本地 Route Handlers 跟頁面同源，瀏覽器一定帶 cookie，伺服器分不出呼叫端寫沒寫 —— 在同源下**不可能實作**。
  那條怪癖改在 `guildhub` transport 的單元測試斷言 `credentials === 'include'`（`FE-O05`）。
- **不加 `register`**：真後端有，但前端還沒有任何流程用它（`FE-A02` 硬阻塞在 `BE-G28`）。等那一列。
- **WS 替身是獨立程序**：Next 的 Route Handler 在 `next dev` 下開 WebSocket 不可靠。真後端本來就是另一個 port，這樣反而更像。
- **422 的 detail 形狀先拿真後端的 golden cases**（缺欄、顯式 null、型別錯、login 給兩組）再寫 mapper，不假設 Zod 的 `path/code/message` 自然等價（design `D3`）。

## ⚠️ 不做什麼

- **SHALL NOT 做 create／form-team／close／enter／seats／messages。** 那些是 W6+ 各能力的 handler；本地版今天沒有那些路由（Next 回它自己的 404）。
- **SHALL NOT 做 `register`。**
- **SHALL NOT 讓 Route Handler 比真後端「好用」**：不擋長度（讓 DB 500）、不給 total、不回 `has_more`。
- **SHALL NOT 在 WS 替身裡做房間 token 驗證以外的權限**（`scene=room:{id}` 的 token 在 `FE-W16`，W4）。
- **SHALL NOT 做契約測試的 harness**（`tests/contract/harness.ts`、`client.ts`、`vitest.contract.mts`、wrapper 都是 `FE-O05` 的，**而且要先做**）。
  這一列只加 `tests/contract/rest/*.contract.ts` 與 `tests/contract/ws/*.contract.ts` 裡**自己端點的案例**。順序：`FE-O04` → `FE-O05` 的 harness 片 → 這一列 → `FE-O05` 的邊界／golden／CI 片。
