# project-room-layout Specification

## Purpose

Project Room 的空間：從門口進來、看得到工位區與中央的旁觀通道、走得到每一張桌子、撞到桌椅會停下。
八個工位是穩定的模板（`seat_index` 0–7，後端座位的索引域），渲染與碰撞吃同一份配置，
每個工位有一個投影到螢幕的 DOM 錨點供之後的座位狀態與真瀏覽器驗收使用。
本能力只管空間：不認領座位、不讀容量、不做離開的動作（那是既有的 DOM 按鈕）、不註冊任何互動。

## Applicability

權限：不適用 —— 不取票、不驗票；進房沿用 `world-scenes`。
併發：不適用 —— 配置是靜態資料，不與即時層競寫。
持久資料相容性：不適用 —— 不讀寫持久資料（不讀 `seat_count`，見 design D3）。
失敗路徑：適用 —— 配置本身的判準（識別字重複、擺到區域外、封死出口、遮住角色）要紅；e2e 的尺看不到工位錨點要紅。
測試連線：單元與 jsdom 不連任何服務；e2e 只打 `next start` 的 loopback，REST 用 `page.route`、WebSocket 用 `routeWebSocket` 偽造，
MUST NOT 連任何團隊共用位址。

## ADDED Requirements

### Requirement: 從門口進來：內側南牆的門洞、門洞內側的出生點、外層邊界完整

Project Room 的配置 SHALL 保留外層四面 `role: 'boundary'` 的邊界牆（與 Guild Hall 同一份推導），
並 SHALL 在內側加一道南牆，分成左右兩段、中央留一個沒有碰撞體的門洞；門洞淨寬 SHALL 明顯大於角色直徑。
出生點 SHALL 在門洞內側、不在任何碰撞體裡；從出生點 SHALL 存在不穿越靜態碰撞體的路徑到中央通道與每一個工位的站位。
門洞 SHALL 有出口的視覺（既有 `door` 語意造型，無碰撞體），**寬面朝南（朝相機）**，它在固定相機下的螢幕橫向輪廓 SHALL 不小於角色直徑的投影
（`FE-W18` 量門的那把尺；東西向的門只剩一條細縫，這扇不能是）；MUST NOT 註冊互動。離開房間 SHALL 仍由 `world-scenes` 的「回到 Guild Hall」提供，
MUST NOT 要求走到門前按 E，MUST NOT 踏入門洞就自動離開。

> 拔掉什麼會紅：把內側南牆做成整面 → S01 門廊不可達、S02 封門對照組反轉；在外層邊界挖洞 → `FE-W11-S08`／`FE-V01-S02` 的四面邊界紅；
> 出生點放進門廊牆裡 → S01；門洞加互動 → S07；門轉成東西向 → S05 的輪廓寬度。

#### Scenario: [FE-W16-S01] 出生點安全，通道、八個工位、門廊都走得到

- **WHEN** 把所有靜態碰撞盒依角色半徑膨脹，從房間出生點做連通性搜尋（`FE-W11-S09` 的同一套）
- **THEN** 出生點 SHALL 不在任何膨脹後的碰撞盒裡
- **AND** 中央通道的代表點、八個工位的站位、**門廊的代表點**（內側南牆以南、外層邊界以北）SHALL 都到得了；工位數 SHALL 是 8（不是 0，避免空泛為真）
- **AND WHEN** 在門洞放一段牆
- **THEN** 門廊的代表點 SHALL 不可達（這條判準 SHALL 失敗）
- → 驗於：單元

#### Scenario: [FE-W16-S02] 門洞是內側南牆唯一的通路，而且明顯寬於角色

- **GIVEN** 同一份配置，額外用一段牆把門洞封住（對照組）
- **WHEN** 從出生點做連通性搜尋
- **THEN** 對照組裡門廊的代表點 SHALL 不可達（證明左右兩段牆本身穿不過，不是靠繞路）；沒封的原配置 SHALL 可達
- **AND** 門洞淨寬（兩段牆內側面的距離）SHALL 不小於角色直徑的 2 倍（`FE-W11-S10` 的「明顯大於」在這裡量化：兩個人能錯身）
- **AND** 外層南邊界 SHALL 仍是完整一面：門廊裡向南 SHALL 走不出遊玩區域（外層邊界以南的點不可達）
- → 驗於：單元

### Requirement: 八個工位是穩定的模板，識別字含索引，排列是推導出來的

配置 SHALL 含恰好八個工位模板，`seat_index` 的集合恰好是 {0,…,7}（`SeatClaim.seat_index` 的**全域**索引上限；某個專案哪幾格有效還要 `< seat_count`，
那是 `FE-J13` 的事：它 SHALL 把 `seat_index ≥ seat_count` 的格子明確呈現成不開放）。每個工位 SHALL 由一張既有的 `desk`、一張 `chair` 與一個「站在桌邊」的站位組成，
缺任何一件 SHALL 是配置錯誤；識別字 SHALL 含該索引且全配置唯一。排列 SHALL 是由索引決定的（同一索引永遠同一位置）：0–3 在通道西側、4–7 在東側，各自由北到南；
站位 SHALL 朝向通道（站位在桌子與通道之間）。本能力 MUST NOT 讀 `seat_count`。

> 拔掉什麼會紅：兩個工位共用識別字 → `FE-W11-S05`；工位擺到區域外 → `FE-W11-S07`；少一個工位或索引缺號／重複 → S03 的集合斷言；
> 少一張椅子 → S03 的缺件斷言；站位放到桌子外側 → S03 的朝向斷言。

#### Scenario: [FE-W16-S03] 索引集合恰好 0–7、每個工位三件齊全、排列符合規則

- **WHEN** 產生 Project Room 的配置
- **THEN** 工位的 `seat_index` 集合 SHALL 恰好等於 {0,1,2,3,4,5,6,7}（多一個、少一個、重複都紅）；每個工位 SHALL 各有一張 desk、一張 chair、一個站位，識別字含索引且全配置唯一
- **AND** 0–3 的 x SHALL 小於通道中線、4–7 大於；每側的 z SHALL 隨索引遞增；每個站位 SHALL 落在它的桌子與通道中線之間
- **AND** 八個站位兩兩距離 SHALL 不小於角色直徑的 2 倍
- **AND** 配置 SHALL 通過 `FE-W11-S05`／`S07`／`S08`
- → 驗於：單元

### Requirement: 工位的視覺與碰撞來自同一份配置；桌椅不是互動物件

工位的桌椅 SHALL 走 `world-layout` 既有的路：`LayoutItems` 渲染、`staticBoxesFor` 建碰撞，碰撞從家具的 definition 推導，
MUST NOT 為房間另寫碰撞尺寸或第二份座標。桌椅 MUST NOT 註冊進互動系統；角色站在站位朝向桌子時 `interactionTarget` MUST NOT 指向它，
畫面 MUST NOT 因桌椅出現提示；按 E MUST NOT 送任何請求、開任何面板。

> 拔掉什麼會紅：在 `WorldShell`／`SceneObjects` 的 JSX 裡另畫一張桌子 → S04 的「恰好 8 個」變 9；給桌子註冊 `Interactable` → S07。

#### Scenario: [FE-W16-S04] 房間的正式元件樹畫出來的桌椅＝配置裡的桌椅；刪一張兩邊同時消失

- **WHEN** 用 `room` 場景的**正式元件樹**（`WorldCanvas` 在 `room` 掛的那些：`WorldShell`、`SceneObjects`）渲染，並用 `staticBoxesFor` 建碰撞
- **THEN** 場景圖裡桌子的渲染物件 SHALL **恰好** 8 個、椅子恰好 8 個（不是「至少」）；每一個 SHALL 由識別字對回配置裡的一項；碰撞盒 SHALL 各 8 個
- **AND WHEN** 從配置拿掉 `seat_index=3` 的桌子
- **THEN** 桌子的渲染物件與碰撞盒 SHALL 都變成 7 個，其餘不變
- → 驗於：jsdom（`@react-three/test-renderer`；斷言的是整棵房間子樹的物件數，不是 `LayoutItems` 單獨；不斷言「不拋錯」）

#### Scenario: [FE-W16-S07] 桌子在、撞得到，但不會冒出 E 提示

- **GIVEN** 房間已掛載，配置與碰撞判準確認 `seat_index=0` 的桌子存在
- **WHEN** 把角色經正式的移動與目標選擇路徑帶到它的站位並面向桌子
- **THEN** 互動系統的註冊表 SHALL 沒有任何桌椅或門洞的識別字；`interactionTarget` SHALL 是 null；DOM SHALL 沒有提示
- **AND WHEN** 按 E
- **THEN** SHALL 沒有請求、沒有面板、沒有導覽
- → 驗於：jsdom

### Requirement: 從門口用固定相機看得到工位區與通道，角色不被遮住

角色在出生點、相機在固定偏移時，至少一個工位（桌＋椅）的包圍盒 SHALL 投影在畫面內，中央通道的入口與**門洞**（內側南牆的缺口）SHALL 都在畫面內；
從相機到角色的視線 MUST NOT 與任何靜態物件相交（`FE-W11-S11`／`S12` 的同一套投影）——含內側南牆：
相機在角色南方 12、高 12，牆高 2，牆離角色 d 時視線在牆處的高度是 `12 − 11.5·d/12`，只有 d > 10.4 才會被擋；
出生點離內側南牆 SHALL 近到視線越過它（design D2 的量測）。角色站在任一工位的站位時，視線同樣 MUST NOT 被桌椅擋住。

> 拔掉什麼會紅：把近端工位搬到畫面外 → S05；在出生點 +Z 側放一張高桌 → S05 視線那段；把內側南牆推到離出生點 11 以上 → S05 視線那段；門洞投影出畫面 → S05。

#### Scenario: [FE-W16-S05] 出生點看得到近端工位；出生點與八個站位都不被遮

- **WHEN** 角色在出生點，用固定相機的投影函式投影所有工位的包圍盒、通道入口與門洞
- **THEN** 至少一個工位 SHALL 完整落在畫面內；通道入口與門洞 SHALL 都在畫面內
- **AND** 相機到出生點角色的視線 SHALL 不與內側南牆相交（牆在角色南方、高 2，視線在那裡的高度 SHALL 大於 2）
- **AND WHEN** 角色分別站在出生點與八個站位
- **THEN** 相機到角色的視線 SHALL 都不與靜態物件相交
- **AND** 門造型在畫面上的橫向輪廓 SHALL 不小於出生點角色直徑的投影寬度（同一套投影）
- **AND WHEN** 在相機到出生點角色的視線段上、離角色 2 單位處放一個高 3 的盒子
- **THEN** 視線那段判準 SHALL 失敗
- **AND WHEN** 把門造型轉成東西向（`turns: 1`）
- **THEN** 輪廓寬度那段 SHALL 失敗
- → 驗於：單元

### Requirement: 每個工位有一個投影到螢幕的 DOM 錨點

房間場景 SHALL 為每個工位提供一個可從 DOM 查到的投影位置（`data-seat-index` 0–7 各一），每 frame 依桌面中心的世界座標投影到螢幕
（門標籤的同一套投影）；今天沒有可見內容（`aria-hidden`）。它只在 `room` 場景存在；在 `hall` MUST NOT 存在。
它是 `FE-J13` 放座位狀態的位置，也是真瀏覽器驗收「撞桌子會停」的尺；**它證明不了桌子有畫出來**（錨點與桌子都從配置推導，renderer 壞了錨點還在），
「畫出來」另外用像素證據守（S08）。

> 拔掉什麼會紅：不掛投影器（DOM 還在但不更新位置）→ S08 的里程計量不到位移；錨點在 hall 也掛 → S06。

#### Scenario: [FE-W16-S06] 房間裡八個錨點對得回索引；大廳裡沒有

- **WHEN** 場景是 `room`，掛載世界
- **THEN** DOM SHALL 恰好有八個工位錨點，`data-seat-index` 0–7 各一，全部 `aria-hidden`、沒有文字
- **AND WHEN** 場景是 `hall`
- **THEN** SHALL 一個都沒有
- → 驗於：jsdom

#### Scenario: [FE-W16-S08] 真瀏覽器：從門口出生、桌子有畫出來、走到桌邊、撞桌子會停、通道走得通

- **GIVEN** `next start` 的正式建置；viewport 1280×720、deviceScaleFactor 1；`page.route` 給一扇門與票、`routeWebSocket` 回 `hello`／`snapshot`
  （snapshot 放一名遠端玩家在 `seat_index=0` 的站位）；進房**之前**先取得 Canvas 的 element handle
- **WHEN** 進入房間、等相機收斂（連續兩次讀數差 ≤ 1 px）
- **THEN** 八個工位錨點 SHALL 都落在 Canvas 的範圍內；用 `seat_index` 0 與 4 的錨點（已知世界 x 距離）量出每單位的像素數 s 後，其餘錨點的螢幕位置 SHALL 與模板推導的位置相差 ≤ 2 px
- **AND** 在每個錨點的螢幕位置取樣 5×5 像素，SHALL 與同一畫面上通道中線的地板取樣顏色不同（桌子真的畫在那裡；`avatar-pixels.mjs` 的像素判準寫法）
- **AND** 遠端玩家的像素 SHALL 出現在 `seat_index=0` 錨點旁（同一個像素判準）
- **AND WHEN** 用錨點當里程計（每一小步：按鍵 ≤ 80 ms、等收斂、量一次；步數上限 200）沿中央通道往北走
- **THEN** 角色相對錨點的 z SHALL 前進到通道北端（允許 ≤ 1 px 的回抖，不要求嚴格逐樣本單調）
- **AND WHEN** 從 `seat_index=1` 的站位直接朝它的桌子走
- **THEN** 角色 SHALL 先接近到與該錨點的距離 < 2 單位（證明輸入有生效），之後連續 5 步距離的變化都 ≤ 1 px（撞到桌子的 plateau）；步數上限 60
- **AND WHEN** 繞回通道再走到 `seat_index=2` 的站位
- **THEN** 距離該錨點 SHALL 收斂到站位對應的螢幕距離 ± 3 px
- **AND** 全程 Canvas SHALL 是進房前取得的同一個 element handle；MUST NOT 用固定毫秒判定「走到了」
- → 驗於：e2e
