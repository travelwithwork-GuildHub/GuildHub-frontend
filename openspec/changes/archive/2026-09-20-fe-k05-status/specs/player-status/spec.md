## Purpose

世界裡的每個人可以掛一句最多 12 字的狀態（「趕工中」「找人聊聊」⋯⋯），別人在他的名字牌上看得到；
清掉就消失。它走既有的即時協定 `status`（伺服器驗 12 字、廣播給整個場景、每次進場清空），
所以前端要做的是：一個送得出去、超過上限就送不出去的控制；換場景與重連之後自己再送一次；
把名單裡別人的 `st` 畫到名字牌上而不動牌子的尺。這是 demo 兩個瀏覽器互見時「這個人現在怎麼了」的那一層。

## Applicability

權限：適用 —— 只有已登入（`signed-in`）的人有「狀態」控制；訪客沒有（訪客沒有連線身分）
併發：適用 —— 送出中再按、連線換了（過場、重連）狀態要跟過去、`status` 訊息與 `snapshot` 的 `st` 同時到
持久資料相容性：不適用 —— 不讀寫 Web Storage（伺服器每次 `join` 清空，前端跟它一致）
失敗路徑：適用 —— 超過 12 字、連線沒 ready、名單裡沒有的 id 送來 `status`
測試連到什麼：單元判準不連任何外部服務（socket 用替身）；真瀏覽器判準只打本機自起的 `next start`，WebSocket 用 `routeWebSocket` 偽造、REST 用 `page.route` 偽造，兩個瀏覽器之間的 `status` 由測試腳本在假 socket 之間轉送。不連任何團隊共用的位址。

## ADDED Requirements

### Requirement: 已登入的人可以設定、換掉、清除一句最多 12 字的狀態；超過上限送不出去；沒有連線不送

世界的 HUD SHALL 有一個「狀態」控制，只給 `signed-in` 的人：SHALL 有幾個一按即送的快捷狀態（清單是產品常數，不進契約）、
一格自由輸入、一顆清除。文字上限是 **12 字**（`LIMITS.statusText.max`，跟後端 `STATUS_MAX_CHARS` 同源；長度以 `String.length` 計 ——
跟契約 schema 同一把尺，比後端的 code point 嚴、不會送出後端會丟掉的東西）。自由輸入 SHALL 顯示還可以輸入幾字；
超過 12 字時送出 SHALL 停用、SHALL NOT 送出任何訊息（後端對超長是**靜默丟棄**，前端不能讓使用者以為送出去了）。
送出 SHALL 是目前場景的連線上一則 `{"t":"status","text":<文字>}`；清除 SHALL 送 `text: ""`。
連線沒有 ready（過場中、斷線）時 SHALL NOT 送、SHALL 有一則可辨識的回饋（`role="status"`），且之後仍能操作。
自己目前的狀態 SHALL 在控制上看得到（自己沒有名字牌）；送出成功（伺服器回聲到達）之前 SHALL NOT 先把控制畫成已生效。
自由輸入有焦點時 SHALL 鎖住世界的鍵盤（`FE-K04` 同一道 `EditableFocusLock`），Escape SHALL 放掉焦點。

#### Scenario: [FE-K05-S01] 按快捷狀態：連線上恰好一則 status、payload 對；回聲到了控制才顯示目前狀態

- **WHEN** 已登入、連線 ready，按快捷狀態「趕工中」
- **THEN** 連線 SHALL 收到恰好一則 `{"t":"status","text":"趕工中"}`，控制 SHALL 呈現送出中、SHALL NOT 已把「趕工中」畫成目前狀態
- **AND WHEN** 伺服器回聲 `{"t":"status","id":<自己>,"text":"趕工中"}` 到達
- **THEN** 控制 SHALL 呈現目前狀態是「趕工中」；名單 SHALL NOT 多出自己（`FE-R05`：自己不在名單裡）

#### Scenario: [FE-K05-S02] 自由輸入：12 字可送、13 字送不出去且看得到超過；清除送空字串

- **WHEN** 在自由輸入打 12 個全形字
- **THEN** 剩餘字數 SHALL 是 0、送出 SHALL 可按，按下連線 SHALL 收到那 12 個字
- **AND WHEN** 打第 13 個字
- **THEN** 送出 SHALL 停用、SHALL 可辨識已超過上限、連線 SHALL NOT 多收任何訊息
- **AND WHEN** 按清除
- **THEN** 連線 SHALL 收到 `{"t":"status","text":""}`；回聲到達後控制 SHALL 呈現沒有狀態

#### Scenario: [FE-K05-S03] 連線沒 ready：不送、有回饋、之後還能送；訪客沒有控制

- **WHEN** 連線還沒 ready（過場中）按快捷狀態
- **THEN** SHALL NOT 送出任何訊息、SHALL 有一則 `role="status"` 的回饋（不宣稱原因是密碼或權限）
- **AND WHEN** 連線 ready 之後再按一次
- **THEN** 連線 SHALL 收到那一則
- **AND WHEN** 身分是訪客（`guest`）或還不知道（`unknown`）
- **THEN** SHALL NOT 有「狀態」控制

### Requirement: 換場景、重連之後自己的狀態要再送一次；空的不送

伺服器每次 `join` 都把那個人的狀態清成空（`presence.py`：新連線就是新的 `Player`）。所以每一條**新連線 ready 之後**，
自己目前的狀態非空時前端 SHALL 在那條連線上再送一次同樣的 `status`；狀態是空的 SHALL NOT 送。
重送 SHALL 只發生在連線 ready 之後（沒 ready 就送會拋）、每條連線恰好一次。

#### Scenario: [FE-K05-S04] 進房：新連線 ready 後恰好再送一次；空狀態的人一則都不送；舊連線不補送

- **GIVEN** 自己的狀態是「趕工中」（回聲已到），從大廳走進房間（新的一條連線）
- **WHEN** 房間那條連線 ready
- **THEN** 房間那條連線 SHALL 收到恰好一則 `{"t":"status","text":"趕工中"}`；大廳那條（已關）SHALL NOT 再收到任何訊息
- **AND WHEN** 同一場景斷線重連、新連線 ready
- **THEN** 新連線 SHALL 再收到一則
- **AND WHEN** 狀態是空的，換場景
- **THEN** 新連線 SHALL NOT 收到任何 `status`

### Requirement: 別人的狀態畫在他的名字牌上；沒有就沒有；不改牌子的尺

名單裡 `st` 非空的遠端玩家，他的名字牌 SHALL 多一段狀態文字（`snapshot` 帶來的 `st` 與之後的 `status` 訊息都算）；
`st` 是空字串的人 SHALL NOT 有那一段。狀態文字 SHALL 是牌子節點的一部分（跟著牌子每幀走、牌子 hidden 一起 hidden），
牌子本身的幾何 SHALL NOT 改變：寬 176、高 28、底邊中點對錨點（`FE-W08-S04`／`S07` 的尺不變，狀態往上長不往下）。
狀態文字 SHALL 單行、超過牌子寬度截字。`status` 訊息只改文字：牌子的**位置** SHALL 仍由 render loop 直接寫、不經過 React
（名單改變可以重繪牌子的內容，那是低頻）。名單裡沒有的 id 送來 `status` SHALL 不畫（既有規則 `FE-R10-S04`）。

#### Scenario: [FE-K05-S05] 兩個人一個有狀態一個沒有：一塊牌子有那段、一塊沒有；牌子的寬高不變

- **WHEN** `snapshot` 有甲（`st: "趕工中"`）與乙（`st: ""`）
- **THEN** 甲的牌子 SHALL 含「趕工中」、乙的牌子 SHALL NOT 含任何狀態節點；兩塊牌子的名字部分 SHALL 仍是 176×28、底邊中點在錨點

#### Scenario: [FE-K05-S06] status 訊息換掉、清空、不認識的 id

- **WHEN** 收到 `{"t":"status","id":乙,"text":"找人聊聊"}`
- **THEN** 乙的牌子 SHALL 含「找人聊聊」
- **AND WHEN** 收到 `{"t":"status","id":乙,"text":""}`
- **THEN** 乙的牌子 SHALL NOT 含狀態節點
- **AND WHEN** 收到 `{"t":"status","id":<名單裡沒有的 id>,"text":"鬼"}`
- **THEN** SHALL NOT 多出任何牌子或狀態節點

#### Scenario: [FE-K05-S07] 12 個全形字的狀態：單行、不超出牌子寬度；牌子的位置不經 React

- **WHEN** 甲的 `st` 是 12 個全形字
- **THEN** 狀態節點 SHALL 是單行、寬度 SHALL ≤ 176、`overflow` 截字
- **AND WHEN** 甲移動（`pos`）
- **THEN** 牌子（含狀態）的位置 SHALL 每幀更新而牌子元件 SHALL NOT 重繪（`FE-W08-S05` 同一個判準，加了狀態之後仍成立）

### Requirement: 真瀏覽器裡兩個人互見狀態、清除、換場景後仍在

這條的判準 SHALL 在真瀏覽器裡對本機自起的 `next start` 跑（兩個瀏覽器各一個身分；WS 用 `routeWebSocket` 偽造，
測試腳本把 A 送出的 `status` 轉成 `status` 廣播送進 B 的假 socket，並模擬伺服器的回聲與 `join` 清空）。

#### Scenario: [FE-K05-S08] 真瀏覽器：A 設狀態 B 看到、A 清除 B 看不到、兩人進房後 B 仍看到 A 的狀態

- **GIVEN** A、B 各一個瀏覽器，都在大廳、互相在名單裡
- **WHEN** A 按快捷狀態「趕工中」
- **THEN** A 的假 socket SHALL 收到 `{"t":"status","text":"趕工中"}`；轉送後 B 畫面上 A 的名字牌 SHALL 含「趕工中」、牌子的名字部分高度 SHALL 仍是 28 px
- **AND WHEN** A 清除
- **THEN** B 畫面上 A 的牌子 SHALL NOT 含狀態
- **AND WHEN** A 再設「找人聊聊」、A 與 B 各自進同一間房（新連線）
- **THEN** A 的房間連線 ready 後 SHALL 收到一則 `{"t":"status","text":"找人聊聊"}`（重送）；轉送後 B 在房間裡 SHALL 看到 A 的牌子含「找人聊聊」
