## Purpose

案子的生命週期由 owner 在案件詳情裡推進：招募中的案子**成軍**（設房間密碼，大廳長出這間房的門），
成軍的案子**結案**（門消失、座位清空）。後端只有 `recruiting → active → closed` 三態、不驗密碼、
不回密碼，所以密碼的上限由前端守、密碼只在成軍成功的那一次詳情裡呈現且不落地；
隊員沒有模型，「寄給隊員」是把草稿寫進剪貼簿、開收件匣清單、由 owner 選對話貼上；收件匣本身不改。

## Applicability

權限：適用 —— 動作只給 owner（`owner_id` 等於自己的 `id`）；非 owner 與訪客沒有；後端 403 是失敗路徑
併發：適用 —— 成軍與結案送出中都是連按只送一次、不可關；成功後詳情更新、列表重取、門重取三件事各自獨立（先同步更新詳情，再各自啟動兩個重取，任一失敗不回滾、不擋另一個）
持久資料相容性：適用 —— 密碼 SHALL NOT 寫進任何本機儲存或網址
失敗路徑：適用 —— 密碼太短／太長／空白、403、500、斷線；結案取消
測試連到什麼：單元判準只連**本機自起**的 `contract-server` 替身；契約判準對**本機自起**的 `internal` 與 `guildhub`（`scripts/contract-guildhub.mjs`）各跑一次（既有 `projects.contract.ts` 已涵蓋 form-team／close 的形狀，這裡不加）；
端到端連**本機自起**的 `next start`＋`internal` 資料層（真的 Route Handler、真的 Postgres），`/api/rooms` 走真的替身。不連任何團隊共用的位址。

## ADDED Requirements

### Requirement: 動作跟著狀態走，只給 owner

案件詳情的動作插槽 SHALL 依案子的 `status` 呈現：`recruiting` → 一個「成軍」動作；`active` → 一個「結案」動作；`closed` → 沒有動作。
非 owner 與訪客 SHALL NOT 看到這些動作（插槽本身只在 owner 時渲染，`FE-B03-S11`）。
`active` 的案子 SHALL NOT 提供再次成軍（後端會換密碼、舊密碼立即失效）；`closed` 的案子 SHALL NOT 提供成軍（後端會復活，那是未經同意的行為）。

#### Scenario: [FE-J04-S01] 三種狀態三種動作列；非 owner 沒有

- **WHEN** owner 分別開 `recruiting`、`active`、`closed` 的自己的案子
- **THEN** 動作插槽 SHALL 分別是：一顆名字含「成軍」的按鈕且沒有「結案」；一顆名字含「結案」的按鈕且沒有「成軍」；沒有任何按鈕
- **AND WHEN** 非 owner 開同一筆 `recruiting` 的案子
- **THEN** SHALL NOT 有名字含「成軍」或「結案」的控制項

### Requirement: 成軍：密碼由前端守上限，送出走既有 operation，成功後詳情呈現回應

按「成軍」SHALL 在動作插槽內展開表單：一個標為「房間密碼」的欄位（`type="password"`、`autoComplete="new-password"`）、送出與取消。
密碼 SHALL 是 4～64 個 **code point**（`FORM_LIMITS.roomPassword`；後端不驗，這是本站的上限，文案 SHALL 說是本站的）；驗證時機照 `FE-X05`（送出前只擋超上限、送出後的錯誤留到欄位）。
送出 SHALL 呼叫 `formTeam(id, { password })`，payload 恰好是 `{ password }`（不 trim —— 密碼的空白是密碼的一部分）；送出中 SHALL 鎖住表單、連按 SHALL 只送一次。
成功（回應 `status: 'active'`）後 SHALL **先同步**以回應更新詳情（「已成軍」，`data-phase` 仍是 `ready`，不重打 `GET /api/projects/{id}`）並收起表單，
再各自啟動：列表回第 0 頁重取（案子已不在 `recruiting` 清單裡；詳情仍開著）與走廊的門立即重取（`refresh()` 恰好一次）。兩個重取 SHALL NOT 互相等待；任一失敗 SHALL NOT 回滾詳情、收回密碼或重新顯示表單。

#### Scenario: [FE-J04-S02] 密碼的上限與時機

- **WHEN** owner 按「成軍」，在密碼欄輸入 3 個字後送出；另一次輸入 65 個字；另一次留空送出
- **THEN** 三次 SHALL 都不送出請求，欄位 SHALL 標為無效並在欄位旁說出上限（含「本站」的字樣）；輸入到第 65 個字時 SHALL 即時標為無效（超上限那一層），3 個字在送出前 SHALL NOT 標為無效（送出後才標）
- **AND WHEN** 輸入 4 個 emoji（4 個 code point、8 個 UTF-16 code unit）送出；另一次輸入 64 個 emoji
- **THEN** 兩次 SHALL 都送出（以 code point 計數，不是 `.length`）
- **AND WHEN** 把 `FORM_LIMITS.roomPassword.max` 換成 10 再掛載
- **THEN** 訊息裡的數字 SHALL 跟著變成 10（數字有出處，不是寫死的）

#### Scenario: [FE-J04-S03] 成功：payload 恰好 `{password}`、詳情變「已成軍」、列表回第 0 頁重取、表單收起

- **WHEN** owner 在第 1 頁（0-based）開自己 `recruiting` 的案子，輸入密碼 ` abc 123 `（前後有空白）並送出，替身回 `{...project, status: 'active', room_template: 0}`
- **THEN** 替身收到的 body SHALL 恰好是 `{"password":" abc 123 "}`（沒有 trim、沒有別的鍵）
- **AND** 詳情的狀態節點 SHALL 是「已成軍」、`data-phase="ready"`、期間 SHALL NOT 再請求 `GET /api/projects/{id}`；表單 SHALL 不在；動作插槽 SHALL 只有「結案」
- **AND** 列表 SHALL 送出恰好一次 `GET /api/projects?page=0`（回第 0 頁重取）；詳情 SHALL 仍開著（`data-project-id` 不變）；`refresh()`（門的立即重取）SHALL 恰好被呼叫一次
- **AND WHEN** 另一次：成功回應到達時列表重取回 500、`refresh()` 的替身拋錯
- **THEN** 詳情 SHALL 仍是「已成軍」、密碼 SHALL 仍呈現、表單 SHALL 不在；列表 SHALL 是 `FE-B01` 的失敗狀態（可重試），`refresh()` SHALL 仍被呼叫過一次（列表失敗沒有擋住它）

#### Scenario: [FE-J04-S04] 失敗留值：500 留密碼、狀態不變、不重取；403 說「只有發起人」的語彙；送出中不可關、連按一次

- **WHEN** 送出後替身回 `500`
- **THEN** 表單 SHALL 仍在且密碼欄的值 SHALL 原樣；SHALL 恰好一個 `role="alert"`（`FE-X03` 的伺服器錯誤語彙）；詳情狀態 SHALL 仍是「招募中」；SHALL NOT 請求列表、SHALL NOT 呼叫 `refresh()`
- **AND WHEN** 再送一次替身回 `403 {"detail":"只有發起人可以做這件事"}`
- **THEN** alert SHALL 是 `FE-X03` 的權限語彙（不是後端原句）
- **AND WHEN** 替身壓著不回，使用者連按送出兩次並嘗試關閉詳情
- **THEN** SHALL 只送出一個請求；關閉 SHALL 被擋住（表單送出中不可關，`FE-X05-S05`／`FE-J01-S07` 同一條）

### Requirement: 成軍成功後密碼只在這一次詳情裡呈現，可複製、可寄給隊員，而且不落地

成功後詳情 SHALL 呈現剛設定的密碼（`data-testid="room-password-reveal"`）、「複製密碼」（走 `ClipboardPort`，成功才說已複製、失敗說出來並保留可選取的文字）、
「寄給隊員」：把草稿 `「<title>」的房間密碼：<password>` 寫進剪貼簿，**寫入成功才**關看板面板、開收件匣**清單**（不進任何對話、不把草稿放進收件匣的狀態）；寫入失敗 SHALL NOT 開收件匣、SHALL 說出來並保留可選取的草稿文字。
密碼只 SHALL 存在於這一次詳情的元件狀態：整段流程中 SHALL NOT 寫進網址、`localStorage`、`sessionStorage`、cookie（原文與 URL-encoded 都不行），SHALL NOT 進任何全域 provider，SHALL NOT 送進 logging／錯誤回報；
關閉詳情後 SHALL 不再呈現（後端不回密碼，前端不留）。畫面 SHALL 讓 owner 辨識「這是唯一一次看到它、忘了找不回」。

#### Scenario: [FE-J04-S05] 密碼呈現、複製成功／失敗、關閉後不再有

- **WHEN** 成軍成功
- **THEN** 詳情 SHALL 呈現那一串密碼與「只會顯示這一次」的可辨識提示；按「複製密碼」且剪貼簿寫入成功 → SHALL 出現「已複製」的 `role="status"`
- **AND WHEN** 剪貼簿寫入失敗（注入會失敗的 `ClipboardPort`）
- **THEN** SHALL NOT 說已複製，SHALL 有 `role="alert"` 說明並保留密碼文字可選取
- **AND WHEN** 返回列表再重新開同一筆詳情
- **THEN** SHALL NOT 呈現密碼、SHALL NOT 有「複製密碼」

#### Scenario: [FE-J04-S06] 「寄給隊員」：草稿進剪貼簿、看板關、收件匣清單開著、輸入框是空的；剪貼簿失敗就不開

- **WHEN** 成軍成功後 owner 按「寄給隊員」（注入會成功的 `ClipboardPort`）
- **THEN** 剪貼簿寫入的文字 SHALL 是 `「<title>」的房間密碼：<password>`；看板面板 SHALL 關閉、收件匣 SHALL 開著在**清單**（沒有 `inbox-thread`）、焦點 SHALL 在收件匣內
- **AND WHEN** 進入任一對話
- **THEN** 寄信的輸入框 SHALL 是空的（草稿不在收件匣的狀態裡，貼上是 owner 的動作）
- **AND WHEN** 另一次：注入會失敗的 `ClipboardPort` 再按「寄給隊員」
- **THEN** 看板 SHALL 仍開著、收件匣 SHALL NOT 開；SHALL 有 `role="alert"` 說明，草稿文字 SHALL 可選取

#### Scenario: [FE-J04-S08] 密碼不落地：攔截整段流程的每一次寫入

- **WHEN** 在掛載前攔截 `localStorage.setItem`、`sessionStorage.setItem`、`document.cookie` 的 setter、`history.pushState`／`replaceState`，然後走完成軍、複製、「寄給隊員」、返回列表、重開詳情
- **THEN** 攔到的每一次寫入的值與網址 SHALL NOT 含那串密碼的原文或 `encodeURIComponent` 後的形式；流程結束時的 `location`、兩個 storage、可讀的 cookie 也 SHALL NOT 含它；重開的詳情 SHALL NOT 呈現密碼

### Requirement: 結案要確認；成功後沒有動作，門消失

按「結案」SHALL 先開確認層（`role="alertdialog"`，焦點在安全的「取消」上、Escape ＝ 取消）；確認 SHALL 呼叫 `closeProject(id)`，成功後 SHALL 先同步以回應更新詳情（「已結案」，動作插槽沒有任何按鈕），再啟動走廊的門立即重取（`refresh()` 恰好一次；列表不重取 —— `active` 的案子本來就不在 `recruiting` 清單裡）。
取消 SHALL NOT 送出請求。送出中連按 SHALL 只送一次、Escape／取消／關閉詳情 SHALL 被擋住。失敗 SHALL 照 `FE-X05`（alert、狀態仍是「已成軍」、可重試、SHALL NOT 呼叫 `refresh()`）；403 SHALL 用 `FE-X03` 的權限語彙。

#### Scenario: [FE-J04-S07] 取消不送；確認送一次；成功後沒有動作；失敗留著

- **WHEN** owner 開 `active` 的案子按「結案」再按「取消」（另一次改按 Escape）
- **THEN** 兩次 SHALL 都沒有送出 `POST .../close`，動作插槽 SHALL 仍是「結案」，焦點 SHALL 回「結案」按鈕
- **AND WHEN** 按「結案」→「確定結案」，替身壓著不回，使用者連按確定兩次、按 Escape、按詳情的返回
- **THEN** SHALL 只送出一個 `POST /api/projects/<id>/close`，確認層 SHALL 仍在、詳情 SHALL 仍開著
- **AND WHEN** 替身回 `{...project, status: 'closed'}`
- **THEN** 詳情狀態 SHALL 是「已結案」；動作插槽 SHALL 沒有任何按鈕；`refresh()` SHALL 恰好被呼叫一次；SHALL NOT 請求列表
- **AND WHEN** 另一筆：確認後替身回 500；再另一筆回 `403 {"detail":"只有發起人可以做這件事"}`
- **THEN** 兩次 SHALL 各有 `role="alert"`（500 是伺服器錯誤語彙、403 是權限語彙，不是後端原句），狀態 SHALL 仍是「已成軍」，「結案」SHALL 仍可再按，`refresh()` SHALL NOT 被呼叫

### Requirement: 真瀏覽器：成軍長出門、結案門消失

整條流程 SHALL 在真的瀏覽器、真的 Route Handler、真的資料庫上成立：成軍之後大廳的門 SHALL 在 5 秒內長出來（靠立即重取，不是等 30 秒輪詢），結案之後 SHALL 在 5 秒內消失。
jsdom 看不到走廊；這一條只有 e2e 驗得到。

#### Scenario: [FE-J04-S09] 真瀏覽器閉環

- **WHEN** 在本機自起的 `next start`＋`internal` 上，一個全新身分發案 → 開詳情 → 成軍（密碼 `demo-1234`）
- **THEN** 詳情 SHALL 呈現「已成軍」與那串密碼；「複製密碼」後剪貼簿 SHALL 是 `demo-1234`；關掉面板走到走廊，SHALL 在 5 秒內看得到那扇門的標籤（案子標題）而且期間 `GET /api/rooms` 的請求數 SHALL 比成軍前多（不是等 30 秒輪詢）
- **AND WHEN** 以深連結 `/world?panel=projects&project=<id>` 回到那筆詳情（案子已不在招募清單裡、卡片點不到；`FE-B09-S14` 是這條路，`FE-J03` 來之前唯一的路）按「結案」→ 確定
- **THEN** 詳情 SHALL 是「已結案」，走廊上那扇門 SHALL 在 5 秒內消失
