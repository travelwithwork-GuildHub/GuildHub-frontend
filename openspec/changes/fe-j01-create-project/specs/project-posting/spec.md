## Purpose

發案：已登入的人在專案看板的面板裡填四個欄位，送出之後案子立刻出現在列表第一筆。
這是案件閉環（發案 → 看板 → 詳情 → 成軍 → 進房 → 結案）的第一步；上限全部由前端守，
因為後端對這個端點什麼都不驗。

## Applicability

權限：適用 —— 入口只給已登入的人；訪客沒有入口（面板本身對訪客是權限阻擋，`FE-X04`）
併發：不適用 —— 一次一個送出（`FE-X05` 的 guard），列表重取走 `FE-B01` 既有的 request identity 規則
持久資料相容性：不適用 —— 不讀寫本機儲存
失敗路徑：適用 —— 超出上限、必填空白、送出失敗（後端錯誤／斷線）、未送出就關
測試連到什麼：單元判準不連任何外部服務（`createProject` 走本機自起的 `contract-server` 替身，`next/navigation` 不涉及）；
契約判準對**本機自起**的 `internal`（Next route handler ＋ 可拋棄庫 `INTERNAL_TEST_DATABASE_URL`）與 `guildhub`
（`scripts/contract-guildhub.mjs` 起的 loopback 真後端）各跑一次；端到端連**本機自起**的 `next start`＋`internal` 資料層。
不連任何團隊共用的位址。

## ADDED Requirements

### Requirement: 發案的入口只給已登入的人，而且只有後端有的欄位

專案看板的面板（`ListPanel`，`kind="projects"`）在 `identity.state === 'signed-in'` 時 SHALL 在列表上方提供一個「發案」動作；
身分是訪客或仍在解析時 SHALL NOT 出現任何發案的入口（連停用的按鈕都不放）。

啟用它 SHALL 在面板的 overlay 開出表單（列表不卸載、標成 `inert`，跟詳情同一個插槽），欄位**恰好**是：
標題（`title`）、內容（`body`）、需要的技能（`needed_skills`，一個欄位、逗號分隔）、座位數（`seat_count`，預設 4）。
表單 SHALL NOT 出現 Open Role、期程、預算、招募截止日或任何後端沒有模型的欄位。

#### Scenario: [FE-J01-S01] 已登入才有「發案」，訪客沒有

- **WHEN** 已登入的人開專案看板的面板
- **THEN** 列表上方 SHALL 有「發案」按鈕；人才看板的面板 SHALL NOT 有
- **AND WHEN** 訪客（`identity.state === 'guest'`）開專案看板的面板
- **THEN** 面板裡 SHALL NOT 有任何名為「發案」的按鈕或連結（包括停用的）
- **AND WHEN** 身分仍在解析（`identity.state === 'resolving'`）時開專案看板的面板
- **THEN** 同樣 SHALL NOT 有任何名為「發案」的按鈕或連結（包括停用的）

#### Scenario: [FE-J01-S02] 表單恰好四個欄位、預設值對

- **WHEN** 已登入的人按「發案」
- **THEN** overlay SHALL 出現表單，可標籤取得的欄位恰好是「標題」「內容」「需要的技能」「座位數」四個，座位數的初始值 SHALL 是 4
- **AND** 列表 SHALL 仍在 DOM 裡且為 `inert`
- **AND** 表單裡 SHALL NOT 有「預算」「期程」「截止」「Open Role」字樣的欄位或按鈕

### Requirement: 上限由前端守，數字有出處，時機照全站規則

四個欄位的限制 SHALL 是：標題 1–60 字、內容 1–2000 字、技能最多 10 項且每項 1–40 字（以逗號分隔、去空白、去重、
不分大小寫，跟名片的技能欄同一個正規化）、座位數整數 1–8。長度單位是 Unicode code point（`FE-O06`）。
這些數字 SHALL 來自 `FORM_LIMITS`（`projectTitle`、`projectBody`、`skillCount`、`skillLength`、**新增** `seatCount`），
`seatCount.max` SHALL 由 `LIMITS.seatIndex.max + 1` 推導（房間模板的格數），不得寫死。文案 SHALL 說是本站的上限。

驗證時機 SHALL 照 `FE-X05`：超出上限、非整數、超出範圍即時顯示且送出鈕停用；必填空白送出時才說、送出後隨輸入更新；
座位數的範圍錯誤 SHALL 是即時的（不是延後到送出的 `too_small`）。

#### Scenario: [FE-J01-S03] 超出上限即時說、送出停用；數字不是寫死的

- **WHEN** 標題打到 61 字、或內容 2001 字、或技能第 11 項、或某一項技能 41 字、或座位數 0／9／2.5
- **THEN** 對應欄位 SHALL 立刻有錯誤訊息（`aria-invalid`＋`aria-describedby` 指到它），送出鈕 SHALL 停用，SHALL NOT 送出任何請求
- **AND** 訊息裡的數字 SHALL 等於 `FORM_LIMITS` 對應的值（把 `FORM_LIMITS.seatCount.max` 換成 6 之後，「座位數」的上限訊息與判準 SHALL 跟著變 6）
- **AND** 在模組層 `FORM_LIMITS.seatCount.max` SHALL 恆等於 `LIMITS.seatIndex.max + 1`（把 `LIMITS.seatIndex.max` 換成 5 之後，`FORM_LIMITS.seatCount.max` SHALL 是 6 —— 寫死 8 這裡要紅）

#### Scenario: [FE-J01-S04] 必填空白要按下去才說

- **WHEN** 標題、內容都空著就按送出
- **THEN** SHALL NOT 送出請求；標題與內容 SHALL 各有錯誤訊息；焦點 SHALL 在標題欄
- **AND WHEN** 之後在標題打一個字
- **THEN** 標題的錯誤 SHALL 消失、內容的 SHALL 留著

### Requirement: 送出的是白名單 payload，成功後列表回第 0 頁重取

送出 SHALL 呼叫 `createProject`，payload 恰好是 `{ title, body, needed_skills, seat_count }`：`title`／`body` 前後空白去掉、
`needed_skills` 已正規化、`seat_count` 是整數。連按兩次 SHALL 只送一次（`FE-X05-S05`）。

成功之後表單 SHALL 關閉，列表 SHALL **回到第 0 頁並重新向伺服器取**，畫面上呈現的 SHALL 是重取回來的結果（不得把 `POST` 的回應插進畫面），
第一筆 SHALL 是剛建的案子（後端依 `updated_at desc`）；`FE-B09` 的網址頁碼 SHALL 是 0。焦點 SHALL 回到列表。

失敗（後端非 2xx、或 `createProject` 以網路錯誤 reject）SHALL 照 `FE-X05-S06`：值留著、一個 `role="alert"` 在送出鈕上方、可再送、不自動重送；
列表 SHALL 不動（不重取、頁碼不變）。

#### Scenario: [FE-J01-S05] 成功：payload 白名單、回第 0 頁、第一筆是它

- **GIVEN** 已登入的人在專案看板面板的第 1 頁（`page=1`）
- **WHEN** 填「標題 `  找一個會 Three.js 的人  `（前後各兩個空白）、內容 `做一個小房間。\n`（尾端一個換行）、技能 ` three.js, TypeScript ,three.js `、座位數 `3`」並送出，替身回 `201 ProjectOut`
- **THEN** 替身收到的 body SHALL 恰好是 `{"title":"找一個會 Three.js 的人","body":"做一個小房間。","needed_skills":["three.js","TypeScript"],"seat_count":3}`（沒有別的鍵；標題與內容的前後空白已去掉 —— 漏寫 `trim` 這裡要紅）
- **AND** 替身對 `GET /api/projects?page=0` 回的第一筆標題刻意是 `找一個會 Three.js 的人（伺服器版）`（跟 `POST` 回應不同）
- **AND** 在那個 `GET` 還沒回應時，列表 SHALL 是 `aria-busy` 且 SHALL NOT 出現 `找一個會 Three.js 的人`（不得先樂觀插入）
- **AND** `GET` 回應後表單 SHALL 已關閉；替身 SHALL 恰好收到一次 `GET /api/projects?page=0`；列表第一筆 SHALL 顯示 `找一個會 Three.js 的人（伺服器版）`；回報的頁碼 SHALL 是 0
- **AND** 焦點 SHALL 在列表上

#### Scenario: [FE-J01-S06] 失敗留值、列表不動

- **WHEN** 送出而替身回 `500`
- **THEN** 表單 SHALL 仍開著、四個欄位的值 SHALL 原樣，送出鈕上方 SHALL 有一個 `role="alert"`，替身 SHALL NOT 收到任何 `GET /api/projects`
- **AND WHEN** 再按一次送出而替身回 `201`
- **THEN** 表單 SHALL 關閉、列表 SHALL 重取第 0 頁
- **AND WHEN**（另一個全新 render）送出而 `createProject` 以網路錯誤 reject（不是 HTTP 回應）
- **THEN** 同樣 SHALL 留值、一個 `role="alert"`、替身 SHALL NOT 收到 `GET /api/projects`，且 SHALL NOT 自動再送 `POST`

#### Scenario: [FE-J01-S11] 送出中連按只送一次

- **WHEN** 送出而替身把 `POST` 卡在 pending，期間再按送出鈕兩次、再按一次 Enter
- **THEN** 替身 SHALL 只收到一個 `POST /api/projects`，送出鈕 SHALL 停用
- **AND WHEN** 替身回 `201`
- **THEN** 表單 SHALL 關閉、列表 SHALL 重取第 0 頁

### Requirement: 未送出就關要確認；送出中不可關

表單有輸入（任一欄位跟初始值不同）時，取消鈕、Escape、面板的關閉鈕三種關閉意圖 SHALL 先開確認層（沿用 `DiscardConfirm`）：
「丟棄」SHALL 關閉表單回到列表（頁碼與捲動位置不變）、「繼續編輯」SHALL 回到表單且值原樣。表單乾淨時 SHALL 直接關閉。
送出中三種關閉意圖 SHALL 都無效。

#### Scenario: [FE-J01-S07] 有輸入就問；乾淨就直接關；送出中關不掉

- **WHEN** 在標題打了字之後按 Escape
- **THEN** SHALL 出現確認層，表單 SHALL 仍在 DOM 裡（`inert`）；按「繼續編輯」→ 表單回來、標題的字還在
- **AND WHEN** 接著按面板（殼）的關閉鈕
- **THEN** SHALL 再次出現確認層（不是關掉整個面板）；按「丟棄」→ 表單 SHALL 不在，列表 SHALL 在且頁碼不變
- **AND WHEN**（另一個全新 render）在標題打了字之後按「取消」
- **THEN** SHALL 出現確認層
- **AND WHEN** 什麼都沒打就按「取消」
- **THEN** 表單 SHALL 直接關閉、SHALL NOT 出現確認層；面板 SHALL 仍開著
- **AND WHEN** 送出中（替身尚未回應）各按一次 Escape、「取消」、面板的關閉鈕
- **THEN** 表單 SHALL 仍開著、SHALL NOT 出現確認層、面板 SHALL 仍開著

### Requirement: 真瀏覽器裡發的案，別人重新載入也看得到

端到端 SHALL 對本機自起的 `next start`＋`internal` 資料層跑：登入、走到專案看板、按 E、發案、列表看到；
重新整理之後仍在；另一個身分開看板也看得到。這證明的是「案子在伺服器上」，不是「畫面上有一行字」。

#### Scenario: [FE-J01-S08] 發出去的案子在伺服器上

- **GIVEN** 真實瀏覽器、兩個全新的儲存空間各建一個身分
- **WHEN** 第一個人到 `/world`、走到專案看板前按 E、按「發案」、填四欄、送出
- **THEN** 表單 SHALL 關閉，列表第一筆 SHALL 是那個標題
- **AND WHEN** 第一個人重新整理、再開一次面板
- **THEN** 第一筆 SHALL 仍是那個標題
- **AND WHEN** 第二個人開專案看板的面板
- **THEN** 第一筆 SHALL 是同一個標題；而第二個人的面板裡 SHALL 也有「發案」（已登入）
- **AND** 第一個人建案時瀏覽器送出的 `POST /api/projects` body SHALL 恰好是四個鍵（用 `page.route` 旁觀，不攔截）
