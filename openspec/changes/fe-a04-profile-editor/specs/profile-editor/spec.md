## Applicability

權限：**適用** —— 只能編輯自己的名片（`PATCH /api/profiles/me`；別人的沒有編輯入口）
併發：**適用** —— 面板開著時 `AvatarPicker` 可能改了 `avatar_id`；送出中再按送出
持久資料相容性：**不適用** —— 不讀寫持久資料（名片在後端）
失敗路徑：**適用** —— 送出失敗、超長、未儲存就關（沒有「載入失敗」：名片來自 `IdentityProvider`，同步可得）

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

面板 SHALL 以 `TalentFacts`（從 `TalentDetail` 抽出來的純呈現部分：名字、頭像色、四欄的 `<dl>`；`TalentDetail` 自己也改用它 ——
`TalentDetail` 本身會打 `GET /api/profiles/{id}`，不是純呈現）呈現**目前身分**（`IdentityProvider` 的 `signed-in` 那份 `ProfileOut`，同步可得、不另外請求）的名片
（四欄：名字、技能、每週時數、自介；`null`／`[]` 照既有的呈現），並有一個「編輯」按鈕。
別人的名片（人才看板的詳情）SHALL 沒有編輯按鈕。**沒有「載入失敗」這條路**：身分不是 `signed-in` 時入口按鈕本來就不存在（`IdentityBadge` 顯示訪客／問不到）。

#### Scenario: [FE-A04-S03] 我的名片有編輯鈕、別人的沒有

- **WHEN** 開面板
- **THEN** SHALL 看到 `TalentFacts`（`data-testid="talent-facts"`）呈現自己的名字，且有「編輯」按鈕；SHALL 沒有 `GET /api/profiles/{id}` 的請求
- **WHEN** 在人才看板開別人的詳情
- **THEN** SHALL 沒有「編輯」按鈕

### Requirement: 編輯四欄，payload 白名單，悲觀更新

按「編輯」SHALL 在同一個面板原地切成表單，四欄預填目前值（`skills` 以「, 」接、`hours_per_week` 空值顯示空字串）。
規則（`FE-X05` 的時機）：`display_name` 1–20 字（必填）；`bio` ≤300；`hours_per_week` 空字串 → `null`、否則 SHALL 是 0–80 的十進位整數
（`<input type="number">` 清空時值是 `""`，schema SHALL 先轉再驗，不然永遠清不掉 —— 審查抓到的）；
`skills` 的**驗證**每次輸入都對「正規化後的結果」算（純函式：以 `,` 或 `，` 分割、每項 trim、去空、去重不分大小寫且 NFC、第一個保留原文），
規則 ≤10 項、每項 ≤40 字；**input 裡的字串本身**只在 blur／送出時才被替換成正規化後的形式（打字中不動游標）。
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

#### Scenario: [FE-A04-S07] 不送 avatar_id：身分在別處被更新過，名片送出不會蓋回去

- **WHEN** 面板開著（表單已填好但還沒送）時，身分的 `avatar_id` 被別處從 0 更新成 3 且**後端已寫入**（測試直接走 `saveAvatar(3)` —— 阻斷式面板的 focus trap 下標題列的 picker 本來就碰不到，這條測的是「別處更新」不是使用者操作 picker），然後名片表單送出
- **THEN** body SHALL 沒有 `avatar_id` 鍵；成功後身分 SHALL 是伺服器回應的那份（唯一 canonical），其 `avatar_id` 是 3

#### Scenario: [FE-A04-S08] 超過本站上限的技能數

- **WHEN** `skills` 填 11 項
- **THEN** 欄位下方 SHALL 顯示錯誤（說明是本站的上限），送出鈕 SHALL 禁用，SHALL 沒有請求

### Requirement: 未儲存就關要確認；送出中不可關；重開從身分初始化

「有未儲存的修改」（dirty）SHALL 定義為：**正規化後的 payload 與初始 payload 不同**（不是 RHF 的 `isDirty`、不是原始字串差異 ——
只改空白、全形逗號、大小寫重複的 skills 正規化後一樣，就不算修改）。
dirty 時**任何關閉意圖**（Escape、面板殼的關閉鈕、表單的「取消」）SHALL 先問（確認層，鍵盤可操作，Escape 關確認層等於「繼續編輯」）：
「丟棄」→ 丟棄、回到顯示；「繼續編輯」→ 留在表單、值不變。送出中**任何關閉意圖** SHALL 無效，直到請求結束。
面板每次打開 SHALL 從目前身分初始化，SHALL NOT 沿用上次的草稿。

#### Scenario: [FE-A04-S09] 有修改要關：先問；三種關法都一樣

- **WHEN** 改了 `bio` 沒送，按 Escape
- **THEN** SHALL 出現確認；按「繼續編輯」SHALL 留在表單且 `bio` 不變、確認層消失
- **WHEN** 再按面板殼的關閉鈕
- **THEN** 確認 SHALL 再出現；按「丟棄」SHALL 回到顯示、`bio` 顯示的是身分目前的值
- **WHEN** 再按「編輯」，只把 `skills` 從 `React, TypeScript` 改成 `React，  typescript`（正規化後相同），按「取消」
- **THEN** SHALL **不問**，直接回到顯示

#### Scenario: [FE-A04-S10] 送出中關不掉：三種關法都無效

- **WHEN** 送出後請求還沒回來，按 Escape、按面板殼的關閉鈕、按「取消」
- **THEN** 表單 SHALL 仍在、面板 SHALL 仍開著；請求回來（成功）之後 SHALL 回到顯示

#### Scenario: [FE-A04-S11] 重開從身分初始化

- **WHEN** 改了 `bio` 沒送、丟棄、關面板、再開、按編輯
- **THEN** `bio` 欄 SHALL 是身分目前的值，不是上次改的
