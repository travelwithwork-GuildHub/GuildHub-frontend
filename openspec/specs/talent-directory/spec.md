# talent-directory Specification

## Purpose
人才看板按 E 開出來的那份清單裡，每一張卡讓發案者一眼判斷「會不會我要的」與「有沒有時間」，
點進去看得到完整的名片。

卡片放名字、角色外觀（跟世界裡同一個 `avatar_id` 一致）、技能、每週可投入時數；
`bio` 與 `updated_at` 不上卡片 —— 後者是名片更新時間，放上去會被讀成「最近活躍」。
詳情在同一個面板內蓋在列表上，**一律**打 `GET /api/profiles/{id}`（列表那一筆只當可辨識的
載入中預覽），返回時列表的頁碼與捲動位置都還在。卡片是可聚焦的控制項，滑鼠與鍵盤都開得了。

這一份**不**決定 Escape 在詳情層是退一層還是關面板 —— 那是 `FE-X06` 的全域契約；
也不做在線狀態（`FE-R10`）、編輯（`FE-A04`）、邀請與短名單（`FE-M06`）、深連結（`FE-B09`）。

## Requirements

### Requirement: 人才卡讓人一眼判斷「會不會我要的」與「有沒有時間」

人才卡 SHALL 呈現名字、角色外觀、技能與每週可投入時數。
`hours_per_week` 為 `null` 時 SHALL 可辨識為「未提供」，SHALL NOT 呈現為 0。
人才卡 SHALL NOT 呈現 `bio`，也 SHALL NOT 呈現 `updated_at`。

⚠️ **`updated_at` 是名片更新時間，不是活躍時間。** 放上卡片會被讀成「最近活躍」。
`bio` 長度不定，在 26rem 的面板裡會把卡片高度弄亂，而且常常只是重複技能。

#### Scenario: [FE-B04-S01] 卡片上有名字、外觀、技能、時數，外觀跟世界裡的同一個人一致

- **WHEN** 以一筆有技能、有時數的 `ProfileOut` 掛載人才卡，再以只差 `avatar_id` 的另一筆掛載
- **THEN** 卡片 SHALL 呈現 `display_name`、每一項 `skills`、`hours_per_week`
- **AND** 兩張卡的外觀色 SHALL 不同，且各自等於世界裡同一個 `avatar_id` 用的那個顏色

#### Scenario: [FE-B04-S02] 沒有時數不是 0 小時

- **WHEN** 以 `hours_per_week: null` 的 `ProfileOut` 掛載人才卡
- **THEN** 卡片 SHALL NOT 出現 `0`
- **AND** 時數的位置 SHALL 是一個標示為「未提供」的節點（機器可辨識，不是空白）

#### Scenario: [FE-B04-S03] `bio` 與 `updated_at` 不上卡片

- **WHEN** 以 `bio` 含一段哨兵字串、`updated_at` 是一個不會出現在別處的年份的 `ProfileOut` 掛載人才卡
- **THEN** 卡片 SHALL NOT 含那段哨兵字串、SHALL NOT 含那個年份，也 SHALL NOT 含任何時間元素

### Requirement: 卡片是控制項，滑鼠與鍵盤都開得了詳情

人才卡 SHALL 是可聚焦的控制項；以滑鼠點擊或以鍵盤啟動（Enter／Space）SHALL 開啟**那一筆**的詳情。

⚠️ **這一條的反面畫面上看不出來**：做成只有滑鼠能點的 `div`，滑鼠使用者完全正常，
鍵盤使用者 Tab 不到、Enter 沒反應。

#### Scenario: [FE-B04-S04] 點卡片開的是那一筆

- **WHEN** 列表有多筆，使用者點擊其中第 N 筆的卡片
- **THEN** 詳情 SHALL 是第 N 筆的 profile，且送出的詳情請求 SHALL 帶第 N 筆的 `id`

#### Scenario: [FE-B04-S05] 鍵盤也開得了：Enter 與 Space 各一次

- **WHEN** 焦點以 Tab 移到某張卡片，使用者按 Enter；另一次改按 Space
- **THEN** 兩次詳情都 SHALL 開啟

### Requirement: 詳情在同一個面板裡，內容一律來自 `GET /api/profiles/{id}`

詳情 SHALL 在目前的面板內蓋在列表上，呈現名字、角色外觀、完整技能、時數、完整 `bio`
與名片更新時間；缺值 SHALL NOT 被捏造成有效值。

每一次開啟詳情 SHALL 以該 `id` 請求 `GET /api/profiles/{id}`，成功回應才是詳情的正式資料。
列表手上的那一筆得作為**可辨識的載入中預覽**；請求成功前 SHALL NOT 宣告詳情載入完成，
請求失敗後 SHALL NOT 讓預覽看起來像成功取得的詳情。

⚠️ **為什麼明明同一個形狀還要打。** `FE-A04` 會讓人編輯自己的名片，編輯之後列表是舊的。
詳情用列表資料就是舊的 —— 而那是 bug。一律打 id 也讓 `FE-B09` 的深連結走同一條路徑。

#### Scenario: [FE-B04-S06] 詳情呈現的是回應，不是列表那一筆

- **WHEN** 列表那一筆的 `bio` 與詳情端點回的 `bio` 不同
- **THEN** 詳情載入完成後呈現的 SHALL 是詳情端點回的那一個

#### Scenario: [FE-B04-S07] 載入中是可辨識的載入中

- **WHEN** 詳情請求尚未回應
- **THEN** 詳情 SHALL 處於可辨識的載入中狀態
- **AND** 列表那一筆的名字 SHALL 已經看得到（預覽）

#### Scenario: [FE-B04-S08] 載入失敗看得出失敗，不像成功

- **WHEN** 詳情請求回 500
- **THEN** 詳情 SHALL 呈現 `FE-X04` 的載入失敗狀態
- **AND** SHALL NOT 處於載入完成狀態

#### Scenario: [FE-B04-S15] 詳情的 401 是權限阻擋

- **WHEN** 詳情請求回 401
- **THEN** 詳情 SHALL 呈現 `FE-X04` 的權限阻擋狀態，不是載入失敗

#### Scenario: [FE-B04-S09] 快速連點不同人，晚到的舊回應不覆蓋

- **WHEN** 使用者先開 A 再開 B，而 A 的詳情回應較晚到達
- **THEN** 詳情呈現的 SHALL 是 B

#### Scenario: [FE-B04-S10] 詳情上的欄位與缺值

- **WHEN** 詳情端點回一筆 `hours_per_week: null`、`bio: null` 的 profile
- **THEN** 詳情 SHALL 呈現名字、每一項技能、名片更新時間（一個 `dateTime` 等於 `updated_at` 的時間元素）
- **AND** 時數與 `bio` 的位置 SHALL 各是一個標示為「未提供」的節點，SHALL NOT 出現 `0`

### Requirement: 返回列表時，頁碼與捲動位置都還在

從詳情返回列表，列表 SHALL 仍然是離開時的那一頁與捲動位置，且 SHALL NOT 重新請求列表。

⚠️ 沒有這一條，每看一個人就被送回第一頁頂端 —— 連續看幾個人的任務流會斷掉。

#### Scenario: [FE-B04-S11] 第二頁進去、第二頁回來，沒有重打列表

- **WHEN** 列表在第二頁，使用者開啟某一筆的詳情再返回
- **THEN** 列表 SHALL 仍呈現第二頁的項目
- **AND** SHALL NOT 送出新的列表請求

#### Scenario: [FE-B04-S12] 捲動位置還在，而且列表沒有被藏成 `display: none`

- **WHEN** 列表捲到某個位置，使用者開啟詳情再返回
- **THEN** 列表的捲動位置 SHALL 與離開時相同
- **AND** 詳情顯示期間列表元素 SHALL 仍在 DOM 裡且 SHALL NOT 是 `display: none`

> jsdom 沒有排版引擎，`display: none` 的元素在它那裡 `scrollTop` 照樣留著、真瀏覽器不留 ——
> 只驗 `scrollTop` 抓不到那種實作。

#### Scenario: [FE-B04-S16] 詳情顯示時列表區是 `inert`

- **WHEN** 詳情顯示中
- **THEN** 列表區 SHALL 帶 `inert`；返回列表後 SHALL NOT 帶

> jsdom 認得 `inert` 這個屬性但不實作它的行為 —— 這一條驗的是「有沒有下達指示」，
> 「不可聚焦、不可點」由真瀏覽器驗。

### Requirement: 詳情層的鍵盤不驅動世界，Escape 照今天的全域契約

詳情顯示中按下移動鍵，世界裡的角色 SHALL NOT 移動。
詳情顯示中按下 Escape，詳情 SHALL 不再顯示，且面板 SHALL 依今天的全域契約（`FE-B01-S16`）
關閉、世界的移動輸入 SHALL 恢復作用。

⚠️ **這一列不決定 Escape 是退一層還是關面板。** 那是 `FE-X06` 的全域契約；
它改變的那天，`S14` 跟著改（規格審查：寫一條今天到不了的分支是死的判準，不寫）。

#### Scenario: [FE-B04-S13] 詳情開著按方向鍵，人不動

- **WHEN** 詳情顯示中，使用者按下移動鍵
- **THEN** 世界裡的角色 SHALL NOT 移動

#### Scenario: [FE-B04-S14] 詳情開著按 Escape

- **WHEN** 詳情顯示中，使用者按下 Escape
- **THEN** 詳情 SHALL 不再顯示，面板 SHALL 關閉
- **AND** 世界的移動輸入 SHALL 恢復作用
