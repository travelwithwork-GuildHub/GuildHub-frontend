## Purpose

Project Room 的專案資源：團隊用到的外部工具連結（GitHub、Figma、Notion、Drive、Meeting），
讓房間裡的人不必回到站外問人就知道這個專案在用什麼。房間裡的 3D 看板直接顯示前幾筆的 type 與名稱，
走過去按 E 開出完整的 DOM 面板；只有 active 專案的 owner 能新增、修改、刪除。
這份能力約束清單的呈現、送出前的驗證、權限與結案時的失敗呈現、鍵盤行為，以及看板與面板的一致性。

## Applicability

權限：適用 —— 讀取：active 專案的 owner 或持本人有效 room token 的人；closed 專案只有 owner。寫入：只有 active 專案的 owner。
UI 隱藏控制項 MUST NOT 被當成權限邊界，伺服器回的 401／403／409 都要處理。
併發：適用 —— 面板開著時專案被結案（沒有 lifecycle 推播）；另一個分頁同時新增到上限或刪掉同一筆；連按送出；晚到的回應。
持久資料相容性：適用 —— 讀寫後端 `project_resources`；前端不另存資源、不在瀏覽器儲存任何資源內容。
失敗路徑：適用 —— 401、403、404、409、422、500 text/plain、網路失敗、回應不合契約。
測試連線：單元與 jsdom 不連任何服務（資料層以假的 operation 或 `page.route` 取代）；
e2e 只打 `next start` 的 loopback，REST 用 `page.route`、WebSocket 用 `routeWebSocket` 偽造 —— MUST NOT 連任何團隊共用位址。

名詞：
- **資源**：`ProjectResourceOut`（`id`、`project_id`、`label`、`type`、`url`、`created_at`）。
- **type**：`github`、`figma`、`notion`、`drive`、`meeting` 五者之一。
- **寫入者**：目前登入者的 `id` 等於專案的 `owner_id`，**且**專案 `status` 是 `active`。
- **上限**：每個專案最多 50 筆資源（後端第 51 筆回 409）。

## ADDED Requirements

### Requirement: 面板依伺服器順序列出資源；名稱是文字、網址只經安全外開、type 看得出來

資源面板 SHALL 以 `GET /api/projects/{project_id}/resources` 回傳的順序（`created_at ASC, id ASC`）逐列呈現**全部**資源（不分頁）。
每一列 SHALL 呈現：名稱（以文字節點呈現 `label` 原字串）、type（視覺上可辨識，且輔助技術讀得到是哪一種 —— MUST NOT 只靠圖示顏色或形狀）、
以及網址 —— 網址 SHALL 只經 `output-safety` 的 `SafeExternalLink` 呈現：`safeHref` 放行才是另開分頁的連結，放行不了的 SHALL 是純文字。
面板 MUST NOT 自行組 `<a href>`、MUST NOT 以 `window.open` 或導覽取代連結。

#### Scenario: [FE-J14-S01] 非 owner 開面板：全部、照順序、三樣都在，沒有寫入控制

- **GIVEN** 已登入的非 owner、持有那間 active 專案的有效票；後端回三筆，`created_at` 依序為 T1＜T2＜T3，type 依序 `github`、`meeting`、`figma`
- **WHEN** 開啟資源面板
- **THEN** 面板 SHALL 恰好三列，順序與回應相同
- **AND** 每一列的名稱節點 `textContent` SHALL 等於該筆 `label`；每一列 SHALL 有一個 `a[href]`，其 `href` 等於 `safeHref(url)`、`target="_blank"`、`rel` 含 `noopener` 與 `noreferrer`
- **AND** 每一列的 type SHALL 有可及名稱，三列的可及名稱兩兩不同
- **AND** 面板裡 SHALL 沒有新增、修改、刪除的控制項
- → 驗於：jsdom

#### Scenario: [FE-J14-S02] 存得進去但不安全的網址：純文字，不是連結

- **WHEN** 後端回一筆 `url` 為 `https://[`（URL 解析器拋錯所以 `safeHref` 回 `null`，但符合後端資料庫的 `^https?://[^[:space:]]+$`，存得進去）
- **THEN** 那一列 SHALL 沒有 `a` 元素，網址以純文字呈現；其他列不受影響
- → 驗於：jsdom

### Requirement: 空、載入、失敗三種狀態

面板首次載入資源時 SHALL 有可辨識的載入狀態。
回應是空陣列時 SHALL 呈現 `empty-state` 的「首次無資料」；寫入者看到的首次無資料 SHALL 另外提供新增的動作，非寫入者 MUST NOT 有。
載入失敗的呈現 SHALL 由 `FE-X03` 的 `kind` 決定（`empty-state`〈哪一種失敗畫成哪一種〉）：401、403 是權限阻擋（沒有重試），其餘是載入失敗（有重試，按一次恰好再讀一次）。
403 另受〈結案與權限失敗〉那一條約束。

#### Scenario: [FE-J14-S03] 空清單：寫入者有新增動作，非寫入者沒有

- **WHEN** 後端回 `[]`，分別以 active 專案的 owner 與持票的非 owner 開啟面板
- **THEN** 兩次 SHALL 都呈現「首次無資料」
- **AND** owner 那次 SHALL 有新增資源的動作；非 owner 那次 SHALL NOT 有任何可操作的新增控制
- → 驗於：jsdom

#### Scenario: [FE-J14-S04] 500 是載入失敗，重試一次只讀一次；401 是權限阻擋

- **WHEN** 首次讀取回 `500 text/plain`，使用者按一次重試
- **THEN** 先呈現載入失敗；按下後 SHALL 恰好再送出一次 `GET …/resources`
- **AND WHEN** 首次讀取回 401
- **THEN** SHALL 呈現權限阻擋，SHALL NOT 有重試
- → 驗於：jsdom

### Requirement: 結案與權限失敗：確認一次專案狀態，是 closed 才說已結案；不輪詢

面板開著時專案可能被結案，而前端沒有任何推播會告訴它。系統 MUST NOT 以輪詢發現這件事。

資源的**任何一次**讀取或寫入（GET／POST／PATCH／DELETE）拿到 **403 或 409** 時，系統 SHALL 以 `GET /api/projects/{project_id}` **確認一次**專案狀態，然後：
- 狀態是 `closed` → 面板 SHALL 呈現「專案已結案」：使用者 SHALL 能辨識這個專案已結案、資源不能再改；所有寫入控制項與開著的表單 SHALL 移除。
  owner 已經讀到的清單 SHALL 保留顯示（closed 專案 owner 仍可讀）；非 owner 不顯示清單。
- 狀態**不是** `closed`（`active`、`recruiting`，或未來新增的任何狀態）→ MUST NOT 呈現「已結案」。
  讀取的 403 SHALL 呈現權限阻擋；寫入的 403 SHALL 在表單上呈現 `FE-X03`「沒有權限」的那一句並移除寫入控制項；
  寫入的 409 SHALL 在表單上呈現「衝突」的那一句、保留輸入，並 SHALL 重新讀取清單一次
  （409 在非 closed 專案上的意思是另一處已新增到上限）。
- 確認本身回 **401** → SHALL 呈現 `FE-X03` 對 401 的那一句（登入已失效比原本那個碼更接近事實），MUST NOT 呈現「已結案」。
- 確認本身回 **404**（專案不見了）→ SHALL 呈現 `FE-X03` 對 404 的那一句，MUST NOT 呈現「已結案」。
- 確認本身以其他方式失敗（5xx、網路、回應不合契約）→ SHALL 依原本那個 403／409 的 `kind` 呈現，MUST NOT 猜是結案。

確認 SHALL 是**每一次失敗各一次**：系統 MUST NOT 把先前確認到的 `active` 快取起來當成下一次失敗的答案（那會讓結案永遠發現不了），
也 MUST NOT 對同一次失敗確認兩次。

面板開啟時若專案已不是 `active`，系統 SHALL 從一開始就不給寫入控制項（寫入者的定義要求 `active`）。

#### Scenario: [FE-J14-S05] 非 owner 面板開著時專案結案：下一次讀取才發現，說已結案，不輪詢

- **GIVEN** 持票的非 owner 已開著面板並看到兩筆資源（假時鐘）
- **WHEN** 把假時鐘推進 10 分鐘
- **THEN** 這段期間 SHALL 沒有送出任何 `GET …/resources` 或 `GET /api/projects/{id}`
- **AND WHEN** 使用者關掉再開面板，`GET …/resources` 回 403，隨後 `GET /api/projects/{id}` 回 `status: "closed"`
- **THEN** SHALL 恰好送出一次 `GET /api/projects/{id}`；面板 SHALL 呈現「專案已結案」，SHALL NOT 有清單、重試或寫入控制
- → 驗於：jsdom

#### Scenario: [FE-J14-S06] 讀取 403 但專案仍是 active：權限阻擋，不是已結案

- **WHEN** `GET …/resources` 回 403，隨後 `GET /api/projects/{id}` 回 `status: "active"`
- **THEN** 面板 SHALL 呈現權限阻擋，SHALL NOT 呈現「專案已結案」
- **AND WHEN** 改成 `GET /api/projects/{id}` 回 `status: "recruiting"`
- **THEN** 同樣 SHALL 呈現權限阻擋，SHALL NOT 呈現「專案已結案」
- **AND WHEN** 改成 `GET /api/projects/{id}` 回 500
- **THEN** 同樣 SHALL 呈現權限阻擋（403 的 `kind`），SHALL NOT 呈現「專案已結案」
- **AND WHEN** 改成 `GET /api/projects/{id}` 回 401
- **THEN** SHALL 呈現 `FE-X03` 對 401 的那一句（要登入），SHALL NOT 呈現權限阻擋以外的結案字樣
- **AND WHEN** 改成 `GET /api/projects/{id}` 回 404
- **THEN** SHALL 呈現 `FE-X03` 對 404 的那一句，SHALL NOT 呈現「專案已結案」
- **AND** 上面每一種情況 SHALL 各只送出一次 `GET /api/projects/{id}`
- → 驗於：jsdom

> 這兩條要成對：只驗 S05 的話，「403 一律說已結案」全綠 —— 而那會把「票過期」說成「專案結束了」。

#### Scenario: [FE-J14-S07] owner 寫入時專案已結案：收掉寫入，清單留著

- **GIVEN** active 專案的 owner 開著面板，清單有兩筆，新增表單已填好合法值
- **WHEN** 送出，`POST …/resources` 回 409，隨後 `GET /api/projects/{id}` 回 `status: "closed"`
- **THEN** 面板 SHALL 呈現「專案已結案」；新增、修改、刪除控制項與表單 SHALL 都不存在；原本兩筆 SHALL 仍在
- **AND** SHALL NOT 自動重送 `POST`
- **AND WHEN** 換一個起點：owner 開著面板，改成對某一列按**刪除**並確認，`DELETE` 回 409，隨後確認狀態回 `closed`
- **THEN** 同樣 SHALL 呈現「專案已結案」、收掉寫入控制項；`PATCH` 回 409 或 403 時亦同（確認流程不分是哪一個寫入動作）
- → 驗於：jsdom

#### Scenario: [FE-J14-S08] owner 新增拿到 409 但專案仍是 active：衝突，留值，重讀清單一次

- **GIVEN** active 專案的 owner 開著面板，清單有 49 筆，新增表單已填好合法值
- **WHEN** 送出，`POST` 回 409，`GET /api/projects/{id}` 回 `status: "active"`，重讀的清單回 50 筆
- **THEN** 表單 SHALL 仍在且欄位值不變，送出鈕上方的 alert SHALL 是 `FE-X03`「衝突」的那一句；SHALL NOT 呈現「專案已結案」
- **AND** SHALL 恰好再送出一次 `GET …/resources`，清單 SHALL 變成 50 筆，新增 SHALL 變成不可用（〈上限〉那一條）
- → 驗於：jsdom

#### Scenario: [FE-J14-S09] 開面板時專案已是 closed：owner 讀得到，但一開始就沒有寫入控制

- **WHEN** owner 開啟 `status: "closed"` 專案的面板，`GET …/resources` 回兩筆
- **THEN** 兩筆 SHALL 呈現；SHALL 沒有新增、修改、刪除控制項；使用者 SHALL 能辨識專案已結案
- **AND** 整個過程 SHALL 沒有任何 `POST`／`PATCH`／`DELETE`
- → 驗於：jsdom

### Requirement: 寫入控制項只給寫入者；隱藏不是權限邊界

新增、修改、刪除的控制項 SHALL 只在目前登入者是**寫入者**時存在於 DOM（不是 `hidden`，是不存在）。
非寫入者、身分或專案資料還沒讀到時，SHALL NOT 有寫入控制項。
寫入者判定所需的資料（目前登入者的 `id`、專案的 `owner_id` 與 `status`）SHALL 經 `src/api/` 的既有 operation 取得；元件 MUST NOT 直接 `fetch`。
寫入請求回 403 時 SHALL 走〈結案與權限失敗〉的確認；確認結果是 `active` 時 SHALL 以 `FE-X03`「沒有權限」的那一句呈現在表單上，並移除寫入控制項。

#### Scenario: [FE-J14-S10] 寫入控制只在 active owner 身上出現（成對）

- **WHEN** 同一份資源清單，依序以 (a) active 專案的 owner、(b) 持票的非 owner、(c) closed 專案的 owner、(d) 身分還在讀取中 掛載面板
- **THEN** 只有 (a) SHALL 有新增控制，且每一列有修改與刪除控制；(b)(c)(d) 的 DOM 裡 SHALL 都沒有這三種控制
- → 驗於：jsdom

### Requirement: 新增：送出前擋下伺服器一定會拒絕的輸入，只送原字串

新增表單 SHALL 使用 `form-conventions` 的 `useForm`，欄位為名稱、type、網址，驗證時機依該 capability：

| 欄位 | 即時（擋送出） | 送出時才說（不擋按鈕） |
|---|---|---|
| 名稱 | 超過 `LIMITS.resourceLabel.max`（100 code point） | 空字串；只含空白字元 |
| type | —— | 沒有選 |
| 網址 | 超過 `LIMITS.resourceUrl.max`（2048 code point）；`safeHref(輸入) === null`；含任何空白字元 | 空字串 |

長度一律以 code point 計（`limit-source`）。表單 MUST NOT 用原生 `maxlength`。type 的選項 SHALL 恰好是那五種。
送出的 body SHALL 是 `{ label, type, url }`，`label` 與 `url` SHALL 是使用者輸入的**原字串**（MUST NOT trim、MUST NOT 以 `safeHref` 的正規化結果取代）。
成功（201）後，回應的那一筆 SHALL 出現在清單**最後**，表單 SHALL 關閉或清空。
失敗依 `form-conventions`〈送出中、失敗、重試〉：保留輸入、alert 在送出鈕上方、不自動重送；403／409 另依〈結案與權限失敗〉。

表單 SHALL 讓 owner 在送出之前就能辨識：**這個連結會被能進這間房的人看到**（Drive、Notion、會議連結常帶存取權杖）。

#### Scenario: [FE-J14-S11] 合法輸入：恰好一個 POST，body 是原字串，新的一筆接在最後

- **GIVEN** owner、active 專案、清單有兩筆
- **WHEN** 輸入名稱 ` 設計稿 `（前後各一個空白）、type `figma`、網址 `HTTPS://www.figma.com/file/abc`，按送出
- **THEN** SHALL 恰好送出一次 `POST /api/projects/{id}/resources`，body SHALL 等於 `{"label":" 設計稿 ","type":"figma","url":"HTTPS://www.figma.com/file/abc"}`
  （大寫 scheme 照送：後端的 check 是不分大小寫的 `~*`，前端不正規化）
- **AND** 在 201 回來**之前**清單 SHALL 仍是兩筆（沒有樂觀更新的假列）
- **AND** 回 201 之後清單 SHALL 是三筆，第三筆是回應的那一筆
- → 驗於：jsdom

#### Scenario: [FE-J14-S12] 名稱與網址的上限：剛好可送，多一個即時擋

- **WHEN** 名稱輸入 `LIMITS.resourceLabel.max` 個 emoji、網址輸入以 `https://example.com/` 開頭且總長恰好 `LIMITS.resourceUrl.max` code point 的字串
- **THEN** SHALL 沒有錯誤、送出鈕可按，送出的值 SHALL 是完整的原字串
- **AND WHEN** 名稱多一個字
- **THEN** 名稱欄下方 SHALL 立刻出現錯誤、送出鈕 SHALL disabled
- **AND WHEN** 名稱改回上限、網址多一個字
- **THEN** 網址欄下方 SHALL 立刻出現錯誤、送出鈕 SHALL disabled
- **AND** 以 module mock 把 `LIMITS.resourceLabel.max` 換成 10 時，11 個字 SHALL 即時擋、10 個字 SHALL 可送（數字不是寫死的）
- **AND** 另一次 mock 把 `LIMITS.resourceUrl.max` 換成 30 時，總長 31 的合法網址 SHALL 即時擋、總長 30 的 SHALL 可送
  （兩個欄位各要有自己的 mock —— 只 mock 一個的話，另一個寫死仍然全綠）
- → 驗於：jsdom

#### Scenario: [FE-J14-S13] 伺服器一定會拒絕的網址：即時擋，沒有請求

- **WHEN** 網址分別輸入 `javascript:alert(1)`、`data:text/html,x`、`example.com`、`/relative`、`https://example.com/a b`、`https://example.com/a\tb`
- **THEN** 每一次網址欄下方 SHALL 立刻出現錯誤、送出鈕 SHALL disabled，整段期間 SHALL 沒有任何 `POST`
- → 驗於：jsdom

#### Scenario: [FE-J14-S14] 缺必填與只有空白：按下去才說，不送

- **WHEN** 名稱空、type 沒選、網址空，不按送出
- **THEN** SHALL 沒有錯誤、送出鈕可按
- **AND WHEN** 按送出
- **THEN** 三欄下方 SHALL 各有錯誤、SHALL 沒有請求、焦點 SHALL 在名稱欄
- **AND WHEN** 名稱改成 `"   "`（三個空白）、選好 type、填合法網址，再按送出
- **THEN** 名稱欄 SHALL 有錯誤、SHALL 沒有請求
- → 驗於：jsdom

#### Scenario: [FE-J14-S15] 送出前看得到「連結會給能進房的人看到」

- **WHEN** owner 打開新增表單，尚未輸入
- **THEN** 表單範圍內 SHALL 有一段可見、且被輔助技術關聯到網址欄（`aria-describedby`）的說明，讓人辨識連結的可見範圍是能進這間房的人
- → 驗於：jsdom

### Requirement: 上限：已有 50 筆時新增不可用，並說得出為什麼

清單已有 50 筆（上限）時，新增控制 SHALL 不可用，且使用者 SHALL 能辨識是因為已達上限（不是壞掉）；SHALL NOT 送出 `POST`。
刪掉一筆之後新增 SHALL 恢復可用。上限數字 SHALL 來自單一常數，MUST NOT 在元件裡寫死。

#### Scenario: [FE-J14-S16] 50 筆：不能新增、有理由；刪一筆就恢復

- **WHEN** owner 開啟有 50 筆的 active 專案面板，嘗試新增
- **THEN** 新增控制 SHALL 是 disabled，其可及描述 SHALL 說明已達上限；SHALL 沒有任何 `POST`
- **AND WHEN** 刪除其中一筆成功（204）
- **THEN** 清單 SHALL 是 49 筆、新增控制 SHALL 可用
- **AND WHEN** 以 module mock 把上限常數換成 3，掛載一份 3 筆的清單
- **THEN** 新增控制 SHALL 是 disabled；2 筆時 SHALL 可用 —— 元件裡寫死 50 的話這一段紅
- → 驗於：jsdom

### Requirement: 修改：只送改了的欄位，位置不變

修改表單 SHALL 以該筆目前的值為初始值，驗證同〈新增〉。
送出時 body SHALL 只含**與初始值不同**的欄位；沒有任何欄位改變時 SHALL NOT 送出請求（表單直接結束修改）。
成功（200）後，該列 SHALL 以回應取代、**位置不變**。
回 404（這一筆已被刪掉，例如另一個分頁）時，SHALL 以 `FE-X03` 對 404 的那一句呈現，並重新讀取清單一次。

#### Scenario: [FE-J14-S17] 只改網址：PATCH 只帶 url，列的位置不變

- **GIVEN** 清單三筆 A、B、C
- **WHEN** 修改 B，只把網址換成另一個合法網址，送出，回 200
- **THEN** SHALL 恰好一次 `PATCH /api/projects/{id}/resources/{B.id}`，body 的鍵集合 SHALL 恰好是 `{"url"}`
- **AND** 清單 SHALL 仍是 A、B、C 的順序，B 那列 SHALL 呈現新網址
- → 驗於：jsdom

#### Scenario: [FE-J14-S18] 沒改任何東西：不送

- **WHEN** 打開 B 的修改表單，不改任何欄位，按送出
- **THEN** SHALL 沒有任何 `PATCH`，修改狀態 SHALL 結束
- → 驗於：jsdom

#### Scenario: [FE-J14-S19] 改的那一筆已被刪：說出來，重讀一次

- **WHEN** 修改 B 送出，`PATCH` 回 404
- **THEN** SHALL 呈現 `FE-X03` 對 404 的那一句，SHALL 恰好再送出一次 `GET …/resources`；重讀結果沒有 B 時，清單 SHALL 沒有 B
- → 驗於：jsdom

### Requirement: 刪除要確認；取消不送、確認送一次

刪除 SHALL 先進入確認；確認層 SHALL 讓使用者辨識要刪的是哪一筆（呈現該筆名稱，文字節點）。
取消（含 Escape）SHALL NOT 送出任何請求；確認 SHALL 恰好送出一次 `DELETE`，送出中 SHALL NOT 再送第二次。
回 204 後該列 SHALL 從清單移除；回 404 時 SHALL 同樣從清單移除（東西已經不在了），並重新讀取清單一次；403／409 依〈結案與權限失敗〉。

#### Scenario: [FE-J14-S20] 取消不送、確認只送一次、成功就移除

- **WHEN** 對 B 按刪除，確認層出現，按取消
- **THEN** SHALL 沒有任何 `DELETE`，B 仍在
- **AND WHEN** 再按刪除、在確認層連按兩次確認（請求還沒回來）
- **THEN** SHALL 恰好一次 `DELETE /api/projects/{id}/resources/{B.id}`；回 204 後清單 SHALL 沒有 B
- → 驗於：jsdom

### Requirement: 鍵盤：面板持有世界命令鎖，Escape 每次只關最上層

資源面板開著時 SHALL 持有 `keyboard-focus` 的世界命令鎖，**直到面板本身關閉為止**；關掉裡面的表單或確認層 MUST NOT 提早釋放它；關閉時 SHALL 只釋放自己那一份。
焦點在面板的文字欄位時，輸入任何字元（含 `w`、`a`、`s`、`d`、`e`）SHALL 只進欄位，MUST NOT 移動角色或觸發世界互動。
Tab 與 Shift+Tab SHALL 在面板內循環（`keyboard-focus`〈焦點有邊界〉）。
Escape SHALL 每次只關最上層（確認層 → 表單 → 面板）；面板關閉後焦點 SHALL 回到開啟前的位置，世界命令 SHALL 恢復（若沒有其他持有者）。

#### Scenario: [FE-J14-S21] 在欄位裡打 wasde 不走路；Escape 一層一層關

- **GIVEN** owner 開著面板與新增表單，焦點在名稱欄
- **WHEN** 輸入 `wasde`
- **THEN** 名稱欄的值 SHALL 是 `wasde`；世界命令鎖 SHALL 是被持有的狀態，角色位置 SHALL 不變、SHALL 沒有互動被觸發
- **AND WHEN** 從面板最後一個可聚焦元素按 Tab、從第一個按 Shift+Tab
- **THEN** 焦點 SHALL 都仍在面板內（不會跑到面板外或 Canvas）
- **AND WHEN** 按一次 Escape
- **THEN** 表單 SHALL 關閉、面板 SHALL 仍開著，**世界命令鎖 SHALL 仍被這個面板持有**
- **AND WHEN** 再按一次 Escape
- **THEN** 面板 SHALL 關閉、世界命令鎖 SHALL 沒有這個面板的持有、`document.activeElement` SHALL 是開啟面板之前那個元素
- → 驗於：jsdom（角色實際不動由之後掛進房間的 e2e 補，見 tasks）

### Requirement: 讀取的時機是封閉的；晚到的回應不得覆蓋較新的結果

**什麼時候讀**（封閉列舉，MUST NOT 有其他時機、MUST NOT 有計時器）：
1. 資源看板掛載時一次；
2. 面板**每一次開啟**時一次 —— 但同一次掛載裡的**第一次**開啟與上面那一次 SHALL 共用同一次讀取，MUST NOT 因此多送一次；
3. 失敗狀態上的重試，使用者按一次送一次；
4. 本規格另外指名的重讀（`FE-J14-S08` 的 409、`FE-J14-S19`／刪除的 404）。

> 「關掉面板再開」是第 2 種的第二次開啟，所以會重讀 —— 那是**發現專案已結案的唯一時機**（不輪詢）。

同一個專案的讀取與專案狀態確認可能同時有多個在路上。系統 SHALL 以「哪一個**後發出**」為準：
較早發出、較晚回來的**資源讀取**結果 MUST NOT 覆蓋較新的讀取結果，也 MUST NOT 覆蓋在它之後成功的寫入所造成的清單變化；
較早發出、較晚回來的**專案狀態確認**結果 MUST NOT 覆蓋較新的確認結果 —— 尤其一個晚到的 `active` MUST NOT 把已經呈現的「已結案」改回可寫入的樣子。
這一條與 `list-panel`〈晚到的回應不得覆蓋畫面〉同一種義務，但那一份的範圍是案件／人才的分頁清單，不涵蓋這裡。

#### Scenario: [FE-J14-S36] 晚到的舊讀取被丟棄

- **GIVEN** 面板已呈現兩筆；讀取 R1 因失敗被使用者按了重試，送出 R2
- **WHEN** R2 先回來（三筆），R1 才回來（兩筆，舊資料）
- **THEN** 畫面 SHALL 是三筆
- **AND WHEN** 換一個順序：使用者新增成功（清單變三筆）之後，一個更早發出的讀取才回來（兩筆）
- **THEN** 畫面 SHALL 仍是三筆
- **AND WHEN** 連續兩次失敗各自發出專案狀態確認 C1、C2；C2 先回 `closed`、C1 才回 `active`
- **THEN** 畫面 SHALL 是「專案已結案」，寫入控制項 SHALL NOT 因為 C1 回來而重新出現
- → 驗於：jsdom

### Requirement: 資源看板：不開面板也看得到前幾筆，按 E 開面板，跟面板一致

系統 SHALL 提供一個 3D 資源看板物件，綁定一個 `project_id`。
看板 SHALL 在自己的表面上呈現該專案依伺服器順序的**前 k 筆**資源的 type 與名稱，`k = min(資源筆數, 看板卡槽數)`；
看板卡槽數 SHALL 是一個具名常數，值域 1–50（實際值是 design 的待答常數）。
資源筆數大於卡槽數時，看板 SHALL 讓人辨識還有更多（不必顯示確切筆數）。
名稱在 3D 上 SHALL 被限制在卡槽的範圍內：太長時**看得見的那一段** SHALL 截斷並讓人看得出被截斷，
MUST NOT 溢出看板、覆蓋其他卡槽或其他物件（`label` 上限 100 code point，看板一定放不下）。
完整的原字串 SHALL 仍然取得得到：輔助技術讀到的名稱（`aria-label` 或等價物）SHALL 是**未截斷的原字串**，
而且 SHALL 以文字形式提供（`output-safety` 的〈具名元件〉把看板的可見節點與這個完整名稱分開規定）。
面板裡呈現的名稱 SHALL 是完整原字串，不截斷。
看板的狀態 SHALL 與面板來自同一份資源狀態，且 SHALL 以 `project_id` 隔離：一塊看板 MUST NOT 呈現另一個專案的資源。
看板 SHALL 有三種可區分的非資料呈現：載入中、沒有資源、讀不到（含 403／401／5xx；讀取 403 且確認為 `closed` 時 SHALL 呈現已結案）。
看板上的名稱 SHALL 以文字呈現 `label` 原字串（`output-safety`）。

看板 SHALL 以 `spatial-interaction` 註冊為一個互動目標：可及的名稱說明這是專案資源；按 E SHALL 開啟**同一個專案**的資源面板。
看板與面板 SHALL 讀同一份資源狀態：面板裡成功的新增、修改、刪除 SHALL 不需再讀一次就反映在看板上；
開啟面板 SHALL NOT 讓看板與面板呈現不同的清單。
看板 MUST NOT 自行輪詢；它的讀取時機與面板相同（掛載時一次、失敗重試或寫入後依本規格重讀）。

> **看板掛進 Project Room、擺在哪裡**不在這份規格：那需要改 `world-scenes` 的 `FE-V01-S03` 與 `project-room-layout`，
> 等 `FE-W16` 封存後另開規格 PR（proposal 已說明）。下面的 Scenario 以看板單獨掛載證明。

#### Scenario: [FE-J14-S22] 前 k 筆的 type 與名稱，超過卡槽數看得出還有

- **WHEN** 看板卡槽數為 C，分別以 0 筆、C−1 筆、C 筆、C＋1 筆資源掛載看板（以常數計算，測試不寫數字）
- **THEN** 0 筆 SHALL 呈現「沒有資源」；C−1 與 C 筆 SHALL 分別呈現 C−1、C 個卡槽內容，順序與伺服器相同，每一個有 type 的可辨識標記與名稱文字
- **AND** C＋1 筆 SHALL 恰好呈現前 C 筆，且 SHALL 有「還有更多」的可辨識標記；C 筆那次 SHALL 沒有這個標記
- **AND WHEN** 其中一筆的 `label` 是 100 個 CJK
- **THEN** 那個卡槽**可見**的文字（`[data-testid="resource-board-label"]`）SHALL 短於原字串且帶可辨識的截斷標記；
  該文字 SHALL NOT 超出卡槽的範圍（以渲染描述或量得到的邊界判定）
- **AND** 那個卡槽的可及名稱 SHALL 是**完整的 100 個字**（截斷只發生在看得見的那一層）
- → 驗於：jsdom（看板的 DOM 疊層或可查詢的渲染描述）；溢位的最終確認在 tasks 7.3 的 e2e

#### Scenario: [FE-J14-S23] 載入中、沒有資源、讀不到三種呈現可區分

- **WHEN** 分別以讀取未回、回 `[]`、回 500 掛載看板
- **THEN** 三者 SHALL 各有不同的種類標記；讀不到那一種 SHALL NOT 看起來跟「沒有資源」一樣
- **AND WHEN** 讀取回 403、隨後確認狀態回 `closed`
- **THEN** 看板 SHALL 呈現「已結案」，且 SHALL 與上面三種都不同
- **AND WHEN** 讀取回 403、確認狀態回 `active`
- **THEN** 看板 SHALL 呈現「讀不到」，SHALL NOT 呈現「已結案」
- → 驗於：jsdom

#### Scenario: [FE-J14-S24] 按 E 開的是同一個專案的面板；面板新增後看板跟著變

- **GIVEN** 綁定專案 P 的看板已掛載、有兩筆資源；角色在互動範圍內，提示正顯示這塊看板
- **WHEN** 按 E
- **THEN** SHALL 開啟 P 的資源面板，面板清單與看板內容 SHALL 相同；開啟面板 SHALL NOT 讓 `GET …/resources` 的請求次數多於一次（含看板掛載那一次）
- **AND WHEN** owner 在面板新增一筆成功
- **THEN** 看板 SHALL 呈現三筆，且整段期間 SHALL 沒有額外的 `GET …/resources`
- **AND WHEN** 同一次掛載裡另有一塊綁定專案 Q 的看板（Q 的後端回**另外三筆**）
- **THEN** 兩塊看板 SHALL 各自呈現自己專案的資源、內容不互相污染；P 的新增 SHALL NOT 改變 Q 的看板
  （這一段防的是「一份沒有以 `project_id` 隔離的全域狀態」——那種實作在只有一個專案的測試裡全綠）
- → 驗於：jsdom
