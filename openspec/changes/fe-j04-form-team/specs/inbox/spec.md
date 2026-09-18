## Applicability

權限：適用 —— 只有已登入的人有收件匣；草稿入口只從 owner 的案件詳情來
併發：不適用
持久資料相容性：適用 —— 草稿（含密碼）SHALL NOT 落地
失敗路徑：適用 —— 帶草稿開了又關、不寄
測試連到什麼：單元判準只連本機自起的 `contract-server` 替身

## MODIFIED Requirements

### Requirement: 收件匣是阻斷式面板，兩個入口

已登入時標題列 SHALL 有一個 `button`「收件匣」；按下 SHALL 開收件匣面板（`data-testid="inbox-panel"`，`PanelShell`：持世界輸入鎖、focus trap、Escape 關），關閉後焦點 SHALL 回那個按鈕。
別人的名片（`TalentDetail`）在已登入時 SHALL 有一個 `button`「寄信給他」：按下 SHALL 關掉看板面板、開收件匣面板並直接進入跟那個人的對話（`data-testid="inbox-thread"`，`data-with` 是對方 id）；
交接完成後（同一個 commit 之後）焦點 SHALL 在收件匣面板內、世界輸入鎖 SHALL 持有；這樣開的面板關閉後焦點 SHALL 回世界焦點錨（`[data-focus-anchor="world"]`），因為開啟者已經不在了。
自己的名片（`ProfilePanel`）SHALL NOT 有寄信鈕；未登入時 SHALL 沒有「收件匣」按鈕，人才詳情也 SHALL 沒有「寄信給他」。
第三個入口（`FE-J04`）：案件詳情成軍成功後的「用私訊寄出」SHALL 關掉看板面板、開收件匣**清單**（不進任何對話）並帶著一段草稿；之後進入任一對話時寄信的輸入框 SHALL 以那段草稿為初始值；
寄出成功或收件匣關閉後草稿 SHALL 清掉（下一次進對話輸入框是空的）。這樣開的面板關閉後焦點 SHALL 回世界焦點錨（開啟者已經不在了）。
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

#### Scenario: [FE-J04-S11] 帶著草稿開收件匣：清單、草稿進對話、寄出後清掉、關閉後清掉

- **WHEN** 已登入的人從案件詳情以草稿 `X` 開收件匣
- **THEN** 收件匣 SHALL 開在清單（`data-testid="inbox-panel"`，沒有 `inbox-thread`）、看板面板 SHALL 已關閉、焦點 SHALL 在收件匣內
- **AND WHEN** 進入某一個對話
- **THEN** 寄信輸入框的值 SHALL 是 `X`
- **AND WHEN** 寄出成功後回清單再進另一個對話
- **THEN** 輸入框 SHALL 是空的
- **AND WHEN** 另一次：帶著草稿開收件匣後直接關閉（Escape），再從標題列按「收件匣」進對話
- **THEN** 輸入框 SHALL 是空的

