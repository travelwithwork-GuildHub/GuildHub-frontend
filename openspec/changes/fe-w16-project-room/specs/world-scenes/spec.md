## Applicability

權限：不適用 —— 本 delta 不改票或授權。
併發：不適用 —— 只改房間配置的來源。
持久資料相容性：不適用。
失敗路徑：適用 —— 房間配置的判準（見 `project-room-layout`）要紅。
測試連線：單元不連任何服務。

## MODIFIED Requirements

### Requirement: 場景是一份封閉的註冊表，渲染、物理、連線、出生點都從它讀

系統 SHALL 有一份場景註冊表，場景的引用是 `{ id: 'hall' } | { id: 'room', projectId }` 這個封閉聯集；
`projectId` 的合法域 SHALL 是 uuid（小寫 canonical；跟 `deep-link` 的 `room` 參數、`GET /api/rooms` 的 `project_id` 同一個域），
不是 uuid 的 `projectId` SHALL 在查註冊表時明顯失敗（拋錯），MUST NOT 被組成 `room:<任意字串>` 送出去。
後端的 `^(lobby|room:[0-9a-zA-Z\-]+)$` 是它的超集；前端只用其中的 uuid 子集。

每個場景 SHALL 從註冊表推導出：交給 WebSocket 的 `scene` 查詢參數（`hall` → `lobby`；`room` → `room:<projectId>`）、
配置（`world-layout` 的 `LayoutItem[]`）、出生點、以及要不要帶票（只有 `room`）。

渲染配置的元件、建立碰撞體的物理層、建立即時連線的元件、放置本地角色的出生點，四者 SHALL 都從同一份註冊表讀，
MUST NOT 各自寫死 `lobby` 或直接 import Guild Hall 的配置。

只屬於 Guild Hall 的東西 —— 走廊的門、兩塊看板、門標籤、專案清單的提示與 `GET /api/rooms` 的輪詢 ——
SHALL 只在 `hall` 場景掛載；在 `room` 場景 MUST NOT 掛載（不是隱藏，是不存在於元件樹）。

Project Room 的配置與出生點 SHALL 由 `project-room-layout` 提供（外層四面 `role: 'boundary'` 的邊界牆與 Guild Hall 同一份推導、
內側南牆與門洞、八個工位）；它 SHALL 通過 `world-layout` 對 Guild Hall 配置跑的同一組判準（識別字不重複、沒有東西擺到區域外、邊界只來自配置）。

#### Scenario: [FE-V01-S01] 兩個場景推導出的 scene 參數，合法與不合法的邊界

- **WHEN** 對 `{ id: 'hall' }` 與 `{ id: 'room', projectId: '3f2b0a1c-…'（小寫 uuid）}` 各查一次註冊表
- **THEN** `wsScene` SHALL 分別是 `lobby` 與 `room:3f2b0a1c-…`；`needsToken` SHALL 分別是 `false` 與 `true`
- **AND** 兩者的 `spawn` SHALL 都落在各自配置的遊玩區域內、不在任何碰撞體裡
- **AND WHEN** `projectId` 是 `''`、`abc`、`3F2B…`（大寫）、`a/b`、`room:x`、含底線
- **THEN** 查註冊表 SHALL 拋錯，一個都不得產出 `wsScene`

#### Scenario: [FE-V01-S02] 房間的配置通過 world-layout 的判準

- **WHEN** 對 Project Room 的配置跑 `FE-W11-S05`／`S07`／`S08` 的檢查
- **THEN** SHALL 全部通過；`role: 'boundary'` 的邊界牆 SHALL 恰好四面（外層）；配置 SHALL 是 `project-room-layout` 提供的那一份（內容由它的規格定義）
- **AND** 註冊表交給物理層的碰撞盒 SHALL 多於四面邊界（含 `project-room-layout` 的內側南牆與桌椅）

#### Scenario: [FE-V01-S03] 房間裡沒有走廊的門與看板，也不輪詢專案清單

- **WHEN** 場景是 `room`，掛載世界，並把假時鐘推進到超過 `GET /api/rooms` 的兩個輪詢週期
- **THEN** 互動系統裡 SHALL 沒有任何 `door:`／看板的註冊；整段期間 SHALL 沒有送出任何 `GET /api/rooms`；門標籤的 DOM SHALL 不存在
- **AND WHEN** 場景是 `hall`，同樣推進時鐘
- **THEN** 以上三者 SHALL 都存在（這條防的是「兩邊都拿掉」也綠）
