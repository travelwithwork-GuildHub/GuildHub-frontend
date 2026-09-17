## Purpose

專案看板按 E 開出來的那份清單裡，每一張案件卡讓找案子的人一眼判斷「要什麼技能」「還在招人嗎」
「還剩幾天」「幾個座位」。卡片只放後端有的欄位：標題、需要的技能、狀態、到期、座位數；
`body`、`updated_at`、`owner_id`、`room_template` 不上卡片。狀態以文字呈現、不靠顏色；剩幾天由 `expires_at` 與呈現時刻算出，
已過期不印負數；沒有指定技能要看得出是「未指定」而不是沒載到。
卡片在這一份是非互動的呈現，不是控制項；不做詳情、不決定卡片被點會發生什麼 —— 那是 `FE-B03`。

## Applicability

權限：不適用 —— 卡片只呈現列表已經拿到的資料；訪客拿不到列表是 `FE-X04` 的權限阻擋，不在這裡
併發：不適用 —— 純呈現，沒有請求
持久資料相容性：不適用 —— 不讀寫本機儲存
失敗路徑：適用 —— 已過期的案子、沒有指定技能的案子；列表本身的載入失敗與空狀態歸 `FE-B01`／`FE-X04`
測試連到什麼：單元判準不連任何外部服務（以 `ProjectOut` 形狀的 fixture 掛載卡片）；端到端連**本機自起**的 `next start`，
`/api/projects` 以 Playwright `page.route` 回固定的 fixture（要釘住 `expires_at` 才驗得出「剩幾天」）。不連任何團隊共用的位址。

## ADDED Requirements

### Requirement: 案件卡讓人一眼判斷「要什麼」「還在招嗎」「剩幾天」「幾個座位」

案件卡 SHALL 呈現 `title`、每一項 `needed_skills`、`status` 對應的中文狀態、距 `expires_at` 剩幾天、`seat_count`；
狀態、到期、座位數 SHALL 各是一個可辨識的節點（`data-testid` 分別為 `project-status`、`project-expires`、`project-seats`），
座位數 SHALL 帶人讀得懂的標籤（「N 個座位」），剩幾天 SHALL 呈現為「剩 N 天」。
狀態 SHALL 以文字呈現（`recruiting` → 「招募中」、`active` → 「已成軍」、`closed` → 「已結案」），
三種狀態的文字 SHALL 互不相同；SHALL NOT 只靠顏色區分。
剩幾天 SHALL 是 `ceil((expires_at − 呈現時刻) / 86_400_000 ms)`（「天」是 24 小時的期間，不是日曆日）；結果 ≤ 0 時（含 `expires_at` 恰等於呈現時刻）SHALL 呈現為「已到期」、SHALL NOT 出現「0 天」或負數。
`expires_at` SHALL 以 `<time dateTime>` 帶出原始的絕對時間。
`needed_skills` 為空陣列時 SHALL 呈現一個標示為「未指定」的節點（可見文字「未指定」，且 `data-missing="needed_skills"` 機器可辨識），SHALL NOT 留空白。
案件卡 SHALL NOT 呈現 `body`、`updated_at`、`owner_id`、`room_template`。
案件卡在這一份 SHALL 是非互動的 `<article>`：SHALL NOT 是按鈕或連結、SHALL NOT 可以鍵盤聚焦（沒有 `tabIndex ≥ 0`）、SHALL NOT 開啟任何東西 —— 控制項由 `FE-B03` 以 MODIFIED 加上。

⚠️ **`updated_at` 是案件更新時間，不是活躍時間**；`body` 長度不定會把卡片高度弄亂；`owner_id` 是 UUID，人讀不懂 ——
發案者是誰歸詳情（`FE-B03`）。

#### Scenario: [FE-B02-S01] 卡片上有標題、技能、狀態、剩幾天、座位數

- **WHEN** 以 `status: 'recruiting'`、`needed_skills: ['Three.js', 'TypeScript']`、`seat_count: 3`、`expires_at` 為呈現時刻 ＋6 天 23 小時的 `ProjectOut` 掛載案件卡
- **THEN** 卡片 SHALL 呈現 `title`、兩個技能各一個節點；狀態節點 SHALL 是「招募中」、到期節點 SHALL 是「剩 7 天」（`ceil`）、座位數節點 SHALL 是「3 個座位」
- **AND** `expires_at` 的節點 SHALL 是 `<time>`，其 `dateTime` 等於 fixture 的 `expires_at`

#### Scenario: [FE-B02-S02] 三種狀態三種字，而且不是靜態的字

- **WHEN** 以同一筆 fixture 分別以 `status` 為 `recruiting`、`active`、`closed` 掛載三次
- **THEN** 狀態節點的文字 SHALL 分別是「招募中」「已成軍」「已結案」，三者互不相同
- **AND** 把 `status` 改掉再掛載，狀態節點的文字 SHALL 跟著變（不是寫死的「招募中」）

#### Scenario: [FE-B02-S03] 剩幾天的邊界：剩 2 小時是 1 天，過了是「已到期」，沒有負數

- **WHEN** 以 `expires_at` 為呈現時刻 ＋2 小時掛載
- **THEN** 到期節點 SHALL 是「剩 1 天」
- **AND WHEN** 以 `expires_at` 恰等於呈現時刻掛載
- **THEN** 到期節點 SHALL 是「已到期」，SHALL NOT 是「剩 0 天」（把 `≤ 0` 寫成 `< 0` 這裡要紅）
- **AND WHEN** 以 `expires_at` 為呈現時刻 −3 天掛載
- **THEN** 到期節點 SHALL 是「已到期」，卡片文字 SHALL NOT 含任何負號後接數字

#### Scenario: [FE-B02-S04] 沒有指定技能不是空白

- **WHEN** 以 `needed_skills: []` 掛載
- **THEN** 卡片 SHALL 含一個 `data-missing="needed_skills"` 的節點且其可見文字是「未指定」（不是 `Missing` 預設的「未提供」），卡片 SHALL NOT 含任何技能節點

#### Scenario: [FE-B02-S05] `body`、`updated_at`、`owner_id`、`room_template` 不上卡片

- **WHEN** 以 `body` 含一段哨兵字串、`updated_at` 是一個不會出現在別處的年份、`owner_id` 是一個固定 UUID、`room_template` 是一個不會出現在別處的數字（例如 42）的 `ProjectOut` 掛載
- **THEN** 卡片 SHALL NOT 含那段哨兵字串、SHALL NOT 含那個年份、SHALL NOT 含那個 UUID、SHALL NOT 含那個數字
- **AND** 卡片裡唯一的 `<time>` 元素 SHALL 是 `expires_at` 的

#### Scenario: [FE-B02-S08] 卡片在這一份不是控制項

- **WHEN** 掛載一張案件卡
- **THEN** 卡片的根節點 SHALL 是 `<article>`；卡片內（含根節點）SHALL NOT 有 `button`、`a`、`input`、`role="button"`、`role="link"`，SHALL NOT 有任何 `tabindex ≥ 0` 的元素 —— 也就是可聚焦元素的查詢在卡片內 SHALL 是空的

### Requirement: 專案看板的列項就是案件卡

專案看板面板（`ListPanel`，`kind="projects"`）的每一個列項 SHALL 是同一個案件卡元件；列項 SHALL NOT 是只有標題的一行。

#### Scenario: [FE-B02-S06] 面板裡每一筆都是卡片

- **WHEN** 案件面板拿到兩筆 `ProjectOut` 的第 0 頁
- **THEN** 列表的兩個列項 SHALL 各含一張案件卡（`data-testid="project-card"`），各自的 `data-project-id` 等於那一筆的 `id`

#### Scenario: [FE-B02-S07] 真瀏覽器：走到看板前按 E，卡片上的欄位讀得出來

- **WHEN** 在本機自起的 `next start` 上，`/api/projects` 由 `page.route` 回一筆 `expires_at` 為當下 ＋7 天、`needed_skills: ['Three.js']`、`seat_count: 4`、`status: 'recruiting'` 的 fixture；使用者走到專案看板前按 E
- **THEN** 面板第一個列項的卡片 SHALL 讀得到那個標題、技能節點「Three.js」、狀態節點「招募中」、到期節點「剩 7 天」、座位數節點「4 個座位」
