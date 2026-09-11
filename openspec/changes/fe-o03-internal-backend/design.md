# `FE-O03` 設計：難逆轉的決定與代價

## D1｜一個 `handle()` 包裝，錯誤是拋出來的型別

```
src/server/http/handle.ts      handle({ auth: 'required' | 'none', body?: ZodType, query?: ZodType }, fn)
src/server/http/errors.ts      HttpError(status, detail: string) ；驗證失敗由 handle 自己轉成 422 陣列
src/server/session.ts          sign(id) / verify(cookie) → id | null ；cookie 名 `session`
src/app/api/<path>/route.ts    export const GET = handle(…)
```

`fn` 拿到 `{ me, body, query, params }`，回 JSON 值（或 `{ status, body }`）。拋 `HttpError` → 對映；拋 `pg` 的 check／unique 錯誤
（`code` 23514／23505）→ `500 text/plain`；其他 → 同 500，**並在伺服器 log 印 stack**（真後端也印在 uvicorn）。

為什麼 DB 錯誤是 500 不是 422：真後端就是這樣（整合指南 §8），而前端 `FE-X03` 已經把 500 翻成「伺服器錯誤」，
`limits.ts` 在送出前擋。本地版比真後端「好用」（回 422）就是在製造假象 —— WBS 的 Alarm。

## D2｜session：`<id>.<hmac>`，不是 Starlette 的格式

真後端的 cookie 是 Starlette `SessionMiddleware` 的簽章 JSON。本地版不需要跟它**互通**（同一個瀏覽器不會同時登入兩邊），
需要的是**同樣的可觀察語意**：HttpOnly、篡改無效、指向不存在的名片無效。HMAC-SHA256 over id 最小。
secret：`INTERNAL_SESSION_SECRET`，`next dev` 缺席用固定值 `dev-only-secret`（開發機的 cookie 重啟仍有效），`next build` 缺席失敗。
WS 替身讀同一個 cookie（cookie 不分 port），所以 secret 也給它。

## D3｜422 的形狀：先拿真後端的 golden cases

Pydantic 的 `loc`／`type`／`msg` 跟 Zod 的 `path`／`code`／`message` 不是一對一。不假設，先實測真後端這幾種：
缺欄、顯式 `null`、型別錯（`page=abc`）、login 給兩組（`model_validator` 的錯誤 `loc` 是 `["body"]`）、負數。
結果存成 `tests/contract/golden/422.json`，本地版的 mapper 對著它寫，`FE-O05` 的 guildhub 那一輪再驗一次。
**只保證 `loc`、`type`、`msg` 三個鍵的存在與 `loc` 的第一段**；`msg` 的字句不逐字對（Pydantic 的英文訊息不是契約）。

## D4｜密碼雜湊格式跟真後端一樣

`app/passwords.py` 是 `scrypt$<salt b64>$<hash b64>`。本地版用 Node `crypto.scrypt` 同參數，
所以 `1xx` seed 裡的測試帳號在真後端也登得進（只要把同一份 `.sql` 套過去）。參數（N/r/p/keylen）從 `passwords.py` 抄，並在檔頭註明。

## D5｜`rooms` 的 `online_count`：替身開一個 loopback 的 HTTP 查詢口

REST handler 跟 WS 替身是兩個程序。替身在 `GET /online?scene=<scene>` 回 `{"count": n}`；handler 打它（loopback、100 ms timeout），
連不上或逾時就 0。真後端是同一個程序的函式呼叫 —— 這裡的差別是拓撲，可觀察的形狀相同。
判準要能讓人**真的在房間裡**：替身接受 `room:<uuid>` 的條件是 `token = HMAC(secret, scene)`，今天只有測試會算它；
`FE-W16` 把 `enter` 端點接上之後就是同一把（`S22`、`S23`，審查抓到「不做 `/online` 也全綠」）。

## D6｜WS 替身是 `.ts`，重用 `src/api/contract/ws.ts`

Node 24 預設就會去掉 `.ts` 的型別（type stripping），`ws.ts` 只用相對路徑 import（`./limits`）、Zod 是純 JS ——
`node scripts/realtime-stub.ts` 直接跑。**不複製一份 schema**；替身裡不得出現 `z.object`。

## 待答問題

1. **`next start` 在契約測試裡的啟動時間。** 實測 build 一次多久；CI 已經有 `next build`，契約測試可以接在它後面用同一份 `.next`。
2. **Pydantic 422 的 golden cases**（D3）：要先起真後端量。

## 這一份怎麼驗

- `S01`～`S17`：`tests/contract/`（`FE-O05` 的 harness 第一版跟骨架同一個 PR）：`CONTRACT_TARGET=internal`，
  harness 起 `next start`（隨機 port）、`db:reset` 測試庫、cookie jar、raw request。
- `S18`～`S23`：`tests/contract/ws/`，harness 起 `realtime-stub`（隨機 port）；`S17` 在替身**沒起**的情況下跑（harness 提供 `withoutStub()`）。
- **不連任何團隊共用的位址。**
- 驗收不是全綠：handler 自己擋長度回 422 → `S02` 紅；cookie 不驗簽 → `S07` 紅；login 允許兩組 → `S10` 紅；
  過期專案沒過濾 → `S16` 紅；替身收到不合法訊息回 `err` → `S20` 紅；靜止時送空 `pos` → `S18` 紅。
