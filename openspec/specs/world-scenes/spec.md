# world-scenes Specification

## Purpose
「現在在哪個場景」是**一份資料、一個入口**，不是散在閘門、連線、環境、出生點四處的 `if`。
場景的引用是封閉聯集 `{ id: 'hall' } | { id: 'room', projectId }`；渲染的配置、物理的出生點、
即時層要連的 `scene`、要不要帶票，都從註冊表推導 —— 再加一個場景是加一列，不是四處各長一個分支。

Guild Hall ↔ Project Room 是**真的伺服器 scene**（`lobby`／`room:<id>`，以後端 `scenes.py`／`manager.py` 為準）：
沒有 switch 訊息，換場景就是關掉舊連線、帶票重開新的。這份規格定義那一整套：過場（狀態機、覆蓋層、
輸入鎖）、進不去（回大廳、一句不宣稱原因的通知、不重試、票留著）、返回、票的持有（sessionStorage、
以身分＋房間為鍵、從不進網址）、以及網址與 history 上「進房間是一層紀錄」。**票怎麼拿到**是 `FE-N08` 的事，
這裡只提供「有票就能進」。

## Requirements

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

### Requirement: 進入房間是關掉舊連線再開新的，Canvas 不重掛

進入房間時系統 SHALL 依序：把舊連線關閉並清理完成（`realtime-client`〈一條連線只屬於一個 scene〉—— 含等舊 socket 的 close 事件，上限 1 秒）、
清空遠端玩家、以 `scene=room:<projectId>&token=<票>` 建立新連線、把本地角色放到房間的出生點、
碰撞體換成房間配置的、位置同步重置（`FE-R03-S06`）。
任何時刻 MUST NOT 同時有兩條**尚未呼叫 `close()`** 的世界連線 —— **含 React Strict Mode 的開發期雙重 effect**
（伺服器那一端何時真的處理完斷線，客戶端證明不了；等 close 事件是降低競態機率，不是證明，見 `realtime-client` 那條）。
舊連線在關閉之後遲到的任何事件（`open`／`message`／`close`）MUST NOT 影響新場景的狀態。

這一切 SHALL NOT 讓 `<canvas>` 重新掛載（`FE-B09-S12` 的同一條判準：element identity）。

> 用 `key` 重掛場景子樹是 design D3 選的手段，**不是這一條的要求** —— 拿掉 `key`、用別的方式做到下面的每一項，同樣合法。

#### Scenario: [FE-V01-S04] 從大廳進房間：舊的先關乾淨、遠端清空、碰撞體換掉、Canvas 是同一個節點

- **GIVEN** 在 Guild Hall（包在 `<StrictMode>` 裡掛載），連線 `ready`，畫面上有兩個遠端玩家
- **WHEN** 以持有的票進入 `room:<id>`
- **THEN** 舊 socket 的 `close()` SHALL 在新 socket 建立**之前**被呼叫，且新 socket SHALL 在舊 socket 的 `close` 事件送達之後才建立（假 socket 在 `close()` 後 50 ms 發 `close` 事件；1 秒上限的那一半是 `FE-V01-S18`）
- **AND** 對舊 socket 事後再發 `open`、`hello`、`snapshot`（含三個新玩家）、`close`，新場景的遠端玩家名單與過場狀態 SHALL 不變
- **AND** 新 socket 的位址 SHALL 含 `scene=room:<id>` 與 `token=<票>`；整個過程 `createSocket` 對房間 SHALL 只被呼叫一次（Strict Mode 下也是）
- **AND** 新連線 `ready` 之前，遠端玩家 SHALL 是零個；`ready` 之後 SHALL 只有新 `snapshot` 裡的人
- **AND** 本地角色的位置 SHALL 是房間的出生點；物理世界裡的靜態碰撞體 SHALL 恰好是房間配置產生的那些（`FE-W11-S08` 的判準跑在房間配置上）；`ready` 之後第一筆 `move` SHALL 立刻送出、內容是出生點（`FE-R03-S06`）
- **AND**（瀏覽器）一開始抓住的 `canvas` element handle SHALL 仍 `isConnected`，且頁面上只有一個 `canvas`

### Requirement: 過場只提交一次，遲到的事件不算數

每一次過場 SHALL 有自己的代號；`ready`、`closed`、逾時計時器、最短顯示計時器 SHALL 都以代號比對，
不屬於當前過場的一律忽略。過場的完成或失敗 SHALL 只提交一次；提交之後其餘計時器 SHALL 取消。

#### Scenario: [FE-V01-S15] 上一次過場的事件遲到，不會把這一次打回大廳

- **GIVEN** 進入 `room:a` 的過場開始後 5 秒（假時鐘），房間 socket 還沒 `open`，使用者按「回到 Guild Hall」，大廳連線在 1 秒內 `ready`
- **WHEN** 之後房間的假 socket 才發 `close`（`code=1006`、從沒 `open` —— 跟握手被拒同形）；假時鐘推到第一次過場的 10 秒逾時點；
  **並且**測試把第一次過場排下的逾時 callback（從假計時器取得的引用）在大廳 `ready` 之後直接呼叫一次（模擬計時器在被取消前的那一瞬間已經觸發）
- **THEN** 三件事之後場景 SHALL 都仍是 `hall`、SHALL 沒有 `role="alert"` 的通知、`createSocket` SHALL 沒有被再呼叫、網址 SHALL 是 `/world`

> 這些事件本來就會遲到（socket 的 close 是非同步的；計時器要嘛被取消、要嘛已經在佇列裡）。
> 直接呼叫舊 callback 是為了讓「取消計時器」不足以讓這條綠 —— 防禦是**代號比對**，不是取消。
> 突變是「不比對代號」：那時遲到的 close 或 callback 會被當成失敗，多一次大廳重連與一則通知。

### Requirement: 過場看得見、讀得到，而且不閃

過場期間系統 SHALL 顯示一個 DOM 覆蓋層（`role="status"`、`aria-busy="true"`），文字指名目的地
（「前往 <房間名>⋯⋯」或「回到 Guild Hall⋯⋯」）；房間名來自 `GET /api/rooms` 已載入的資料，拿不到時 SHALL 寫「前往專案房間⋯⋯」。
覆蓋層 SHALL 至少顯示 **300 ms**，且直到新連線 `ready` 才消失；兩者取較晚者。
最短顯示只延後**覆蓋層的消失**，MUST NOT 延後連線的建立、資源的清理或狀態的提交。
覆蓋層獨立於 Canvas 內的 `Suspense`：子樹的 fallback（`null`）出現時覆蓋層仍蓋著；子樹載入失敗走 `FE-X01-S04` 既有的路徑，覆蓋層 SHALL 消失。

#### Scenario: [FE-V01-S05] 瞬間完成的過場也不閃

- **WHEN** 開始進入房間，新連線在 1 ms 內 `ready`（假時鐘）
- **THEN** 在 299 ms 時覆蓋層 SHALL 仍在、文字 SHALL 含房間名；在 300 ms 時 SHALL 消失
- **AND** 在 1 ms 時場景狀態 SHALL 已經是 `in(room)`（提交沒有被 300 ms 延後）
- **AND WHEN** 另一次過場的 `ready` 在 2 秒才到
- **THEN** 覆蓋層 SHALL 在 2 秒時才消失

### Requirement: 過場期間移動輸入鎖住

過場期間移動輸入 SHALL 鎖住（沿用面板開著時那把鎖）；提交之後 SHALL 解鎖。

#### Scenario: [FE-V01-S17] 過場中按住方向鍵，角色不動；提交那一刻就解鎖

- **WHEN** 過場進行中（`ready` 還沒到）按住方向鍵並推進幾幀
- **THEN** 本地角色的位置 SHALL 不變
- **AND WHEN** `ready` 在 1 ms 到了（覆蓋層因 300 ms 最短顯示**還在**）再按
- **THEN** 角色 SHALL 移動（解鎖跟著提交，不跟著覆蓋層）

### Requirement: 進不去就回 Guild Hall、說一句話、不重試、票留著

新連線在 `open` 之前就關閉（`opened === false`），或自呼叫 `connect()` 起 **10 秒**內沒有 `ready`，系統 SHALL 視為進入失敗：
自動回到 Guild Hall（重新以 `scene=lobby`、不帶票建立連線）、網址以 `replaceState` 改回 `/world`（不多一層紀錄）、
顯示一則 `role="alert"` 的通知。通知 MUST NOT 宣稱失敗原因（客戶端分不出來）；語彙固定為
「進不了這間房 —— 可能暫時連不上，或通行證已經失效、房間已經關閉。已回到 Guild Hall。」
系統 MUST NOT 自動重試進入那間房；MUST NOT 丟棄持有的票（連不上跟票失效分不出來，丟票會讓網路瞬斷的人重輸一次密碼；換票是 `FE-N08` 的事）。
通知 SHALL 留到下一次**使用者發起的**成功進入任何場景（按 E、按「回到 Guild Hall」、上一頁）、使用者關閉它、使用者從通知啟動「重新輸入密碼」**且票已確認丟棄、視窗開啟**（`room-entry-gate`，`FE-N08`；丟票失敗時通知留著）、或被下一則通知取代為止。
失敗之後**系統自動**回大廳的那次連線 `ready` MUST NOT 清掉它 —— 大廳的 `hello` 在幾毫秒內就到，清了沒有人看得到通知。

10 秒 SHALL 是一個具名常數、測試可注入；背景分頁的計時器被瀏覽器節流時允許晚觸發（`FE-R04` 管背景分頁）。

回大廳的連線本身也可能失敗 —— 那時過場狀態 SHALL 仍然結束（覆蓋層消失、輸入解鎖、場景是 `hall`），
交給大廳既有的失敗呈現；MUST NOT 永久 busy。

#### Scenario: [FE-V01-S06] 10 秒沒有 hello 就回大廳，票還在、網址不多一層

- **GIVEN** `sessionStorage` 持有 `room:<id>` 的票，在 `/world?panel=profiles`
- **WHEN** 進入房間，新 socket `open` 了但 10 秒內沒有送 `hello`（假時鐘）
- **THEN** 第 10 秒時 SHALL 關閉那條連線、建立 `scene=lobby` 的連線、顯示上述通知；第 9.9 秒時 SHALL 還在過場中
- **AND** 那張票 SHALL 仍在；網址 SHALL 是 `/world`，且瀏覽器上一頁 SHALL 回到 `/world?panel=profiles`（中間沒有一層 `?room=`）

#### Scenario: [FE-V01-S07] 握手被拒：回大廳、不再試

- **WHEN** 進入房間，新 socket 在 `open` 之前就 `close`（`code=1006`）
- **THEN** SHALL 建立 `scene=lobby` 的連線並顯示通知
- **AND** 跑完所有排程中的計時器之後，對 `room:<id>` 的 `createSocket` SHALL 仍只被呼叫過一次
- **AND WHEN** 再走到門前按 E（**沒有**關閉通知）
- **THEN** SHALL 以同一張票再開始一次過場（重試是使用者做的，不是系統做的）；過場開始時那則通知 SHALL 還在
- **AND WHEN** 第二次也被拒
- **THEN** `role="alert"` SHALL 恰好一個（被取代，不是疊兩個）
- **AND WHEN** 使用者關閉通知
- **THEN** SHALL 沒有 `role="alert"` 的元素
- **AND WHEN** 第三次按 E 且這次 `ready`；接著再讓第四次被拒、然後按「回到 Guild Hall」成功
- **THEN** 第三次 `ready` 時 SHALL 沒有 alert；第四次之後有一個；回大廳成功後 SHALL 沒有（使用者發起的成功進入都清）
- **AND** 每一次被拒之後系統自動回大廳的那條連線 `ready` 時，alert SHALL 仍在

#### Scenario: [FE-V01-S16] 回大廳也連不上時，不會永久 busy

- **WHEN** 進入房間被拒，接著大廳的連線也在 `open` 之前關閉
- **THEN** 覆蓋層 SHALL 在大廳連線關閉時消失、輸入 SHALL 解鎖、場景 SHALL 是 `hall`
- **AND** SHALL 沒有第三條連線被建立

### Requirement: 房間裡隨時回得了 Guild Hall

`room` 場景 SHALL 常駐一顆 DOM 按鈕「回到 Guild Hall」（在標題列，不被 Canvas 蓋住），`hall` 場景 SHALL 沒有它。
按下 SHALL 走同一套過場：關房間連線、以 `scene=lobby` 不帶票重連、角色放到 Guild Hall 出生點、網址 `pushState` 成 `/world`（`deep-link` 那條）。
回大廳 MUST NOT 丟棄持有的票。

#### Scenario: [FE-V01-S13] 按「回到 Guild Hall」

- **GIVEN** 在 `room:<id>`，連線 `ready`
- **WHEN** 按下「回到 Guild Hall」
- **THEN** 房間 socket SHALL 先關閉，新 socket 的位址 SHALL 是 `scene=lobby` 且**沒有** `token`；網址 SHALL 是 `/world`
- **AND** `sessionStorage` 裡那間房的票 SHALL 仍在
- **AND WHEN** 瀏覽器上一頁
- **THEN** 網址 SHALL 回到 `/world?room=<id>` 並開始進房間的過場（證明按鈕是 `pushState` 不是 `replaceState`／`back()`）；頁面 SHALL 沒有整個重新載入
- **AND WHEN** 場景是 `hall`
- **THEN** 那顆按鈕 SHALL 不存在於 DOM

#### Scenario: [FE-V01-S19] 上一頁進到進不去的房：失敗處置一樣，網址不留一層

- **GIVEN** 從 `room:<id>` 按「回到 Guild Hall」回到大廳（紀錄是 `…?room=<id>` → `/world`）
- **WHEN** 瀏覽器上一頁，這次房間的 socket 在 `open` 之前就 `close`
- **THEN** SHALL 建立 `scene=lobby` 的連線、顯示通知；網址 SHALL 是 `/world`（`replaceState`）
- **AND WHEN** 再按瀏覽器上一頁
- **THEN** 網址 SHALL 是進房間**之前**的那一筆（不是 `?room=<id>`）—— 失敗那一格被 replace 掉了

### Requirement: 票由前端持有，鍵含身分，不進網址

系統 SHALL 提供持有／讀取／丟棄某間房的票的入口，儲存在 `sessionStorage`，鍵是 `guildhub.roomToken.<profileId>.<projectId>`
（含身分：同一個分頁登出再登入另一個帳號，MUST NOT 讀到前一個帳號的票）；匿名沒有票（後端不會發給匿名）。
MUST NOT 放進 `localStorage`，MUST NOT 出現在 `/world` 的網址裡（含 history 的每一筆）。系統 MUST NOT 解析票的內容。

> `sessionStorage` 是**可用性**的選擇（重新整理不掉、每分頁一份），**不是安全邊界**：同源 XSS 讀得到它，
> 而「複製分頁」、由 opener 開的分頁會帶走初始副本。安全靠 CSP／輸出安全（`FE-T06`）與後端 8 小時 TTL；
> 「一個身分一條連線」靠下面那條的資格，不靠票不共享。

載入 `/world?room=<id>` 時 SHALL 先等身分查詢結束再決定：持有那間房的票 → 直接進入（走過場）；
沒有 → 網址 canonical 成 `/world`、人在 Guild Hall，顯示一則 `role="status"`（不是 alert）的說明
「這間房需要房間密碼 —— 走到走廊上它的門前按 E。」

怎麼拿到票（密碼、`POST /api/projects/{id}/enter`）不是這裡的事 —— `FE-N08`。

#### Scenario: [FE-V01-S14] 重新整理仍在房間裡；沒有票就回大廳並說明；票從不進網址

- **GIVEN** 已登入為 P，`sessionStorage` 持有 P 對 `room:<id>` 的票 `T`
- **WHEN** 載入 `/world?room=<id>`
- **THEN** 第一條建立的 socket 位址 SHALL 含 `scene=room:<id>` 與 `token=T`；網址 SHALL 保持 `/world?room=<id>`
- **AND** 在載入時、過場中、`ready` 後、按「回到 Guild Hall」後、上一頁後五個時點，`location.href` SHALL 都不含字串 `T`
- **AND WHEN** 以另一個身分 Q 登入同一個分頁，載入同一個網址
- **THEN** 第一條 socket SHALL 是 `scene=lobby`（Q 沒有票，P 的票不得被讀到）；網址 SHALL 被改成 `/world`；SHALL 有 `role="status"` 的上述說明、SHALL 沒有 `role="alert"`

### Requirement: 一個身分一條世界連線，不分 scene

已登入身分的分頁資格 SHALL 只以身分為鍵，MUST NOT 含 scene。同一個分頁換場景 SHALL 不放棄也不重新競爭資格。
`FE-R06-S02` 的每一項（不連線、說明文字、「改用這個分頁」的動作、第一個分頁不被瞬移）對「第二個分頁要進房間」同樣成立。

> 證據：後端 `presence.py` 的 `_players` 是單一 `dict[user_id, Player]`，`join()` 直接覆蓋、`disconnect()` 只查同 scene 的兄弟連線。
> 同一個帳號分頁 A 在 `lobby`、分頁 B 進 `room:x` 的結果是 A 從大廳的 presence 憑空消失、B 斷線時 A 被整個清掉 —— 這是 `BE-G31` 的另一個入口。
>
> 射程跟 `multi-tab` 那條一樣：同一個瀏覽器、同一個 origin、共用協調機制的分頁。不同裝置、不同瀏覽器（`FE-R06-S04`）根治在後端。

#### Scenario: [FE-V01-S12] 第二個分頁想進房間也不連線；同一個分頁換場景不放資格

- **GIVEN** 已登入，分頁 A 在 Guild Hall 持有資格
- **WHEN** 同一身分的分頁 B 載入 `/world?room=<id>`（持有票）
- **THEN** 分頁 B SHALL 不建立任何 world 連線、顯示「你已經在另一個分頁裡開著這個世界」並提供「改用這個分頁」的動作；分頁 A 的角色 SHALL 沒有被瞬移
- **AND WHEN** 分頁 A 從 Guild Hall 進入房間再回來
- **THEN** 分頁 A 的資格 SHALL 從頭到尾沒有釋放也沒有重新取得（lease 的 `release`／`claim` 各只在掛載時發生一次）

> 突變：把當前的 `wsScene` 加進資格的鍵 —— hall→room 與 room→hall 兩次都要紅。
