## Purpose

owner 在專案看板裡切到「我的案件」就看得到自己發的每一個案子與各自的狀態（招募中／已成軍／已結案），
點開就是同一個詳情，成軍與結案在那裡。後端沒有 owner 篩選也沒有總數，只回一種 `status`、一頁 20 筆、
到期的不回；所以「我的」由前端逐頁載入三種狀態再以 `owner_id` 過濾，掃描有上限，而畫面必須說清楚看了多少、
有沒有到上限、到期的看不到 —— 不能讓一份不完整的清單長得像完整的。

## Applicability

權限：適用 —— 入口只給已登入的人（跟「發案」同一條規則）；訪客沒有；401 是權限阻擋
併發：適用 —— 三種狀態並行掃描；切換視圖後晚到的回應不得混進另一個視圖；連續切換兩次前一次的掃描作廢
持久資料相容性：不適用 —— 不讀寫任何持久資料（視圖在網址裡，見 `deep-link` 的 delta）
失敗路徑：適用 —— 任一請求失敗、401、掃描到上限、三種都掃完沒有我的
測試連到什麼：單元判準只連**本機自起**的 `contract-server` 替身；真瀏覽器判準連**本機自起**的 `next start`＋`internal` 資料層（真的 Route Handler、真的 Postgres）。不連任何團隊共用的位址。

## ADDED Requirements

### Requirement: 「我的案件」是專案看板的另一個視圖，入口只給已登入的人

專案看板的工具列 SHALL 有一個視圖切換：「招募中」（既有的分頁清單）與「我的案件」；只在 `signed-in` 時存在，訪客與 `unavailable` 沒有。
切到「我的案件」時 SHALL 換掉列表的內容（工具列的「發案」仍在，面板、標題列、關閉不變）；切回「招募中」SHALL 回到第 0 頁並重取。
視圖切換 SHALL NOT 開第二個面板、SHALL NOT 改變面板的寬度與位置。

#### Scenario: [FE-J03-S01] 已登入才有切換；切過去換內容、切回來回第 0 頁

- **WHEN** 訪客開專案看板
- **THEN** 工具列 SHALL 沒有「我的案件」的切換（跟沒有「發案」一樣）
- **AND WHEN** 已登入的人開專案看板、在第 2 頁按「我的案件」
- **THEN** 列表 SHALL 換成我的案件（招募中的卡片不在畫面上）、「發案」仍在、面板仍是同一個 `list-panel`
- **AND WHEN** 再按「招募中」
- **THEN** SHALL 送出 `GET /api/projects?page=0` 並呈現第 0 頁

### Requirement: 我的案件由三種狀態逐頁掃描、以 `owner_id` 過濾；掃描有上限，畫面誠實標明

切到「我的案件」時 SHALL 對 `recruiting`、`active`、`closed` 三種狀態**各自**從第 0 頁開始請求 `GET /api/projects?status=<s>&page=<n>`：
一頁不滿 `PAGE_SIZE`（20）就是那一種狀態的結尾；滿一頁就請求下一頁；**每種狀態最多 5 頁**（100 筆），到第 5 頁仍滿就停在那裡並記下「到上限」。
三種狀態 SHALL 並行、互不等待。結果 SHALL 只含 `owner_id` 等於自己的 `id` 的案子，三種合併後依 `updated_at` 由新到舊。
畫面 SHALL 標明：一共看過幾個案子（三種狀態載到的總數，不是自己的數）；哪些狀態到了上限（各自寫出「只看了前 100 個」）；
已到期的案子後端不回、所以看不到。這些標示 SHALL 是可辨識的產品義務，不是裝飾文字。

#### Scenario: [FE-J03-S02] 三種狀態各自翻到底、到上限就停；只留我的、由新到舊；標示看過幾個

- **WHEN** 已登入為 `me`，`recruiting` 第 0 頁回 20 筆（其中 2 筆 `owner_id=me`）、第 1 頁回 5 筆（1 筆是我的）；`active` 第 0 頁回 3 筆（1 筆是我的）；`closed` 第 0～4 頁每頁都回 20 筆（每頁 1 筆是我的）
- **THEN** SHALL 恰好送出 `recruiting` 的 `page=0`、`page=1`，`active` 的 `page=0`，`closed` 的 `page=0`～`page=4`（共 8 個請求，`closed` 沒有 `page=5`）
- **AND** 列表 SHALL 恰好 9 筆、全部 `owner_id=me`、依 `updated_at` 由新到舊
- **AND** 畫面 SHALL 標明看過 128 個案子、`closed` 只看了前 100 個（`recruiting`／`active` 沒有這個標示）、到期的看不到

#### Scenario: [FE-J03-S03] 載入中、空、失敗三種狀態各自可辨識；失敗不把部分結果當完整

- **WHEN** 三種狀態的請求都還沒回來
- **THEN** 畫面 SHALL 是可辨識的載入中（`aria-busy`），不是空狀態
- **AND WHEN** 三種狀態都回了、沒有任何一筆是我的
- **THEN** SHALL 是可辨識的空狀態，而且仍標明看過幾個案子
- **AND WHEN** `active` 的請求回 500、其餘兩種正常
- **THEN** SHALL 呈現失敗（`FE-X03` 的語彙）與「重試」，SHALL NOT 把另外兩種的結果當成完整的「我的案件」呈現；按「重試」SHALL 重新掃描三種狀態
- **AND WHEN** 第一個回來的是 401
- **THEN** SHALL 是權限阻擋（既有 `EmptyState` 的 `permission` 類），不是載入失敗

### Requirement: 卡片與詳情共用；詳情裡成軍或結案之後回來，那一筆是新的

我的案件裡每一筆 SHALL 是既有的案件卡（`FE-B02` 的欄位與狀態字），點開 SHALL 是同一個詳情（`GET /api/projects/{id}`，owner 的成軍／結案在裡面）。
詳情裡成軍或結案成功之後返回，我的案件裡那一筆 SHALL 呈現回應的狀態（就地以回應更新），SHALL NOT 為此重掃三種狀態；
門的立即重取（`FE-J04`）照舊。返回時捲動位置 SHALL 還在（列表不卸載，`FE-B03-S13` 同一條）。

#### Scenario: [FE-J03-S04] 點開是同一個詳情；成軍回來是已成軍、結案回來是已結案；沒有重掃

- **WHEN** 我的案件裡有一筆招募中的案子，點開它
- **THEN** SHALL 送出 `GET /api/projects/<id>`，詳情蓋在列表上、有「成軍」
- **AND WHEN** 成軍成功（回應 `status=active`）後按返回
- **THEN** 那一筆的卡片 SHALL 是「已成軍」；`GET /api/projects?status=…` 的請求數 SHALL 跟掃描完成時相同（沒有重掃）
- **AND WHEN** 再點開它結案成功後返回
- **THEN** 那一筆 SHALL 是「已結案」，仍然在我的案件裡（不因狀態改變而消失）

### Requirement: 晚到的回應不得混進另一個視圖

從「我的案件」切回「招募中」（或反過來）之後，前一個視圖還沒回來的請求 SHALL 被作廢：它的回應 SHALL NOT 出現在現在的視圖裡；
連續切換兩次「我的案件」時，第一次的掃描 SHALL 作廢、只呈現第二次的結果。

#### Scenario: [FE-J03-S05] 切回招募中之後，我的案件晚到的頁不混進來；重掃時舊掃描作廢

- **WHEN** 切到「我的案件」、`closed` 的第 0 頁壓著不回，接著切回「招募中」（第 0 頁已呈現 20 筆）
- **AND WHEN** 那一頁 `closed` 才回來
- **THEN** 招募中的清單 SHALL 仍是那 20 筆、沒有任何 `closed` 的卡片、沒有「看過幾個案子」的標示
- **AND WHEN** 再切到「我的案件」（重掃）、第一次掃描壓住的回應此時才回
- **THEN** 畫面 SHALL 只反映第二次掃描的結果

### Requirement: 真瀏覽器裡 owner 從發案走到結案，都在同一個面板

這條的判準 SHALL 在真瀏覽器裡對本機自起的 `next start`＋`internal` 資料層跑（jsdom 沒有樣式與真的導航）：owner 發案、切到我的案件、成軍、返回、重新整理，全程 SHALL 在同一個 `list-panel` 裡，SHALL NOT 開第二個面板。

#### Scenario: [FE-J03-S06] 真瀏覽器：發兩個案、我的案件看到兩筆、成軍回來是已成軍、重新整理仍在我的案件

- **WHEN** 對本機自起的 `next start`＋`internal` 資料層：登入、發兩個案、在看板按「我的案件」
- **THEN** SHALL 看到那兩筆（其他人的案子不在）、標示看過幾個案子
- **AND WHEN** 點開其中一筆、成軍、返回
- **THEN** 那一筆 SHALL 是「已成軍」，大廳 SHALL 長出那扇門（`FE-J04-S10`）
- **AND WHEN** 重新整理 `/world?panel=projects&view=mine`
- **THEN** 面板 SHALL 開在「我的案件」、兩筆都在、狀態各自對
