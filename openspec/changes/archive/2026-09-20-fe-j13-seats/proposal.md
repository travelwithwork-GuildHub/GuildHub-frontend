## Why

進了房間之後，房間裡什麼都不能做：八張桌子畫出來了（`FE-W16`）、工位的投影錨點也在（`FE-W16-S06`，明寫「給 `FE-J13` 用」），
但後端的座位 API（`GET`／`POST /api/projects/{id}/seats`）前端一個都沒接 —— 「進房坐位」是 demo 閉環的倒數第二步
（`docs/WBS.md`〈demo 之前的核准順序〉#9），沒有它，成軍與門只是走進一間空房。

後端（`FE-O08` 量過、`app/api/seats.py`）：座位是 `(project_id, seat_index)` 一格一人、`(project_id, user_id)` 一人一格，
兩種衝突都是 409、**只靠 `detail` 文字分**（「這個座位已經有人了」／「你已經在這個房間有座位了」）；`seat_index ≥ seat_count` 是 400（訊息含座位數）；
沒票是 403「尚未通過房間密碼驗證」；**沒有釋放座位的端點**（WBS v0.2 砍除）；結案清掉全部座位但舊票仍能坐（anomaly `close-keeps-token`）；
即時協定沒有座位事件，別人坐了只能重取。`SeatOut` 只有 `user_id`，名字要另外查。

## What Changes

- 新 capability **`room-seats`**：房間裡每個工位掛一個**座位標籤**（在 `FE-W16` 的投影錨點上）：
  - 進房後 `GET .../seats` ＋ `GET /api/projects/{id}`（要 `seat_count` 與 `status`）；`seat_count` 以內的工位各一個標籤：有人 → 名字（`GET /api/profiles/{user_id}`，查不到就標「有人」）；沒人 → 「空位」＋「入座」；`seat_count` 以外的工位沒有標籤。
  - **一鍵入座**：按「入座」→ `POST .../seats {seat_index, desk_template: 0}` → 201 → 那一格變成我的名字；送出中全部「入座」停用、連按只送一次；我已經有座位之後其他空位不再有「入座」（一人一格）。
  - 失敗可恢復、不猜原因：409「這個座位已經有人了」→ 重取座位、那一格變成占用者、有一則可辨識的回饋；409「你已經在這個房間有座位了」→ 重取、標出我的座位；403／401（票失效、未登入）→ 說要回大廳重新進房，不是密碼錯；400／500／斷線 → 回饋＋「入座」可再按。文案不進契約，但 409 的兩種**要分得開**（後端只給文字，前端以文字分 —— `FE-O08` 的 anomaly，列給後端的清單 1.4 要 `code`；來了就換）。
  - **重取**：進房、自己坐下之後、409 之後各一次；房間裡每 30 秒輪詢一次（頁籤不可見時停，沿用 `useRooms` 的規則）；離開房間停止、晚到的回應作廢。
  - `closed` 的房間（舊票仍能坐，anomaly）：**不給「入座」**（標籤仍顯示誰坐過）。
  - 標籤跟著錨點投影走：錨點在畫面外時標籤一起 hidden；標籤是 DOM（在 `<Canvas>` 外面），不鎖世界、不進互動系統（桌子仍不是互動物件，`FE-W16-S07` 不變）。
- **`project-room-layout`**（MODIFIED〈每個工位有一個投影到螢幕的 DOM 錨點〉）：錨點 SHALL 可以容納座位標籤；有內容時 SHALL NOT `aria-hidden`、SHALL 可以接指標事件（今天是 0×0、`aria-hidden`、`pointer-events-none`）。中心對齊、hidden 規則、只在 `room` 都不變。
- **`internal-backend`**（ADDED 一條）：替身補 `GET`／`POST /api/projects/{id}/seats`（照真後端：票用 `enter` 發的房間 cookie 驗、409 兩種文字、400 超出座位數、404、401；`close` 清座位既有）。契約套件新增 `seats.contract.ts`，對 `internal` 與 `guildhub` 各跑一次。
- 真瀏覽器 e2e：兩個人各自進同一間房（密碼）→ A 坐 0 號 → B 看到 A 的名字、按 A 那一格的「入座」得到「已經有人了」的回饋、坐 1 號成功 → A 重新整理仍在 0 號。

## Non-goals

- **不做釋放座位、換座位**（後端沒有端點）；不做「坐下之後角色走到桌邊」（角色位置與座位無關，`FE-W14`／之後再說）。
- **不做座位的即時推播**（協定沒有座位事件）：30 秒輪詢＋自己動作後重取。
- **不修 `close-keeps-token`**（後端 anomaly）：前端不給入口。
- **不做 `desk_template` 的選擇**（送 0；桌子外觀是 `FE-W16` 的模板）。
- 不做座位上限以外的「房間滿了」提示（座位滿即房間滿，標籤全部有人就是滿）。

## Capabilities

### New Capabilities
- `room-seats`：房間裡的座位標籤、一鍵入座、409／403／400 的回饋、重取與輪詢、closed 不給入口。

### Modified Capabilities
- `project-room-layout`：〈每個工位有一個投影到螢幕的 DOM 錨點〉—— 錨點可容納座位標籤（有內容時不 `aria-hidden`、接指標事件）。
- `internal-backend`：ADDED〈座位：替身照真後端〉—— `GET`／`POST /api/projects/{id}/seats`。

## Impact

- 新 `src/world/seats/SeatMarkers.tsx`（標籤：名字／空位／入座／回饋）、`src/world/seats/useSeats.ts`（載入、輪詢、claim、重取、作廢）、`src/world/seats/seatRules.ts`（409 文字分類、可不可以入座的推導）；`SeatAnchors.tsx` 接受 children（每個錨點一個插槽）
- `src/world/WorldCanvas.tsx`（房間裡把標籤掛進錨點）
- 替身：新 `src/server/seats.ts`、`src/app/api/projects/[project_id]/seats/route.ts`；新 `tests/contract/rest/seats.contract.ts`
- 判準：新 `tests/room-seats.test.tsx`、`tests/seat-rules.test.ts`；`tests/seat-anchors*.test.tsx` 改 S06 的 aria-hidden 半邊；e2e `tests/e2e/room-seats.mjs`
- 效能：標籤是 DOM、跟著既有的投影器走（每幀零新工作 —— 位置寫在錨點上，標籤是它的子節點）；輪詢 30 秒一次 `GET seats`（房間裡才有）；名字查詢每個占用者一次、快取在房間期間；預期 world chunk +2 KB gz 以內；量前後差貼 PR
