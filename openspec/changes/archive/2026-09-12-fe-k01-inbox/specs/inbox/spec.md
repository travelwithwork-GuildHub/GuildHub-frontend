## Applicability

權限：**適用** —— 只看得到自己寄的與收到的（主體條件在後端 SQL；前端只呈現拿到的）；未登入沒有入口（收件匣按鈕只在 `signed-in` 時出現）；面板開著時 session 失效 → 清單走 `FE-X04` 的 `permission-blocked`、寄信走 `toUiError` 的那一句
併發：**適用** —— 寄信送出中的第二次送出（`FE-X05` 的 guard）；分頁請求（開啟時的第 0 頁、載入更多、201 後的第 0 頁）**一次只有一個 in-flight，而且帶世代 token**：舊世代的回應只合併訊息（以 `id`、只增不減），SHALL NOT 更新 `pagesLoaded`／翻到底／載入錯誤這些控制狀態；所有 GET／POST 的結果以 `id` 合併、只增不減
持久資料相容性：**不適用** —— 前端不落地任何東西（不做未讀，`BE-G06`）
失敗路徑：**適用** —— 第一頁載入失敗、載入更多失敗、名字解析失敗、寄信 400／401／404／422／5xx／連不上、翻到底

測試連到什麼：jsdom ＋ `tests/support/contract-server`（本機自己起的 HTTP server）；契約測試連本機自己起的 `next start`＋Postgres（`internal`）與本機自起的真後端（`guildhub`）。**不連任何團隊共用位址。**

## ADDED Requirements

### Requirement: 收件匣是阻斷式面板，兩個入口

已登入時標題列 SHALL 有一個 `button`「收件匣」；按下 SHALL 開收件匣面板（`data-testid="inbox-panel"`，`PanelShell`：持世界輸入鎖、focus trap、Escape 關），關閉後焦點 SHALL 回那個按鈕。
別人的名片（`TalentDetail`）在已登入時 SHALL 有一個 `button`「寄信給他」：按下 SHALL 關掉看板面板、開收件匣面板並直接進入跟那個人的對話（`data-testid="inbox-thread"`，`data-with` 是對方 id）；
交接完成後（同一個 commit 之後）焦點 SHALL 在收件匣面板內、世界輸入鎖 SHALL 持有；這樣開的面板關閉後焦點 SHALL 回世界焦點錨（`[data-focus-anchor="world"]`），因為開啟者已經不在了。
自己的名片（`ProfilePanel`）SHALL NOT 有寄信鈕；未登入時 SHALL 沒有「收件匣」按鈕，人才詳情也 SHALL 沒有「寄信給他」。
**每次從關閉打開** SHALL 重新取第 0 頁（新的分頁世代；前一個世代還在飛的請求只合併訊息、不動控制狀態）；取回來之前 SHALL 顯示載入中（`aria-busy="true"`）：
上一次開啟已載入的對話 SHALL 仍然可見、可進入（不閃成空白），但「載入更多」SHALL 不可按；SHALL NOT 顯示空狀態。
第 0 頁失敗時：500 SHALL 在既有清單上方顯示 `FE-X04` 的 `load-failed` 與重試（既有對話仍可見）；**401 SHALL 清掉已載入的信與名字快取**、只顯示 `permission-blocked`（session 沒了就不該再看到私訊），
並開一個新的**資料世代**：清空之前發出的任何請求（分頁、寄信的 201、名字解析）晚回來 SHALL NOT 再寫進信或名字快取；下一次從關閉打開才重新開始。

#### Scenario: [FE-K01-S01] 按收件匣開面板；Escape 關、焦點回按鈕；重開會重取第 0 頁

- **WHEN** 已登入，按標題列的「收件匣」
- **THEN** 面板 SHALL 出現、世界輸入鎖 SHALL 持有、焦點 SHALL 在面板內；`GET /api/messages?page=0` SHALL 被打一次
- **WHEN** 按 Escape
- **THEN** 面板 SHALL 不再顯示、鎖 SHALL 放開、`document.activeElement` SHALL 是「收件匣」按鈕
- **WHEN** 再按「收件匣」
- **THEN** `GET /api/messages?page=0` SHALL 再被打一次（共兩次）

#### Scenario: [FE-K01-S02] 從別人的名片寄信：看板關、直接進對話；關閉後焦點回世界；訪客與自己沒有寄信鈕

- **WHEN** 已登入，在人才看板開了某人的詳情，按「寄信給他」
- **THEN** 看板面板（`data-testid="list-panel"`）SHALL 不再顯示，收件匣面板 SHALL 顯示 `inbox-thread` 且 `data-with` 是那個人的 id，焦點 SHALL 在收件匣面板內，鎖 SHALL 持有
- **WHEN** 按 Escape 兩次（第一次回清單、第二次關面板）
- **THEN** 面板 SHALL 不再顯示、鎖 SHALL 放開、`document.activeElement` SHALL 是 `[data-focus-anchor="world"]`
- **AND** 訪客（未登入）開人才詳情 SHALL 沒有「寄信給他」；自己的名片面板 SHALL 沒有「寄信給他」

### Requirement: 清單是對話，不是信

面板的清單 SHALL 以**對方**分組成對話（純函式 `groupThreads(messages, me)`：對方 ＝ `sender_id`／`recipient_id` 裡不是我的那個；同一個對方一組；組內依 `created_at` 舊到新；組依最新一封新到舊排；以 `id` 去重）。
每個對話（`data-testid="inbox-thread-item"`）SHALL 顯示：對方的名字、最新一封的摘要（純函式 `preview(body)`：連續空白（含換行、tab）先壓成一個空格並 trim，再取前 40 個 code point，超過加「…」；我寄的加「你：」前綴）、最新一封的時間。
名字解析：`GET /api/profiles/{id}`，同一批去重、成功的在面板 provider 存活期間不再打；失敗 SHALL 顯示縮短的 id（前 4 碼…後 4 碼）且 SHALL NOT 阻塞清單，下一次從關閉打開面板 SHALL 再試。
第一頁沒有任何信 SHALL 顯示 `FE-X04` 的 `first-empty`；第一頁載入失敗 SHALL 顯示 `FE-X04` 的失敗節點（`toUiError` 決定 `load-failed`／`permission-blocked`）且可重試。

#### Scenario: [FE-K01-S03] 分組、排序、去重、摘要（純函式）

- **WHEN** 我是 `M`，信是 `[A→M 10:00, M→B 09:00, B→M 08:00, A→M 07:00]`（`created_at`），另外 `A→M 10:00` 那封以同一個 `id` 重複出現一次
- **THEN** `groupThreads` SHALL 回兩個對話，順序 `[A, B]`；`A` 的信依 `[07:00, 10:00]`（舊到新）且只有兩封；`B` 的信 `[08:00, 09:00]`
- **AND** `preview("  哈囉\n\n世界  ")` SHALL 是 `哈囉 世界`；41 個 code point 的 body SHALL 變成前 40 個加「…」；40 個 emoji（`.length` 80）SHALL 原樣不加「…」

#### Scenario: [FE-K01-S04] 清單顯示對方名字、摘要、時間；解析失敗顯示縮短 id 不擋、重開再試

- **WHEN** 第一頁有 `A→M`、`M→B` 兩封，`GET /api/profiles/A` 回 `阿福`、`GET /api/profiles/B` 回 500
- **THEN** 清單 SHALL 有兩列：第一列名字 `阿福`、摘要是 `A→M` 那封的 `preview`；第二列名字 SHALL 是 `B` 的縮短 id、摘要以「你：」開頭；`/api/profiles/A` 與 `/api/profiles/B` SHALL 各只被打一次
- **WHEN** 關掉面板再打開，`GET /api/profiles/B` 這次回 200 `小美`
- **THEN** `/api/profiles/A` SHALL NOT 再被打（成功的有快取），`/api/profiles/B` SHALL 再被打一次，第二列名字 SHALL 是 `小美`

#### Scenario: [FE-K01-S05] 載入更多：第二頁的信併進同一個對話；剛好 20 封仍可再載、不足 20 封是翻到底

- **WHEN** 第一頁剛好 20 封，其中有 `A→M`（最新），按「載入更多」，第二頁回一封更舊的 `M→A`
- **THEN** `GET /api/messages?page=1` SHALL 被打一次；`A` 的對話 SHALL 仍是一列，進入它 SHALL 看到兩封（舊到新）；第二頁只有 1 封（不足 20）→「載入更多」SHALL NOT 出現、SHALL 顯示 `FE-X04` 的 `exhausted`
- **AND** 第一頁不足 20 封時「載入更多」SHALL NOT 出現

#### Scenario: [FE-K01-S06] 第一頁是空的、以及載入失敗（含 401）

- **WHEN** `GET /api/messages?page=0` 回 `[]`
- **THEN** SHALL 顯示 `data-empty-state="first-empty"`，SHALL 沒有任何 `inbox-thread-item`，SHALL 沒有「載入更多」
- **WHEN** `GET /api/messages?page=0` 回 500
- **THEN** SHALL 顯示 `data-empty-state="load-failed"` 與重試；按重試 SHALL 再打一次
- **WHEN** 上一次開啟已載入兩個對話，關掉再開、`GET /api/messages?page=0` 回 500
- **THEN** 兩個對話 SHALL 仍在、上方 SHALL 有 `data-empty-state="load-failed"` 與重試
- **WHEN** 再重試、回 401（此時有一封寄信的 POST 還在飛）
- **THEN** SHALL 只顯示 `data-empty-state="permission-blocked"`，SHALL 沒有任何 `inbox-thread-item`
- **WHEN** 那封 POST 之後回 201
- **THEN** SHALL 仍然沒有任何 `inbox-thread-item`（舊世代的 201 不寫回）

#### Scenario: [FE-K01-S16] 載入更多失敗：既有清單留著、頁碼不前進、在按鈕的位置說失敗、可重試同一頁

- **WHEN** 第一頁剛好 20 封已顯示，按「載入更多」，`?page=1` 回 500
- **THEN** 20 封分出的對話 SHALL 都還在；「載入更多」的位置 SHALL 顯示 `FE-X04` 的失敗節點與重試；按重試 SHALL 再打 `?page=1`（不是 `?page=2`）
- **AND** 「載入更多」送出中再按一次 SHALL NOT 多打一次請求（一次一個 in-flight）
- **WHEN** 「載入更多」的 `?page=1` 還沒回，關掉面板再打開（新世代、第 0 頁重取），然後舊的 `?page=1` 才回來（含一封 `C→M`）
- **THEN** `C` 的對話 SHALL 出現（訊息照樣合併），但 `pagesLoaded` SHALL 仍是 1（下一次「載入更多」打的是 `?page=1`，不是 `?page=2`）

### Requirement: 對話詳情顯示已載入的信，底部可寄信

進入一個對話（按清單那一列）SHALL 顯示對方名字與**已載入**的那些信（舊到新，每封標示是誰寄的與時間，`data-testid="inbox-message"` 且 `data-mine` 是 `true`／`false`）與底部的寄信表單。
對話裡 SHALL NOT 有「載入更多」（後端沒有 per-conversation 端點，下一頁多半是別人的信 —— 按了沒反應比沒有按鈕更糟）；更早的信要回清單載入。
已載入的信裡沒有跟這個人的 SHALL 顯示 `FE-X04` 的 `first-empty`（範圍是「已載入的」，不是「從沒通過信」）＋ 表單；第 0 頁還沒回來 SHALL 是載入中，SHALL NOT 顯示 `first-empty`。
Escape 或「返回」SHALL 回到清單（面板不關）：從清單進來的，焦點 SHALL 回剛剛那一列；從人才詳情進來的，清單有那個人的列就回那一列、沒有就回清單的標題（`h2`）。
從人才詳情進來、還沒寄任何信就返回，清單 SHALL NOT 出現那個人的空對話列。

#### Scenario: [FE-K01-S07] 進對話、返回清單、焦點

- **WHEN** 按清單裡 `阿福` 那一列
- **THEN** SHALL 顯示 `inbox-thread`（`data-with` 是阿福的 id），信依舊到新、`data-mine` 正確；SHALL 沒有「載入更多」；按「返回」SHALL 回到清單且 `document.activeElement` 是剛剛那一列
- **WHEN** 從 `小美` 的名片按「寄信給他」（已載入的信裡沒有小美），不寄，按「返回」
- **THEN** SHALL 回到清單、`document.activeElement` SHALL 是清單的標題、清單 SHALL 沒有 `小美` 那一列

### Requirement: 寄信是悲觀更新，失敗留值；成功後分頁世代重來

寄信 SHALL 是 `POST /api/messages`，body **正好** `{recipient_id, body}`（`body` 原值原樣：不 trim；長度以 code point 計、1–2000，`FE-X05` 的時機）。
201 回來 SHALL：把回的 `MessageOut` 以 `id` 合併進已載入的信並**依 `created_at` 重排**（不是無條件接在末端）、表單清空（成功的 reset —— 內容已在對話裡）、
**重新取第 0 頁**並以 `id` 合併（offset 分頁被新信位移：不重取的話「載入更多」會漏一封；只增不減所以不會掉已載入的）、翻到底的狀態依這次第 0 頁重算。
**SHALL NOT 樂觀接上**（201 之前對話裡不出現這封）。任何非 201 SHALL：不接上、不清空、解除送出中、可重送；404 SHALL 以前端自己寫的一句話「這個人已經不在了。」（`describeError`），其餘（400／401／422／5xx／連不上）走 `toUiError`（`FE-X05` 的預設）。
送出中 SHALL 只擋第二次送出；Escape、「返回」、關閉鈕 SHALL 照常可用 —— 請求在面板 provider 裡繼續，201 回來一樣合併（重開面板看得到）。

#### Scenario: [FE-K01-S08] 寄出：201 才接上、依時間排、清單摘要跟著變、第 0 頁重取

- **WHEN** 在 `阿福` 的對話填「哈囉」送出，後端還沒回
- **THEN** 對話裡 SHALL 沒有「哈囉」（不樂觀）、送出鈕 disabled
- **WHEN** 後端回 201 的 `MessageOut`
- **THEN** 後端 SHALL 收到 `POST /api/messages` 一次，body 正好 `{"recipient_id":"<阿福 id>","body":"哈囉"}`；對話末端 SHALL 多一封 `data-mine="true"`；`textarea` SHALL 是空的；`GET /api/messages?page=0` SHALL 再被打一次（共兩次）；回清單，`阿福` 那一列的摘要 SHALL 是「你：哈囉」且排第一

#### Scenario: [FE-K01-S09] 失敗留值：404 是前端的一句、422／500 是 `toUiError` 的一句、都可重送

- **WHEN** 送出，後端回 404 `{"detail":"收件人不存在"}`
- **THEN** alert（trim 後）SHALL 逐字等於「這個人已經不在了。」，`textarea` 的值 SHALL 不變，對話裡 SHALL 沒有那封，送出鈕 SHALL 恢復可按
- **WHEN** 再送，後端回 422
- **THEN** alert SHALL 逐字等於 `toUiError` 對 422 的那一句，值 SHALL 不變
- **WHEN** 再送，後端回 500，再送、後端回 201
- **THEN** 500 那次 alert 是 `toUiError` 對 500 的那一句；201 那次 SHALL 接上

#### Scenario: [FE-K01-S10] 太長即時擋、空的送出才說、不 trim

- **WHEN** `textarea` 輸入 2001 個字（其中含 emoji，2000 個 code point 時 SHALL 沒有錯誤）
- **THEN** 欄位下方 SHALL 有錯誤、送出鈕 SHALL disabled、SHALL 沒有請求
- **WHEN** 清空、按送出
- **THEN** SHALL 沒有請求、欄位下方 SHALL 有錯誤、焦點 SHALL 在 `textarea`
- **WHEN** 輸入 `"  哈囉  "` 送出、後端回 201
- **THEN** body 的 `body` SHALL 是 `"  哈囉  "`（原值原樣）

#### Scenario: [FE-K01-S11] 從人才詳情進來的新對話：載入中不是空、載完沒有這個人才是空；寄了就有

- **WHEN** 從 `阿福` 的名片按「寄信給他」，第 0 頁還沒回來
- **THEN** `inbox-thread` SHALL 顯示 `阿福`、`aria-busy="true"`，SHALL NOT 顯示 `first-empty`
- **WHEN** 第 0 頁回來、裡面沒有跟阿福的信
- **THEN** SHALL 顯示 `first-empty` ＋ 表單；送出「哈囉」、後端回 201 後 SHALL 有一封 `data-mine="true"`、`first-empty` SHALL 消失；回清單 SHALL 有 `阿福` 這一列

#### Scenario: [FE-K01-S12] 送出中可以離開；回來合併

- **WHEN** 送出後後端還沒回，按「返回」
- **THEN** SHALL 回到清單（不被擋）；送出中再進同一個對話 SHALL 看到送出鈕仍 disabled
- **WHEN** 按殼的關閉鈕、然後後端回 201、再按「收件匣」打開
- **THEN** `阿福` 的對話 SHALL 含那封「哈囉」（`data-mine="true"`）

### Requirement: 本地後端與契約測試補上 messages

本地後端（`FE-O03`）SHALL 有 `GET /api/messages?page=`（**主體條件在 SQL 的 WHERE**：`sender_id = me or recipient_id = me`，`created_at desc`，20 一頁，翻過尾頁 `[]`；`page` 省略是 0、負數當 0、非整數 422（照真後端）；未登入 401）
與 `POST /api/messages`（201 回 `MessageOut`；寄給自己 → 400 `{"detail":"不能寄信給自己"}`（資料庫 `no_self_send` check，不在應用層判斷）；收件人不存在 → 404 `{"detail":"收件人不存在"}`（FK）；
body 形狀不合 → 422 golden —— 只有 Pydantic 有的：`recipient_id` 不是 uuid、缺欄位；**`body` 的 1–2000 是資料庫 check → 500**（真後端 `MessageCreate.body: str` 沒有長度；前端 `LIMITS.messageBody` 先擋））。
契約測試（`FE-O05`）SHALL 對兩個目標各驗這些，且 SHALL 以資料驗可觀察的契約「**分頁套用在授權後的集合上**」：別人的信超過一頁時我的信仍在我的第 0 頁（取前 20 筆再過濾的實作會回空）。
「條件在 SQL 的 WHERE」本身是實作要求，黑箱契約證不了 —— 本地後端另以資料層的形狀判準守（`tests/server-messages.test.ts`：發出的 SQL 含 `sender_id = $1 or recipient_id = $1`、一道查詢）。

#### Scenario: [FE-K01-S13] 寄與收：201 形狀、分頁套用在授權後的集合（穿得過一頁別人的信）

- **WHEN** 四個 jar：甲寄一封給乙、乙寄一封給甲；丙對丁寄 21 封
- **THEN** 每次 SHALL 都是 201 且是 `MessageOut`；甲的 `GET /api/messages?page=0` SHALL 正好是那兩封（`created_at` 非遞增），SHALL NOT 含丙→丁的任何一封；丁的第 0 頁 SHALL 是 20 封、第 1 頁 1 封、都不含甲乙的

#### Scenario: [FE-K01-S14] 寄給自己 400、收件人不存在 404、未登入 401

- **WHEN** 甲對自己寄信
- **THEN** SHALL 400，`detail` 是「不能寄信給自己」
- **WHEN** 甲寄給一個不存在的 uuid
- **THEN** SHALL 404，`detail` 是「收件人不存在」
- **WHEN** 沒有 cookie 打 `GET /api/messages`、以及沒有 cookie 打 `POST /api/messages`
- **THEN** 兩者 SHALL 401

#### Scenario: [FE-K01-S15] 422 的形狀與分頁參數

- **WHEN** body 是 `{}`、`recipient_id` 不是 uuid、`?page=abc`
- **THEN** SHALL 是 golden 裡實錄的 422 形狀（各一條）
- **WHEN** `body` 是 2001 個字
- **THEN** SHALL 是 500（資料庫 check；兩個目標一樣）
- **WHEN** `?page=-1`、省略 `page`
- **THEN** SHALL 跟 `?page=0` 回同一份；`?page=5`（翻過尾頁）SHALL 回 `[]`（不是 404）
