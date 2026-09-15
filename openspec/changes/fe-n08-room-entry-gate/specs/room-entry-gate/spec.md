# room-entry-gate Specification

## Purpose

房間門禁把走廊上的 Project Door 與既有的 Project Room 場景接成一條使用者走得完的路：
沒有票時，對著門按 E 會得到一個能用鍵盤操作的 DOM 密碼視窗；密碼被後端接受後，
系統用既有的 API operation 拿到 room token、存進既有的票儲存，再交給 `world-scenes` 進房。
這份能力同時約束錯誤回饋（不猜原因、不回顯後端字串）、焦點與世界命令鎖、重複送出、
密碼的生命週期、本地後端的等價行為，以及握手失敗後「重新輸入密碼」的使用者動作。
它不重做場景切換、連線、座位或成員授權。

## Applicability

權限：適用 —— `/enter` 要有已登入身分；401 不得偽裝成密碼錯誤。
併發：適用 —— 鍵盤重複的 E、連按送出、Modal 關閉與非同步回應、握手失敗的通知與 Modal 互相競爭。
持久資料相容性：適用 —— 本地 Route Handler 讀 `projects.password_hash`；密碼本身 MUST NOT 被前端持久化。
失敗路徑：適用 —— 密碼錯、房間進不了、未登入、網路／5xx、回應不合契約、握手被拒。
測試連線：單元與 jsdom 不連任何服務；契約測試打**本機起的**可拋棄後端（`FE-O05` 的兩個目標，
`guildhub` 目標只在自己起的 `GuildHub-backend` 上跑）；e2e 只打 `next start` 的 loopback，
REST 用 `page.route`、WebSocket 用 `routeWebSocket` 偽造 —— MUST NOT 連任何團隊共用位址。

## ADDED Requirements

### Requirement: 沒有票時，門前按 E 開的是這間房的 DOM 密碼視窗

已掛上正式門禁的世界裡，沒有該房間票的使用者對著 Project Door 按 E，系統 SHALL 開啟**屬於那間房**的
DOM 密碼視窗：`role="dialog"`、`aria-modal="true"`、可及名稱含那間房的標題；密碼欄位 MUST NOT 畫在 Canvas 裡。
一次按鍵（含鍵盤重複事件）SHALL 最多開一個視窗、送零次請求。
正式門禁掛上之後，「輸入密碼的功能還沒開放」那句預設說明 MUST NOT 出現。

> 拔掉什麼會紅：不掛 provider → S01 的視窗不出現、預設說明出現；provider 不帶 `projectId`／`title` → 名稱對不上那扇門。

#### Scenario: [FE-N08-S01] 對著門按 E，出現這間房的密碼視窗

- **GIVEN** 已登入、`sessionStorage` 沒有「晨光工作室」的票，提示正顯示著那扇門（`FE-W12-S15` 的真實路徑）
- **WHEN** 按一次 E，並再收到兩次鍵盤重複的 `keydown`
- **THEN** 頁面 SHALL 恰好有一個 `role="dialog"` 且 `aria-modal="true"` 的視窗，可及名稱含「晨光工作室」
- **AND** SHALL 沒有 `/enter` 請求、沒有新 socket、網址不變；SHALL 沒有「輸入密碼的功能還沒開放」
- **AND** Canvas SHALL 是同一個節點，Canvas 裡 SHALL 沒有輸入控制
- → 驗於：jsdom、e2e

### Requirement: 視窗開著就鎖住世界命令；Esc、關閉、Tab 照全站鍵盤規則

視窗開啟期間，系統 SHALL 持有世界命令鎖（`holdInputLock` 那把可合成的鎖）：焦點落在視窗裡**任何**控制上，
移動鍵與 E 都 MUST NOT 動到世界。焦點 SHALL 一開始就在密碼欄；Tab／Shift+Tab SHALL 留在視窗內。
不在送出中時，Esc 或關閉控制 SHALL 只關這一層視窗、清掉當次密碼、把焦點放回世界焦點錨（不是 `body`），
MUST NOT 觸發門或其他底層動作。關閉後這把鎖 SHALL 釋放；別的持有者還在時世界 SHALL 仍鎖著。
送出中（請求未完成）Esc 與關閉 SHALL 無效。

> 拔掉什麼會紅：視窗不持鎖 → S03（焦點在按鈕上按 W 世界會動）；關閉不清密碼 → S02 再開時欄位不空；
> 關閉時焦點丟到 `body` → S02；busy 時允許關閉 → S04。

#### Scenario: [FE-N08-S02] Esc 關閉、清密碼、焦點回世界錨；再按 E 是空白的

- **GIVEN** 視窗開著，密碼欄已輸入內容
- **WHEN** 按一次 Esc
- **THEN** 視窗 SHALL 關閉；`document.activeElement` SHALL 是世界焦點錨，MUST NOT 是 `body`
- **AND** 同一次 Esc SHALL 沒有觸發門、沒有導覽
- **AND WHEN** 再對同一扇門按 E
- **THEN** 視窗 SHALL 重新開啟，密碼欄 SHALL 是空的
- → 驗於：jsdom、e2e

#### Scenario: [FE-N08-S03] 焦點在按鈕上，世界還是鎖著；Tab 不出視窗；關閉只放自己的鎖

- **GIVEN** 視窗開著，焦點在「送出」按鈕上（不是輸入框）
- **WHEN** 按 W 與 E
- **THEN** 世界 SHALL 沒有移動、SHALL 沒有第二個視窗、沒有請求
- **AND WHEN** 焦點在視窗最後一個可聚焦控制上按 Tab
- **THEN** 焦點 SHALL 回到視窗第一個可聚焦控制
- **AND WHEN** 另有一個世界命令鎖的持有者，使用者用關閉控制關掉視窗
- **THEN** 視窗的鎖 SHALL 釋放，世界命令 SHALL 仍然鎖著
- → 驗於：jsdom

### Requirement: 送出走既有 operation 與表單慣例；密碼只活在這一次表單

視窗 SHALL 用全站的 `useForm`，資料存取 SHALL 只經 `src/api/operations.enterProject(projectId, { password })`；
元件 MUST NOT 出現 `fetch`。前端 MUST NOT 對密碼加長度或格式規則（後端沒有；空字串也照送）。
送出開始 SHALL 立即 busy、送出控制 disabled；請求未完成前的第二次送出 SHALL 被忽略；系統 MUST NOT 自動重送。
密碼 MUST NOT 寫進網址、`sessionStorage`、`localStorage`、票的儲存；失敗時 SHALL 留在欄位裡，成功或關閉時 SHALL 清掉。

> 拔掉什麼會紅：submit handler 不去重 → S04 呼叫兩次；把密碼放進 storage 或網址 → S05；
> 加 `.min(1)` → S04 的空字串那段（後端會回 403，前端不能先擋）。

#### Scenario: [FE-N08-S04] 送出中連按只送一次；空字串也送

- **GIVEN** 視窗開著，密碼欄是「abc」
- **WHEN** 按送出，`/enter` 尚未回應時再按送出與 Enter 各一次
- **THEN** `enterProject` SHALL 只被呼叫一次，參數是這扇門的 `projectId` 與 `{ password: 'abc' }`
- **AND** 送出控制 SHALL disabled；跑完所有排程中的計時器後 SHALL 沒有第二次呼叫
- **AND WHEN** 密碼欄清空後送出
- **THEN** `enterProject` SHALL 以 `{ password: '' }` 被呼叫（前端不擋，後端回 403 走 S08）
- → 驗於：jsdom

#### Scenario: [FE-N08-S05] 密碼不落地：整條流程的網址與 storage 都沒有它

- **GIVEN** 以一個唯一字串當密碼
- **WHEN** 依序：送出並收到 403、改字後送出成功、進房、按「回到 Guild Hall」
- **THEN** 在每一次 `pushState`／`replaceState` 寫入的網址、每個時點的 `location.href`、`localStorage`、`sessionStorage`
  裡都 MUST NOT 出現那個字串
- **AND** 403 之後欄位 SHALL 仍是那個字串；成功之後視窗 SHALL 關閉且欄位 SHALL 清空
- → 驗於：e2e（網址用 `FE-V01` e2e 的軌跡法，看整條，不看快照）

### Requirement: 成功先存票再進房；有票的人不再被問

`enterProject` 成功後，系統 SHALL 先以 `holdRoomToken(profileId, projectId, room_token)` 存票，**再**呼叫
`enterRoom(projectId, { title })`；視窗 MUST NOT 自己建 WebSocket、MUST NOT 寫網址；成功後視窗 SHALL 關閉。
同一身分、同一分頁已持有那間房的票時，門前按 E SHALL 直接走既有 `enterRoom`，MUST NOT 開視窗、MUST NOT 呼叫 `/enter`。

> 拔掉什麼會紅：先 `enterRoom` 再存票 → S06 沒有房間連線（`resolved.scene` 判成沒票）；
> 存票時鍵不含身分 → S13 換身分讀到別人的票；有票也開視窗 → S07。

#### Scenario: [FE-N08-S06] 密碼對了：票存起來、過場開始、房間連線帶著票、網址沒有票

- **GIVEN** 已登入為 P，沒有房間 R 的票
- **WHEN** 在 R 的視窗送出密碼，`/enter` 回 `200 { "room_token": "T" }`
- **THEN** `sessionStorage` 裡 P＋R 的鍵 SHALL 是 T；接著 SHALL 開始進入 R 的過場（覆蓋層出現）
- **AND** 新 socket 的位址 SHALL 含 `scene=room:R` 與 `token=T`；每一次寫入的網址 MUST NOT 含 T
- **AND** 視窗 SHALL 關閉
- → 驗於：jsdom（順序）、e2e（連線與網址）

#### Scenario: [FE-N08-S07] 有票的人回大廳再按 E，直接進、不問密碼

- **GIVEN** P 經 S06 進了 R，按「回到 Guild Hall」回到大廳
- **WHEN** 再走到 R 的門前按 E
- **THEN** SHALL 直接開始進入 R 的過場；SHALL 沒有視窗、沒有 `/enter` 請求
- → 驗於：e2e

### Requirement: 失敗回饋可恢復、不猜原因、不回顯後端字串

失敗的分類 SHALL 只看 `toUiError(cause).kind`（`FE-X03-S16`），元件不讀 HTTP status。
`permission-denied` SHALL 呈現為「密碼不對」：視窗留著、欄位保留、可改可重送。
`not-found` SHALL 呈現為「這間房目前進不了」，MUST NOT 宣稱是不存在、還沒成軍或已關閉。
`authentication-required` SHALL 用語彙表的那句（要先登入），MUST NOT 說成密碼錯。
其他種類（`server-error`、`network-unavailable`、`validation`、`contract-drift`、`unexpected`）SHALL 用語彙表的那句，欄位保留、可人工重試。
每一種失敗 SHALL 依 `form-conventions`：送出控制上方恰好一個 `role="alert"`、`tabIndex=-1` 並取得焦點。
後端的 `detail`、Zod 的路徑、例外訊息、票 MUST NOT 出現在 DOM。失敗時 MUST NOT 存票、MUST NOT 呼叫 `enterRoom`、MUST NOT 自動重送。

> 拔掉什麼會紅：把 `detail` 印出來 → S09（三種偽造的 detail 都不能出現）；403 與 404 用同一句 → S08／S09 的文案互相區分；
> 401 走「密碼不對」 → S10；失敗仍呼叫 `holdRoomToken` → S08。

#### Scenario: [FE-N08-S08] 403：密碼不對，留著讓人改

- **WHEN** `/enter` 回 `403 { "detail": "房間密碼錯誤" }`
- **THEN** 視窗 SHALL 還開著，密碼欄 SHALL 保留原值；送出控制之前 SHALL 恰好一個 `role="alert"`，焦點 SHALL 在它上面
- **AND** alert 的內容 SHALL 讓人知道是密碼不對；SHALL 沒有存票、沒有 `enterRoom`、沒有新 socket
- **AND WHEN** 改一個字再送出
- **THEN** SHALL 送出第二個請求（人發起的）
- → 驗於：jsdom、e2e

#### Scenario: [FE-N08-S09] 404：進不了，但不說是哪一種

- **WHEN** `/enter` 分別回 404，`detail` 偽造成「專案不存在」「房間尚未開啟」「已關閉」三種
- **THEN** 三次 SHALL 顯示同一句前端受控的「進不了」；三個 detail 字串都 MUST NOT 出現在 DOM
- **AND** 那句 MUST NOT 含「不存在」「關閉」「成軍」；SHALL 沒有存票、沒有過場
- → 驗於：jsdom

#### Scenario: [FE-N08-S10] 401 與服務失敗不偽裝成密碼錯

- **WHEN** `/enter` 回 401
- **THEN** alert SHALL 是語彙表 `authentication-required` 那句，MUST NOT 含「密碼」
- **AND WHEN** `/enter` 分別：網路失敗、回 500 `text/plain`、回 422、回 `200 {}`（不合 `EnterOut`）
- **THEN** 每一次 SHALL 顯示語彙表對應的那句、欄位保留、送出控制恢復可按；`Internal Server Error`、Zod 路徑、例外字串 MUST NOT 出現在 DOM
- **AND** 全部 SHALL 沒有存票、沒有 `enterRoom`
- → 驗於：jsdom

### Requirement: 握手失敗後，使用者可以選擇重新輸入密碼；系統仍不丟票

`world-scenes` 的失敗通知（那句話、留存、取代、系統不重試、系統不丟票）全部維持。通知 SHALL 另提供一個
「重新輸入密碼」動作。只有使用者啟動它時，系統 SHALL：丟棄**這個身分**對**那間房**的票 → 關閉通知 → 開啟那間房的密碼視窗（欄位空白）。
沒有啟動時，票 SHALL 還在，再走到門前按 E SHALL 用同一張票再試（`FE-V01-S07`）。

> 拔掉什麼會紅：系統在失敗時自動丟票 → S11 第一段（票不在了）；動作不丟票 → S11 第二段（視窗開了但票還在，
> 之後送出成功會覆寫 —— 判準是 `sessionStorage` 那個鍵在啟動後為空）；動作不關通知 → S11 alert 還在。

#### Scenario: [FE-N08-S11] 被拒之後：不按就用舊票再試；按了才丟票開視窗

- **GIVEN** P 持有 R 的票 T，進入 R 的新 socket 在 `open` 前就關（`code=1006`）
- **THEN** SHALL 回到大廳並顯示通知（`FE-V01-S07`）；`sessionStorage` P＋R 的鍵 SHALL 仍是 T；通知裡 SHALL 有「重新輸入密碼」的控制
- **AND WHEN** 不按它，再走到 R 的門前按 E
- **THEN** 新 socket 的位址 SHALL 仍帶 `token=T`
- **AND WHEN** 第二次也被拒，使用者啟動「重新輸入密碼」
- **THEN** P＋R 的鍵 SHALL 被移除；SHALL 沒有 `role="alert"`；SHALL 出現 R 的密碼視窗且欄位空白
- **AND** 在啟動之前，系統 MUST NOT 呼叫 `/enter`、MUST NOT 自己移除那個鍵
- → 驗於：jsdom、e2e

### Requirement: 本地後端的 enter 與真後端可觀察行為相同，票本地替身收得下

`local` 目標 SHALL 提供 `POST /api/projects/{project_id}/enter`：body 合 `EnterIn`，成功回 `EnterOut`。
判斷順序 SHALL 照真後端：session 無效 → 401；`password_hash IS NULL`（專案不存在或還沒成軍）→ 404；
密碼不合 → 403；否則簽票。錯誤形狀 SHALL 走 `internal-backend` 既有的管線（`{ "detail": … }`）。
簽出的票 SHALL 被本地即時層替身對 `room:<project_id>` 的握手接受；對另一間房 MUST NOT 被接受。
本地 handler MUST NOT 讀座位、MUST NOT 因座位滿而拒絕。
`enterProject` 的契約測試 SHALL 對 `local` 與 `guildhub` 兩個目標跑同一份。

> 拔掉什麼會紅：handler 不驗密碼 → S12 的 403 那列；handler 與替身用不同的簽章 → S12 握手那段；
> 改路徑或 body 欄位名 → S13 兩個目標其中一個紅。

#### Scenario: [FE-N08-S12] 本地 enter 的矩陣與票的效力

- **WHEN** 對本地後端依序：未登入、專案不存在、`recruiting`（沒有 `password_hash`）、`active` 密碼錯、`active` 密碼對
- **THEN** SHALL 分別得到 401、404、404、403、`200` 且 body 合 `EnterOut`
- **AND** 用那張票對本地替身開 `scene=room:<同一個 id>` 的 socket SHALL 收到 `hello`；對 `scene=room:<另一個 uuid>` SHALL 被拒絕握手
- **AND** 座位的狀態 MUST NOT 影響以上任何結果
- → 驗於：單元（契約測試，本機起的可拋棄後端＋替身）

#### Scenario: [FE-N08-S13] 兩個目標同一份契約；換身分讀不到別人的票

- **WHEN** 同一份 `enterProject` 契約測試對 `local` 與 `guildhub` 目標各跑一次
- **THEN** 兩者 SHALL 都送 `POST /api/projects/{project_id}/enter` 帶 `EnterIn`；成功 body SHALL 都通過 `EnterOut`；401／403／404 SHALL 翻譯成同一個 `kind`
- **AND WHEN** P 經視窗拿到 R 的票後，同一分頁改以 Q 的身分載入 `/world?room=R`
- **THEN** Q 的第一條連線 MUST NOT 帶 P 的票；場景 SHALL 依 `FE-V01-S14` 回到大廳
- → 驗於：單元（契約）、e2e（換身分）
