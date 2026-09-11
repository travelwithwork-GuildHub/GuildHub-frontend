## Applicability

權限：**適用** —— 只能編輯自己的名片（`PATCH /api/profiles/me`；別人的沒有編輯入口）
併發：**適用** —— 面板開著時 `AvatarPicker` 可能改了 `avatar_id`；送出中再按送出
持久資料相容性：**不適用** —— 不讀寫持久資料（名片在後端）
失敗路徑：**適用** —— 載入失敗、送出失敗、超長、未儲存就關

測試連到什麼：jsdom ＋ `tests/support/contract-server`（本機自己起的 HTTP server）；**不連任何外部服務。**

## ADDED Requirements

### Requirement: 名字是入口，面板是阻斷式的

`IdentityBadge` 已登入時顯示的名字 SHALL 是一個 `button`（accessible name「我的名片」），按下 SHALL 開面板；
面板開著時 SHALL 持有世界輸入鎖、Tab 只在面板內循環、Escape 關最上層（`FE-X06` 的那一套）；關閉後焦點 SHALL 回到那個按鈕。

#### Scenario: [FE-A04-S01] 按名字開面板，世界鎖住

- **WHEN** 已登入，按標題列的名字
- **THEN** 面板 SHALL 出現（`data-testid="profile-panel"`），世界輸入鎖 SHALL 持有，焦點 SHALL 在面板內

#### Scenario: [FE-A04-S02] Escape 關面板，焦點回按鈕、鎖放開

- **WHEN** 面板開著（沒有未儲存修改），按 Escape
- **THEN** 面板 SHALL 不再顯示，鎖 SHALL 放開，`document.activeElement` SHALL 是那個按鈕

### Requirement: 顯示我的名片，用同一個呈現元件

面板 SHALL 以 `TalentDetail` 呈現目前身分的名片（四欄：名字、技能、每週時數、自介；`null`／`[]` 照 `TalentDetail` 既有的呈現），並有一個「編輯」按鈕。
別人的名片（人才看板的詳情）SHALL 沒有編輯按鈕。載入失敗 SHALL 用 `EmptyState`（`failure` ＋ retry）。

#### Scenario: [FE-A04-S03] 我的名片有編輯鈕、別人的沒有

- **WHEN** 開面板
- **THEN** SHALL 看到 `TalentDetail` 呈現自己的名字，且有「編輯」按鈕
- **WHEN** 在人才看板開別人的詳情
- **THEN** SHALL 沒有「編輯」按鈕

### Requirement: 編輯四欄，payload 白名單，悲觀更新

按「編輯」SHALL 在同一個面板原地切成表單，四欄預填目前值（`skills` 以「, 」接、`hours_per_week` 空值顯示空字串）。
規則（`FE-X05` 的時機）：`display_name` 1–20 字（必填）；`bio` ≤300；`hours_per_week` 空或 0–80 的十進位整數；
`skills` 送出前 SHALL 正規化：以 `,` 或 `，` 分割、每項 trim、去空、去重（第一個保留原文）、≤10 項、每項 ≤40 字。
送出 SHALL 是 `PATCH /api/profiles/me`，body **只有**這四個鍵（SHALL NOT 含 `avatar_id`）；`bio` 空 → `null`、`hours_per_week` 空 → `null`、`skills` 空 → `[]`。
成功 SHALL：以回應的 `ProfileOut` 更新身分（`adopt`）、回到顯示、顯示的是伺服器回傳的值。失敗 SHALL：留在表單、值不變、`FE-X05` 的 alert；`toUiError` 的文案。

#### Scenario: [FE-A04-S04] 送出的 body 形狀

- **WHEN** 填 `display_name=阿福`、`skills=React, ，TypeScript ,react`、`hours_per_week=12`、`bio` 清空，送出
- **THEN** 後端 SHALL 收到 `PATCH /api/profiles/me` 一次，body SHALL 正好是 `{"display_name":"阿福","skills":["React","TypeScript"],"hours_per_week":12,"bio":null}`（去重不分大小寫、鍵只有這四個）

#### Scenario: [FE-A04-S05] 成功：身分更新、回到顯示、用的是伺服器的值

- **WHEN** 後端回 200 的 `ProfileOut`，其中 `display_name` 是 `阿福（後端改過）`
- **THEN** 面板 SHALL 回到顯示，顯示 `阿福（後端改過）`，標題列的名字 SHALL 也變成它

#### Scenario: [FE-A04-S06] 失敗：留在表單、值不變、可重試

- **WHEN** 後端回 500
- **THEN** 表單 SHALL 仍在、四欄的值 SHALL 是剛填的、alert SHALL 出現在送出鈕上方；修正後再送 SHALL 再打一次

#### Scenario: [FE-A04-S07] 不送 avatar_id：picker 中途改的不被覆蓋

- **WHEN** 面板開著時 `AvatarPicker` 把 `avatar_id` 從 0 改成 3，然後名片表單送出
- **THEN** body SHALL 沒有 `avatar_id` 鍵；成功後身分的 `avatar_id` SHALL 仍是 3

#### Scenario: [FE-A04-S08] 超過本站上限的技能數

- **WHEN** `skills` 填 11 項
- **THEN** 欄位下方 SHALL 顯示錯誤（說明是本站的上限），送出鈕 SHALL 禁用，SHALL 沒有請求

### Requirement: 未儲存就關要確認；送出中不可關；重開從身分初始化

表單有未儲存的修改時按 Escape／「取消」SHALL 先問（確認對話，鍵盤可操作）：確認 → 丟棄、回到顯示；取消 → 留在表單、值不變。
送出中 SHALL NOT 能關（Escape／取消無效，直到請求結束）。面板每次打開 SHALL 從目前身分初始化，SHALL NOT 沿用上次的草稿。

#### Scenario: [FE-A04-S09] 有修改按 Escape：先問

- **WHEN** 改了 `bio` 沒送，按 Escape
- **THEN** SHALL 出現確認；按「繼續編輯」SHALL 留在表單且 `bio` 不變；按「丟棄」SHALL 回到顯示

#### Scenario: [FE-A04-S10] 送出中關不掉

- **WHEN** 送出後請求還沒回來，按 Escape
- **THEN** 表單 SHALL 仍在；請求回來（成功）之後 SHALL 回到顯示

#### Scenario: [FE-A04-S11] 重開從身分初始化

- **WHEN** 改了 `bio` 沒送、丟棄、關面板、再開、按編輯
- **THEN** `bio` 欄 SHALL 是身分目前的值，不是上次改的
