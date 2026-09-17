## Purpose

案件詳情：在專案看板的面板裡蓋在列表上，呈現案子的完整內容與發案者是誰，並只給做得到的動作。

## Applicability

權限：適用 —— 詳情要登入（401 是權限阻擋）；「私訊發案者」只給已登入的非 owner；owner 標示只給 owner；訪客沒有動作
併發：適用 —— 快速連點不同案子，晚到的舊回應不得覆蓋；案子本體與發案者名片是兩個獨立的請求
持久資料相容性：不適用 —— 不讀寫本機儲存
失敗路徑：適用 —— 案子 404／401／500、發案者名片 404／500（獨立於案子本體）、深連結直達不存在的案子
測試連到什麼：單元判準只連**本機自起**的 `contract-server` 替身（`tests/support/contract-server.ts`）；端到端連**本機自起**的 `next start`，
`/api/projects*` 與 `/api/profiles/*` 以 Playwright `page.route` 回固定 fixture。不連任何團隊共用的位址。

## ADDED Requirements

### Requirement: 卡片是控制項，滑鼠與鍵盤都開得了詳情

案件卡 SHALL 是可聚焦的控制項（`<button type="button">`）；以滑鼠點擊或以鍵盤啟動（Enter／Space）SHALL 開啟**那一筆**的詳情。

⚠️ `FE-B02` 那時詳情還不存在，做成按鈕會是一顆按下去沒反應的控制項；現在詳情有了。`FE-B02-S08` 的內容同步改成「卡片裡不能有第二個控制項」。

#### Scenario: [FE-B03-S01] 點卡片開的是那一筆

- **WHEN** 列表有多筆，使用者點擊其中第 N 筆的卡片
- **THEN** 詳情 SHALL 是第 N 筆的案子，且送出的詳情請求 SHALL 是 `GET /api/projects/<第 N 筆的 id>`

#### Scenario: [FE-B03-S02] 鍵盤也開得了：Enter 與 Space 各一次

- **WHEN** 焦點以 Tab 移到某張卡片，使用者按 Enter；另一次改按 Space
- **THEN** 兩次詳情都 SHALL 開啟；卡片的根節點 SHALL 是 `button`，卡片內 SHALL NOT 有第二個控制項

### Requirement: 詳情在同一個面板裡，案子本體一律來自 `GET /api/projects/{id}`

詳情 SHALL 在目前的面板內蓋在列表上（列表不卸載、標 `inert`），呈現 `title`、完整 `body`（保留換行）、每一項 `needed_skills`（空陣列 → 「未指定」）、
`status` 的中文（`PROJECT_STATUS_LABEL`，唯一一份）、到期（`<time dateTime={expires_at}>`，呈現「剩 N 天」／「已到期」的同一條規則，並附本地化的絕對日期）、
`seat_count`（「N 個座位」）。缺值 SHALL NOT 被捏造成有效值。

每一次開啟詳情 SHALL 以該 `id` 請求 `GET /api/projects/{id}`，成功回應才是詳情的正式資料。列表手上的那一筆得作為**可辨識的載入中預覽**
（`data-phase="loading"`、`aria-busy`）；請求成功前 SHALL NOT 宣告詳情載入完成，請求失敗後 SHALL NOT 讓預覽看起來像成功取得的詳情。
失敗 SHALL 用 `FE-X04` 的空狀態：401 → 權限阻擋、404 → 找不到（`not-found`）、其他 → 載入失敗（可重試同一個 id）。
快速連續開不同案子時，晚到的舊回應 SHALL NOT 覆蓋畫面。

#### Scenario: [FE-B03-S03] 詳情呈現的是回應，不是列表那一筆

- **WHEN** 列表那一筆的 `body` 與詳情端點回的 `body` 不同
- **THEN** 詳情載入完成後（`data-phase="ready"`）呈現的 `body` SHALL 是詳情端點回的那一個，且保留其中的換行

#### Scenario: [FE-B03-S04] 載入中是可辨識的載入中；失敗看得出失敗，不像成功

- **WHEN** 詳情請求尚未回應
- **THEN** 詳情 SHALL 是 `data-phase="loading"` 且 `aria-busy`，列表那一筆的標題 SHALL 已經看得到（預覽）
- **AND WHEN** 詳情請求回 500
- **THEN** 詳情 SHALL 呈現 `FE-X04` 的載入失敗狀態（可重試），SHALL NOT 是 `data-phase="ready"`；按重試 SHALL 恰好再請求一次同一個 id

#### Scenario: [FE-B03-S05] 401 是權限阻擋、404 是找不到

- **WHEN** 詳情請求回 `401 {"detail":"未登入"}`
- **THEN** 詳情 SHALL 呈現 `FE-X04` 的權限阻擋狀態，不是載入失敗
- **AND WHEN** 詳情請求回 `404 {"detail":"專案不存在"}`（例如深連結直達一個被移除的案子）
- **THEN** 詳情 SHALL 呈現 `FE-X04` 的找不到狀態
- **AND** 上述 401、404 與 `S04` 的 500 三種情況下，SHALL NOT 請求任何 `/api/profiles/*`（案子本體沒成功就沒有 `owner_id` 可以問）

#### Scenario: [FE-B03-S06] 快速連點不同案子，晚到的舊回應不覆蓋

- **WHEN** 使用者先開 A 再開 B，而 A 的詳情回應較晚到達
- **THEN** 詳情呈現的 SHALL 是 B，且 SHALL NOT 在任何一格呈現「B 的 id 配 A 的內容」

#### Scenario: [FE-B03-S07] 欄位齊全：狀態、到期、座位、技能、換行的內容

- **WHEN** 詳情端點回 `status: 'active'`、`needed_skills: []`、`seat_count: 2`、`expires_at` 為呈現時刻 ＋2 天、`body` 含一個換行的案子
- **THEN** 詳情 SHALL 呈現「已成軍」、「剩 2 天」與一個 `dateTime` 等於 `expires_at` 的時間元素、「2 個座位」、一個 `data-missing="needed_skills"` 的「未指定」節點
- **AND** `body` 的節點 SHALL 保留換行（兩行分開呈現）；詳情 SHALL NOT 呈現 `owner_id` 的 UUID 文字、SHALL NOT 呈現 `room_template`

### Requirement: 發案者名片是獨立的載入單元

詳情 SHALL 以 `owner_id` 請求 `GET /api/profiles/{owner_id}`，呈現發案者的名字與角色外觀（跟世界裡同一個 `avatar_id` 一致）與技能；
SHALL NOT 呈現發案者的 `bio`、時數、名片更新時間。
發案者那一塊 SHALL 有自己的載入中／失敗狀態：它的失敗（404／500）SHALL NOT 改變案子本體的 `data-phase`，且 SHALL 可獨立重試。
案子本體尚未成功前 SHALL NOT 請求發案者（沒有 `owner_id`）。

#### Scenario: [FE-B03-S08] 發案者名片來自 `GET /api/profiles/{owner_id}`，外觀跟世界一致

- **WHEN** 案子本體回 `owner_id = X`，`GET /api/profiles/X` 回一張 `avatar_id: 1` 的名片
- **THEN** 詳情 SHALL 呈現那張名片的 `display_name` 與每一項技能，外觀色 SHALL 等於世界裡 `avatar_id: 1` 用的顏色
- **AND** 詳情 SHALL NOT 含那張名片的 `bio` 字串、SHALL NOT 含其 `updated_at` 的年份

#### Scenario: [FE-B03-S15] 案子已 ready、發案者還在載：兩塊各自的狀態

- **WHEN** 案子本體回 200，`GET /api/profiles/{owner_id}` 尚未回應
- **THEN** 案子本體 SHALL 是 `data-phase="ready"` 且標題、內容都在；發案者那一塊 SHALL 是自己的載入中狀態（`data-phase="loading"`），SHALL NOT 呈現任何名字

#### Scenario: [FE-B03-S16] 切換案件後，舊發案者的回應不得覆蓋新案子的發案者

- **WHEN** 使用者先開 A（owner X）再開 B（owner Y）；A 的案子本體、B 的案子本體與 `GET /api/profiles/Y` 都已回應，而 `GET /api/profiles/X` 最後才回來
- **THEN** 詳情呈現的 SHALL 是 B 與 Y 的名字、技能、外觀；X 的回應到達後 SHALL NOT 在任何一格出現 X 的名字、技能或外觀

#### Scenario: [FE-B03-S09] 發案者名片載不到，案子本體仍是 ready；可獨立重試

- **WHEN** 案子本體回 200，`GET /api/profiles/{owner_id}` 回 500
- **THEN** 案子本體 SHALL 是 `data-phase="ready"` 且標題、內容都在；發案者那一塊 SHALL 是 `FE-X04` 的載入失敗狀態
- **AND WHEN** 按發案者那一塊的重試
- **THEN** SHALL 恰好再請求一次 `GET /api/profiles/{owner_id}`，SHALL NOT 再請求 `GET /api/projects/{id}`

### Requirement: 動作列只放做得到的：私訊發案者、owner 的標示與插槽

已登入且不是 owner 的人 SHALL 看到「私訊發案者」：啟動它 SHALL 關閉看板面板並開啟收件匣直接進入與 `owner_id` 的對話（`FE-K01-S02` 的同一條路）。
owner（`owner_id` 等於自己的 `id`）SHALL 看到「這是你發的案子」的標示，SHALL NOT 看到「私訊發案者」；詳情 SHALL 提供一個只在 owner 時渲染的動作插槽（給 `FE-J04`）。
訪客 SHALL NOT 看到任何動作。
詳情 SHALL NOT 含成軍、結案、應徵、收藏、檢舉的控制項（這一份沒有 handler；`FE-J04` 接成軍／結案，其餘沒有後端）。

#### Scenario: [FE-B03-S10] 非 owner 看到「私訊發案者」，按下去關看板、進對話

- **WHEN** 已登入的人（`id ≠ owner_id`）開一筆案子的詳情，並啟動「私訊發案者」
- **THEN** 看板面板 SHALL 關閉，收件匣 SHALL 開著且在與 `owner_id` 的對話裡

#### Scenario: [FE-B03-S11] owner 看到標示與插槽，沒有「私訊發案者」；訪客什麼都沒有

- **WHEN** owner 開自己案子的詳情
- **THEN** SHALL 有「這是你發的案子」的標示節點與插槽節點，SHALL NOT 有「私訊發案者」
- **AND WHEN** 訪客（身分 `guest`）以深連結開同一筆詳情（真實系統下請求回 `401`）
- **THEN** 詳情 SHALL 是權限阻擋狀態，SHALL NOT 有「私訊發案者」、SHALL NOT 有 owner 標示、SHALL NOT 有插槽節點

#### Scenario: [FE-B03-S12] 沒有做不到的動作

- **WHEN** 以 owner 與非 owner 各開一次詳情
- **THEN** 兩次詳情內 SHALL NOT 有名字含「成軍」「結案」「應徵」「收藏」「檢舉」的按鈕或連結（含 disabled 的）

### Requirement: 返回列表時，頁碼與捲動位置都還在

從案件詳情返回列表 SHALL NOT 重新請求列表，SHALL 回到進入前的頁碼與捲動位置；詳情顯示時列表區 SHALL 是 `inert`、SHALL NOT 卸載或 `display: none`。

#### Scenario: [FE-B03-S13] 第 1 頁（0-based）進去、第 1 頁回來，頁碼與捲動位置都在、沒有重打列表；列表區 inert

- **WHEN** 案件清單在 0-based 的第 1 頁、列表已捲到非零的 `scrollTop`，使用者開某一筆詳情再返回
- **THEN** 列表 SHALL 仍在第 1 頁、`scrollTop` SHALL 等於進入前的值；期間對 `/api/projects` 的列表請求總次數 SHALL 不增加（含不帶 `page` 的第 0 頁）
- **AND** 詳情開著時列表區 SHALL 是 `inert` 且不是 `display: none`

#### Scenario: [FE-B03-S14] 真瀏覽器：點卡開詳情、發案者名片、返回

- **WHEN** 在本機自起的 `next start` 上（`/api/projects*`、`/api/profiles/*` 以 `page.route` 回 fixture），使用者走到專案看板前按 E，Tab 到第一張卡按 Enter
- **THEN** 詳情 SHALL 開著且呈現詳情端點回的 `body`（跟列表那一筆不同的那一個）、發案者的名字；按「返回」後列表 SHALL 還在、焦點 SHALL 回到那張卡

## MODIFIED Requirements

### Requirement: 案件卡讓人一眼判斷「要什麼」「還在招嗎」「剩幾天」「幾個座位」

案件卡 SHALL 呈現 `title`、每一項 `needed_skills`、`status` 對應的中文狀態、距 `expires_at` 剩幾天、`seat_count`；
標題、每一項技能、狀態、到期、座位數 SHALL 各是一個可辨識的節點（`data-testid` 分別為 `project-card-title`、`project-skill`、`project-status`、`project-expires`、`project-seats`；
卡片根節點 `data-testid="project-card"`、`data-project-id` 是那一筆的 `id`），
座位數 SHALL 帶人讀得懂的標籤（「N 個座位」），剩幾天 SHALL 呈現為「剩 N 天」。
狀態 SHALL 以文字呈現（`recruiting` → 「招募中」、`active` → 「已成軍」、`closed` → 「已結案」），
三種狀態的文字 SHALL 互不相同；SHALL NOT 只靠顏色區分。
剩幾天 SHALL 是 `ceil((expires_at − 呈現時刻) / 86_400_000 ms)`（「天」是 24 小時的期間，不是日曆日）；結果 ≤ 0 時（含 `expires_at` 恰等於呈現時刻）SHALL 呈現為「已到期」、SHALL NOT 出現「0 天」或負數。
`expires_at` SHALL 以 `<time dateTime>` 帶出原始的絕對時間。
`needed_skills` 為空陣列時 SHALL 呈現一個標示為「未指定」的節點（可見文字「未指定」，且 `data-missing="needed_skills"` 機器可辨識），SHALL NOT 留空白。
案件卡 SHALL NOT 呈現 `body`、`updated_at`、`owner_id`、`room_template`。
案件卡 SHALL 是可聚焦的控制項（見〈卡片是控制項，滑鼠與鍵盤都開得了詳情〉）；卡片本身 SHALL NOT 含第二個控制項（整張卡就是那一顆按鈕）。

⚠️ **`updated_at` 是案件更新時間，不是活躍時間**；`body` 長度不定會把卡片高度弄亂；`owner_id` 是 UUID，人讀不懂 ——
發案者是誰歸詳情（`FE-B03`）。

#### Scenario: [FE-B02-S01] 卡片上有標題、技能、狀態、剩幾天、座位數

- **WHEN** 以 `status: 'recruiting'`、`needed_skills: ['Three.js', 'TypeScript']`、`seat_count: 3`、`expires_at` 為呈現時刻 ＋6 天 23 小時的 `ProjectOut` 掛載案件卡
- **THEN** 標題節點的文字 SHALL 等於 `title`、兩個技能各一個技能節點；狀態節點 SHALL 是「招募中」、到期節點 SHALL 是「剩 7 天」（`ceil`）、座位數節點 SHALL 是「3 個座位」
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

> 標題是寫進 main 之後不改的鍵（`FE-B02` 時卡片還不是控制項）。自 `FE-B03` 起這一條的內容改為「整張卡就是唯一的控制項」——
> 卡片**是**控制項（`FE-B03-S02`），但卡片**裡面**不能再有第二個。

- **WHEN** 掛載一張案件卡
- **THEN** 卡片的根節點 SHALL 是 `button`；根節點以內 SHALL NOT 有 `button`、`a`、`input`、`role="button"`、`role="link"`，SHALL NOT 有任何 `tabindex ≥ 0` 的子元素（巢狀控制項對螢幕閱讀器是壞掉的語意）
