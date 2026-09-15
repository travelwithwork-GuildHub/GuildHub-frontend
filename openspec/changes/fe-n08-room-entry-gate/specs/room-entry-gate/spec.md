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

> 拔掉什麼會紅：不掛 provider → S01 的視窗不出現、預設說明出現；provider 不帶 `title` → 可及名稱對不上那扇門；不帶 `projectId` → S04 的送出參數；
> 第二次 `needsToken` 重建視窗或重置表單 → S01 的「仍是 ab」；把輸入畫進 Canvas → S01 的「Canvas 裡沒有輸入控制」（跟「同一節點」是兩件事）。

#### Scenario: [FE-N08-S01] 對著門按 E，出現這間房的密碼視窗

- **GIVEN** 已登入、`sessionStorage` 沒有「晨光工作室」的票，提示正顯示著那扇門（`FE-W12-S15` 的真實路徑）
- **WHEN** 按一次 E
- **THEN** 頁面 SHALL 恰好有一個 `role="dialog"` 且 `aria-modal="true"` 的視窗，可及名稱含「晨光工作室」
- **AND** SHALL 沒有 `/enter` 請求、沒有新 socket、網址不變；SHALL 沒有「輸入密碼的功能還沒開放」
- **AND WHEN** 視窗開著、欄位已輸入「ab」，在**另一個 frame** 再收到一次 `needsToken`（同一扇門；模擬按住 E 的重複事件穿過 `EntryGate` 的去重，或第二次按鍵）
- **THEN** 頁面仍 SHALL 恰好一個視窗，欄位 SHALL 仍是「ab」（沒有重開、沒有重置）
- **AND** Canvas SHALL 是同一個節點，Canvas 裡 SHALL 沒有輸入控制
- → 驗於：jsdom、e2e

### Requirement: 視窗開著就鎖住世界命令；Esc、關閉、Tab 照全站鍵盤規則

視窗開啟期間，系統 SHALL 持有世界命令鎖（`holdInputLock` 那把可合成的鎖）：焦點落在視窗裡**任何**控制上，
移動鍵與 E 都 MUST NOT 動到世界。焦點 SHALL 一開始就在密碼欄；Tab／Shift+Tab SHALL 留在視窗內。
Esc 或關閉控制 SHALL 只關這一層視窗、清掉當次密碼、把焦點放回世界焦點錨（不是 `body`），
MUST NOT 觸發門或其他底層動作 —— **送出中也可以關**（人不能被一個卡住的請求鎖在視窗裡）；
關掉之後那個請求的結果 SHALL 被丟棄：不存票、不 `enterRoom`、不重開視窗、不顯示錯誤。
關閉後這把鎖 SHALL 釋放；別的持有者還在時世界 SHALL 仍鎖著。

> 拔掉什麼會紅：視窗不持鎖 → S03（焦點在按鈕上按 W 世界會動）；關閉不清密碼 → S02 再開時欄位不空；
> 關閉時焦點丟到 `body` → S02；busy 時 Esc 無效或晚到的成功仍進房 → S04。

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
- **THEN** 世界命令 SHALL 仍然鎖著（另一個持有者還在）
- **AND WHEN** 那個持有者也釋放
- **THEN** 世界命令 SHALL 恢復（按 W 會動）—— 視窗沒有把自己的鎖漏在那裡
- → 驗於：jsdom；e2e（焦點在視窗的「送出」按鈕上按 W 與 E：角色相對門標籤的位置不變、沒有第二個視窗、沒有請求；關閉後按 W 會動）

### Requirement: 送出走既有 operation 與表單慣例；密碼只活在這一次表單

視窗 SHALL 用全站的 `useForm`，資料存取 SHALL 只經 `src/api/operations.enterProject(projectId, { password })`；
元件 MUST NOT 出現 `fetch`。前端 MUST NOT 對密碼加長度或格式規則（後端沒有；空字串也照送）。
送出開始 SHALL 立即 busy、送出控制 disabled；請求未完成前的第二次送出 SHALL 被忽略；系統 MUST NOT 自動重送。
密碼 MUST NOT 寫進網址、`sessionStorage`、`localStorage`、票的儲存；失敗時 SHALL 留在欄位裡，成功或關閉時 SHALL 清掉。

> 拔掉什麼會紅：submit handler 不去重 → S04 呼叫兩次；把密碼放進 storage 或網址 → S05；重開視窗保留上次密碼（不管實作是清欄位還是重掛）→ S05 的「同一扇門再開是空的」；
> 加 `.min(1)` → S04 的空字串那段（後端會回 403，前端不能先擋）。

#### Scenario: [FE-N08-S04] 送出中連按只送一次；送出中按 Esc 關得掉、晚到的成功被丟棄；空字串也送

- **GIVEN** 視窗開著，密碼欄是「abc」
- **WHEN** 按送出，`/enter` 尚未回應時再按送出與 Enter 各一次
- **THEN** `enterProject` SHALL 只被呼叫一次，參數是這扇門的 `projectId` 與 `{ password: 'abc' }`
- **AND** 送出控制 SHALL disabled；跑完所有排程中的計時器後 SHALL 沒有第二次呼叫
- **AND WHEN** 請求仍未回應時按 Esc
- **THEN** 視窗 SHALL 關閉、焦點 SHALL 回世界焦點錨、世界命令鎖 SHALL 釋放
- **AND WHEN** 那個請求接著回 `200 { "room_token": "T" }`
- **THEN** `sessionStorage` SHALL 沒有 T、SHALL 沒有 `enterRoom`、視窗 SHALL 仍關著、SHALL 沒有 `role="alert"`
- **AND WHEN** 再開視窗，密碼欄清空後送出
- **THEN** `enterProject` SHALL 以 `{ password: '' }` 被呼叫（前端不擋，後端回 403 走 S08）
- → 驗於：jsdom

#### Scenario: [FE-N08-S05] 密碼不落地：整條流程的網址與 storage 都沒有它

- **GIVEN** 兩個唯一字串 W（會被拒的）與 C（會成功的）
- **WHEN** 依序：以 W 送出並收到 403、改成 C 送出成功、進房、按「回到 Guild Hall」
- **THEN** 在每一次 `pushState`／`replaceState` 寫入的網址、每個時點的 `location.href`、`localStorage`、`sessionStorage`
  裡都 MUST NOT 出現 W 或 C
- **AND** 403 之後欄位 SHALL 仍是 W；成功之後視窗 SHALL 關閉
- **AND WHEN** 回到大廳後，測試移除 P＋R 的票、再對**同一扇** R 的門按 E
- **THEN** 開出來的視窗欄位 SHALL 是空的（同一扇門、同一個表單身分 —— 換門建新表單幫不上忙；成功分支不清就紅）
- **AND WHEN** 再對另一扇沒票的門按 E
- **THEN** 欄位同樣 SHALL 是空的
- → 驗於：e2e（網址用 `FE-V01` e2e 的軌跡法，看整條，不看快照）

### Requirement: 成功先存票再進房；票存不進去就不算成功；有票的人不再被問

`enterProject` 成功後，系統 SHALL 先以 `holdRoomToken(profileId, projectId, room_token)` 存票，並 SHALL 以 `heldRoomToken(profileId, projectId)`
讀回、**嚴格等於這一次回傳的 `room_token`** 才算存成功（`sessionStorage` 不可用時 `roomTokens.ts` 寫不進去也不拋；舊票殘留時讀回的是舊的），
**再**呼叫 `enterRoom(projectId, { title })`；「先存後進」是本能力定下的順序義務，用呼叫順序驗。
視窗 MUST NOT 自己建 WebSocket、MUST NOT 寫網址；成功後視窗 SHALL 關閉。
讀回不等於本次的票時 SHALL 視同失敗；`room_token` 是空字串時 SHALL 視同失敗（獨立的檢查 —— 空字串存得進去也讀得回來，比對抓不到它）：MUST NOT 呼叫 `enterRoom`、視窗 SHALL 留著、
SHALL 顯示一則受控的 `role="alert"`（說這個瀏覽器存不了通行證，不說是密碼錯）—— 否則使用者剛輸對密碼就被判成「沒票」留在大廳，或拿舊票去撞握手。
每一輪送出 SHALL 有自己的代號；結果 SHALL 只在「這一輪還是現行的那一輪」時被採用。下列任一件事發生就換代號、舊的一輪作廢（不存票、不進房、不顯示）：
視窗關閉（**即使之後重開同一間房**，舊回應也不採用）、目標房間換了、身分改變（換人、登出；**回應到達時的身分跟送出時不同**——中間換了又換回來也算作廢，
因為代號已經換過）。身分改變**不**關視窗（訪客本來就能開視窗、送出會拿到 401，D2），只是那一輪作廢。
換代號的同時，舊的一輪 SHALL 立刻失去對視窗的控制：busy 解除、送出控制可按、欄位與 alert 維持現況；新的一輪可以馬上送出；
舊回應晚到 MUST NOT 解除、覆蓋或清掉新一輪的 busy、欄位、alert。
同一身分、同一分頁已持有那間房的票時，門前按 E SHALL 直接走既有 `enterRoom`，MUST NOT 開視窗、MUST NOT 呼叫 `/enter`。

> 拔掉什麼會紅：反轉兩個呼叫的順序 → S06 的順序斷言；存票時鍵不含身分 → S13 換身分讀到別人的票；有票也開視窗 → S07；
> 存票不讀回或只檢查非 null → S14 的「舊票殘留」那段仍呼叫 `enterRoom`；只比「現在開著、同房、同人」不比代號 → S15 的「關了重開同一間房」；身分改變不換代號 → S15 的 P→Q→P；
> 換代號不解除舊輪的 busy → S15 的「送出控制立刻可按」；舊回應晚到清掉新輪的 busy → S15 的「仍是 busy」。

#### Scenario: [FE-N08-S06] 密碼對了：票存起來、過場開始、房間連線帶著票、網址沒有票

- **GIVEN** 已登入為 P，沒有房間 R 的票
- **WHEN** 在 R 的視窗送出密碼，`/enter` 回 `200 { "room_token": "T" }`
- **THEN** `holdRoomToken(P, R, "T")` SHALL 在 `enterRoom(R, …)` 之前被呼叫（順序 spy）；`sessionStorage` 裡 P＋R 的鍵 SHALL 是 T；接著 SHALL 開始進入 R 的過場（覆蓋層出現）
- **AND** 新 socket 的位址 SHALL 含 `scene=room:R` 與 `token=T`；每一次寫入的網址 MUST NOT 含 T
- **AND** 視窗 SHALL 關閉
- → 驗於：jsdom（順序）、e2e（連線與網址）

#### Scenario: [FE-N08-S14] 票存不進去或讀回不是這次的票：不進房、視窗留著、說的不是密碼錯

- **WHEN** `/enter` 回 `200 { "room_token": "T" }`，而 `sessionStorage` 分別是：`setItem` 拋；`setItem` 靜默沒寫、`getItem` 回 `null`；
  原本已有舊票 `OLD`、`setItem` 失敗、`getItem` 仍回 `OLD`；`setItem` 成功但 `getItem` 拋
- **THEN** 四種都 SHALL 沒有 `enterRoom`、沒有新 socket、網址不變；視窗 SHALL 還開著
- **AND** 送出控制之前 SHALL 恰好一個 `role="alert"`，內容 MUST NOT 含「密碼」；T MUST NOT 出現在 DOM
- **AND WHEN** `/enter` 回 `200 { "room_token": "" }`
- **THEN** SHALL 視同失敗（同上），MUST NOT 把空字串存成票
- → 驗於：jsdom（全部）、e2e（`setItem` 拋那一種：init script 讓 `sessionStorage.setItem` 拋 → 視窗留著、alert 出現、沒有房間連線）

#### Scenario: [FE-N08-S15] 送出中換了房間或身分：晚到的結果作廢

- **GIVEN** 對房間 A 的 `/enter` 尚未回應
- **WHEN** 按 Esc 關閉，再對房間 B 的門按 E 開視窗，接著 A 的請求回 `200 { "room_token": "TA" }`
- **THEN** `sessionStorage` 裡 SHALL 沒有 A 也沒有 B 的票；SHALL 沒有 `enterRoom`；B 的視窗 SHALL 還開著、欄位空白、沒有 alert
- **AND WHEN** 對 B 送出、尚未回應時按 Esc 關閉，**再對同一扇 B 的門按 E 重開**（現在：開著、同房、同人），接著剛才那個請求回 `200 { "room_token": "TB0" }`
- **THEN** SHALL 沒有存票、沒有 `enterRoom`、沒有 alert；重開的視窗 SHALL 還開著、欄位空白（只比「開著、同房、同人」會錯採 —— 要比代號）
- **AND WHEN** 以 P 的身分對 B 送出、尚未回應時身分變成 Q（視窗**不**關、不重掛）
- **THEN** 送出控制 SHALL 立刻可按（busy 解除）、欄位內容不變
- **AND WHEN** Q 立刻送出（第二個請求 pending），接著 P 的舊請求回 `200 { "room_token": "TB" }`
- **THEN** SHALL 沒有存票（P＋B、Q＋B 都沒有 TB）、沒有 `enterRoom`、沒有 alert；視窗 SHALL 還開著、SHALL 仍是 busy（Q 那一輪還在等）
- **AND WHEN** Q 的請求回 403
- **THEN** SHALL 出現 alert（Q 那一輪的結果被採用）
- **AND WHEN** 以 P 送出、身分變成 Q 又變回 P、接著回 `200 { "room_token": "TB1" }`
- **THEN** 同樣不採用（代號換過了）
- **AND WHEN** 再以 Q 送出、尚未回應時登出成訪客，接著回 `200 { "room_token": "TB2" }`
- **THEN** 同樣沒有存票、沒有 `enterRoom`；視窗 SHALL 還開著
- → 驗於：jsdom（全部）、e2e（第一段：`page.route` 延遲回應、Esc、重開同一扇門、延遲的 200 到達 → 沒有房間連線、視窗還開著且空白）

#### Scenario: [FE-N08-S07] 有票的人回大廳再按 E，直接進、不問密碼

- **GIVEN** P 經 S06 進了 R，按「回到 Guild Hall」回到大廳
- **WHEN** 再走到 R 的門前按 E
- **THEN** SHALL 直接開始進入 R 的過場；SHALL 沒有視窗、沒有 `/enter` 請求
- → 驗於：e2e

### Requirement: 失敗回饋可恢復、不猜原因、不回顯後端字串

失敗的分類 SHALL 只看 `toUiError(cause).kind`（`FE-X03-S16`），元件不讀 HTTP status。
`permission-denied` SHALL 讓人知道是**密碼沒被接受**（這個端點唯一的 403 來源）：視窗留著、欄位保留、可改可重送。
`not-found` SHALL 讓人知道**這間房目前進不了**，MUST NOT 宣稱是不存在、還沒成軍或已關閉，也 MUST NOT 說成密碼錯。
`authentication-required` SHALL 用語彙表 `error-vocabulary` 對應的那句（要先登入），MUST NOT 說成密碼錯。
文案本身不在規格裡（`config.yaml`：不記錄非契約 UI 文案）；規格守的是分類對得上、不猜原因、不回顯後端字串。
其他種類（`server-error`、`network-unavailable`、`validation`、`contract-drift`、`unexpected`）SHALL 用語彙表的那句，欄位保留、可人工重試。
每一種失敗 SHALL 依 `form-conventions`：送出控制上方恰好一個 `role="alert"`、`tabIndex=-1` 並取得焦點。
後端的 `detail`、Zod 的路徑、例外訊息、票 MUST NOT 出現在 DOM。失敗時 MUST NOT 存票、MUST NOT 呼叫 `enterRoom`、MUST NOT 自動重送。

> 拔掉什麼會紅：把 `detail` 印出來 → S09（三種偽造的 detail 都不能出現）；403 與 404 用同一個分類 → S08 的「知道是密碼」與 S09 的「不含密碼」互相區分；
> 401 走密碼分類 → S10；失敗時寫進任何票值 → S08 的「沒有存票」。

#### Scenario: [FE-N08-S08] 403：密碼不對，留著讓人改

- **WHEN** `/enter` 回 `403 { "detail": "房間密碼錯誤" }`
- **THEN** 視窗 SHALL 還開著，密碼欄 SHALL 保留原值；送出控制之前 SHALL 恰好一個 `role="alert"`，焦點 SHALL 在它上面
- **AND** alert 的內容 SHALL 讓人知道是密碼不對；SHALL 沒有存票、沒有 `enterRoom`、沒有新 socket
- **AND WHEN** 改一個字再送出
- **THEN** SHALL 送出第二個請求（人發起的）
- → 驗於：jsdom、e2e

#### Scenario: [FE-N08-S09] 404：進不了，但不說是哪一種

- **WHEN** `/enter` 分別回 404，`detail` 偽造成「專案不存在」「房間尚未開啟」「已關閉」三種
- **THEN** 三次的 alert 內容 SHALL 完全相同（前端受控、跟 detail 無關）；三個 detail 字串都 MUST NOT 出現在 DOM
- **AND** 那段內容 MUST NOT 含「不存在」「關閉」「成軍」「密碼」；SHALL 沒有存票、沒有過場
- → 驗於：jsdom（三種 detail）、e2e（一種 404：真的按 E、真的送出、alert 真的出現且不含那些字）

#### Scenario: [FE-N08-S10] 401 與服務失敗不偽裝成密碼錯

- **WHEN** `/enter` 回 401
- **THEN** alert SHALL 是語彙表 `authentication-required` 那句，MUST NOT 含「密碼」
- **AND WHEN** `/enter` 分別：網路失敗、回 500 `text/plain`、回 422、回 `200 {}`（不合 `EnterOut`）
- **THEN** 每一次 SHALL 顯示語彙表對應的那句、欄位保留、送出控制恢復可按；`Internal Server Error`、Zod 路徑、例外字串 MUST NOT 出現在 DOM
- **AND** 全部 SHALL 沒有存票、沒有 `enterRoom`
- → 驗於：jsdom（全部）、e2e（401 與網路失敗各一次：真的看到 alert、送出控制真的恢復可按）

### Requirement: 握手失敗後，使用者可以選擇重新輸入密碼；系統仍不丟票

`world-scenes` 的失敗通知（那句話、留存、取代、系統不重試、系統不丟票）全部維持。通知 SHALL 另提供一個
「重新輸入密碼」動作。只有使用者啟動它時，系統 SHALL：丟棄**這個身分**對**那間房**的票 → 關閉通知 → 開啟那間房的密碼視窗（欄位空白）。
沒有啟動時，票 SHALL 還在，再走到門前按 E SHALL 用同一張票再試（`FE-V01-S07`）。
丟票也要確認：丟票的結果 SHALL 分成「確定不在了」「還在」「無法確認（storage 讀不到）」三種（`roomTokens.ts` 的 drop 要能回報，
今天的 `heldRoomToken(): string | null` 分不出後兩種）；只有「確定不在了」才開視窗；「還在」或「無法確認」→ MUST NOT 開視窗、通知 SHALL 留著，
並 SHALL 顯示受控的一句（這個瀏覽器清不掉通行證）—— 不能一邊開視窗一邊留著一張會被拿去撞握手的舊票。
視窗的可及名稱 SHALL 含那間房的標題；標題來源依序是：`enterRoom` 當時帶的 `title`、大廳房間清單裡同 `projectId` 的標題；
兩者都沒有（深連結或上一頁失敗、清單還沒回來）時 SHALL 仍開視窗，名稱不含房名但可辨識是房間密碼視窗；
視窗開著時清單回來了，名稱 SHALL 更新成含房名（同一個視窗，不重開）。

> 拔掉什麼會紅：系統在失敗時自動丟票 → S11 第一段（票不在了）；動作不丟票 → S11 第二段（視窗開了但票還在，
> 之後送出成功會覆寫 —— 判準是 `sessionStorage` 那個鍵在啟動後為空）；動作不關通知 → S11 alert 還在。

#### Scenario: [FE-N08-S11] 被拒之後：不按就用舊票再試；按了才丟票開視窗

- **GIVEN** P 持有 R 的票 T，進入 R 的新 socket 在 `open` 前就關（`code=1006`）
- **THEN** SHALL 回到大廳並顯示通知（`FE-V01-S07`）；`sessionStorage` P＋R 的鍵 SHALL 仍是 T；通知裡 SHALL 有「重新輸入密碼」的控制
- **AND WHEN** 不按它，再走到 R 的門前按 E
- **THEN** 新 socket 的位址 SHALL 仍帶 `token=T`
- **AND WHEN** 第二次也被拒，使用者啟動「重新輸入密碼」
- **THEN** P＋R 的鍵 SHALL 被移除；SHALL 沒有 `role="alert"`；SHALL 出現 R 的密碼視窗，可及名稱含 R 的標題、欄位空白（通知要記得那間房的標題，不只 id）
- **AND** 在啟動之前，系統 MUST NOT 呼叫 `/enter`、MUST NOT 自己移除那個鍵
- **AND WHEN** `sessionStorage.removeItem` 拋，或 `removeItem` 靜默沒刪、或刪完 `getItem` 拋 —— 三種各一次，使用者啟動「重新輸入密碼」
- **THEN** 三種都 SHALL 沒有視窗；通知 SHALL 還在；SHALL 有一句受控說明；鍵在的那兩種鍵 SHALL 仍是 T
- **AND WHEN** 失敗來自深連結（`/world?room=R` 帶票、沒有 `title`）、房間清單還沒回來，使用者啟動「重新輸入密碼」
- **THEN** SHALL 開視窗，可及名稱 SHALL 可辨識是房間密碼視窗（不含房名）
- **AND WHEN** 視窗還開著，`GET /api/rooms` 回來了、裡面有 R 的標題
- **THEN** 同一個視窗（同一個 DOM 節點）的可及名稱 SHALL 變成含 R 的標題，欄位內容不變
- → 驗於：jsdom、e2e（前半）

### Requirement: 本地後端的 enter 在下列語意上與真後端相同，票本地替身收得下

`local` 目標 SHALL 提供 `POST /api/projects/{project_id}/enter`：body 合 `EnterIn`，成功回 `EnterOut`。
判斷順序 SHALL 照真後端：session 無效（沒有、簽章壞）→ 401；`password_hash IS NULL`（專案不存在或還沒成軍）→ 404；
密碼不合 → 403；否則簽票 —— **不看 `status`**（`closed` 但有 `password_hash` 照樣簽，跟真後端一樣）、不看座位。錯誤形狀 SHALL 走 `internal-backend` 既有的管線（`{ "detail": … }`）。
「相同」只涵蓋這裡列出的回應分類與下面的 WS 驗票語意；**已知差異**（不承諾相同）：本地票不過期、本地沒有 server-side `room_tokens`（給座位端點用的，`FE-J13` 的事）、**session 指向已不存在的名片**：真後端的 `get_current_user` 不查名片、`enter_room` 對那個 session 照簽 200；本地 SHALL 回 401 且 MUST NOT 簽票（走既有管線）—— 這一列不進兩個目標共用的矩陣，由 `S16` 單獨對本地驗。
簽出的票 SHALL 綁房間**與簽出時的身分**：本地即時層替身對 `room:<project_id>` 的握手 SHALL 只在「票的房間＝scene ∧ 票的身分＝握手 cookie 的身分」時接受；
另一間房、或另一個人拿著這張票 MUST NOT 被接受（跟真後端 `verify()` 同樣的可觀察語意；**本地票不過期**是已知差異，記在 design D7）。
本地 handler MUST NOT 讀座位、MUST NOT 因座位滿而拒絕。
`enterProject` 的契約測試 SHALL 對 `local` 與 `guildhub` 兩個目標跑同一份。

> 拔掉什麼會紅：handler 不驗密碼 → S12 的 403 那列；handler 與替身用不同的簽章 → S12 握手那段；票不綁身分 → S12 換 cookie 那段；
> handler 看座位 → S12 滿座那列；handler 加 `status === 'active'` 才簽 → S12 的 closed 那列；operation 改路徑或 body 欄位名 → S13 兩個目標都紅（兩個後端都不認）；
> handler 繞過 `handle()`、只驗 cookie 簽章不查名片 → S16 紅。

#### Scenario: [FE-N08-S12] 本地 enter 的矩陣與票的效力

- **WHEN** 對本地後端依序：未登入、專案不存在、`recruiting`（沒有 `password_hash`）、`active` 密碼錯、`active` 密碼對、`closed` 但有 `password_hash` 密碼對
- **THEN** SHALL 分別得到 401、404、404、403、`200` 且 body 合 `EnterOut`、`200`
- **AND** 用那張票、同一個 session cookie 對本地替身開 `scene=room:<同一個 id>` 的 socket SHALL 收到 `hello`；
  對 `scene=room:<另一個 uuid>` SHALL 被拒絕握手；換另一個人的 session cookie 帶同一張票 SHALL 被拒絕握手
- **AND** 同一個 `active` 專案，在座位表是空的、以及 `seat_count` 格全部被佔滿兩種資料下，密碼正確都 SHALL 回 200
- → 驗於：單元（契約測試，本機起的可拋棄後端＋替身）

#### Scenario: [FE-N08-S13] 兩個目標呈現同一份契約結果；換身分讀不到別人的票

- **WHEN** 對 `local` 與 `guildhub` 目標各執行 enter 的契約測試
- **THEN** 兩個目標 SHALL 都收到 `POST /api/projects/{project_id}/enter` 帶 `EnterIn`；成功 body SHALL 都通過 `EnterOut`；401／403／404 SHALL 翻譯成同一個 `kind`
- **AND WHEN** P 經視窗拿到 R 的票後，同一分頁改以 Q 的身分載入 `/world?room=R`
- **THEN** Q 的第一條連線 MUST NOT 帶 P 的票；場景 SHALL 依 `FE-V01-S14` 回到大廳
- → 驗於：單元（契約）、e2e（換身分）

#### Scenario: [FE-N08-S16] 本地 enter：session 指向已刪的名片 → 401、不簽票

- **WHEN** 對本地 handler 送一個簽章正確、但名片查不到的 session cookie，body 合 `EnterIn`
- **THEN** SHALL 回 401 `{"detail":"未登入"}`；MUST NOT 查 `password_hash`、MUST NOT 簽票（資料層只收到查名片那一道）
- → 驗於：單元（node、資料層換成記錄 SQL 的假物件；這是本地獨有的義務，不進兩個目標共用的契約檔）
