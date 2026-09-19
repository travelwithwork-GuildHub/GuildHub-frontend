## MODIFIED Requirements

### Requirement: 每個工位有一個投影到螢幕的 DOM 錨點

房間場景 SHALL 為每個工位提供一個可從 DOM 查到的**投影參考點**（`data-seat-index` 0–7 各一）：元素的**中心** SHALL 在相機跟拍時持續更新，
相機收斂後 SHALL 對齊「桌面中心」（世界座標 x、z 取桌子的中心，y 取桌面高度）的螢幕投影，容差 ≤ 1 px（門標籤的同一套投影函式，但對齊點是中心不是左上角）；
座標 SHALL 是有限數（不是 NaN），投影落在畫面外時元素 SHALL 標成 hidden 但仍存在。錨點 SHALL 可以容納一個座位標籤（`FE-J13`）：**沒有內容時** `aria-hidden`、0×0、不接指標事件；**有內容時** SHALL NOT `aria-hidden`、SHALL 接指標事件、內容以錨點的中心為基準排版（標籤的偏移由標籤自己定，錨點的中心仍是投影點）。
它只在 `room` 場景存在；在 `hall` MUST NOT 存在。相機跟著角色（有阻尼），**收斂後**本地角色在畫面中心容差 ≤ 1 px 內（`scene-switch.mjs` 的里程計就靠這點），
所以收斂後「角色相對某個錨點的位置」＝畫面中心到那個錨點的向量。換算世界距離：x 每單位 s px（用兩個已知 x 距離的錨點量出）；
螢幕 y 同時含世界 z 與 y（俯角 45°：`sy = s·(y − z)/√2` 加常數），錨點在桌面高 h、角色的基準在地面，所以反算 z 時 SHALL 先扣掉固定偏移 `s·h/√2`
（h 從家具 definition 讀，不寫死），之後 z 每單位 s/√2 px。
它是給之後座位 UI（`FE-J13`）用的穩定參考點（標籤放不放在這個點、偏多少由 J13 定），也是真瀏覽器驗收「撞桌子會停」的尺；
**它證明不了桌子有畫出來**（錨點與桌子都從配置推導，renderer 壞了錨點還在），「畫出來」另外用像素證據守（S08）。

> 拔掉什麼會紅：不掛投影器（DOM 還在但不更新位置）→ S08 的里程計量不到位移；對齊左上角而不是中心 → S08 的模板比對差 > 2 px；錨點在 hall 也掛 → S06；座標 NaN → S06。

#### Scenario: [FE-W16-S06] 房間裡八個錨點對得回索引；大廳裡沒有

- **WHEN** 場景是 `room`，掛載世界
- **THEN** DOM SHALL 恰好有八個工位錨點，`data-seat-index` 0–7 各一；沒有給內容的錨點 SHALL `aria-hidden`、沒有文字，給了內容的 SHALL NOT `aria-hidden` 且內容在錨點裡；跑一個 frame 之後每個錨點的座標 SHALL 是有限數
- **AND WHEN** 把相機目標放在 S01 的門廊代表點、viewport 設成 1280×720（jsdom 裡用投影函式算；受控的畫面外案例，不依賴模板座標）
- **THEN** 投影落在畫面外的錨點 SHALL 是 hidden、畫面內的 SHALL 不是；至少一個 hidden、至少一個不 hidden（兩邊都有，判準才不空）
- **AND WHEN** 場景是 `hall`
- **THEN** SHALL 一個都沒有
- → 驗於：jsdom

#### Scenario: [FE-W16-S08] 真瀏覽器：從門口出生、桌子有畫出來、走到桌邊、撞桌子會停、通道走得通

- **GIVEN** `next start` 的正式建置；viewport 1280×720、deviceScaleFactor 1；載入 `/world`（大廳）、`page.route` 給一扇門、事先把那間房的票放進 `sessionStorage`
  （`scene-switch.mjs` 的作法）、`routeWebSocket` 回 `hello`／`snapshot`（房間的 snapshot 放一名遠端玩家在 `seat_index=0` 的站位）；
  在大廳先取得 Canvas 的 element handle
- **WHEN** 走到門前按 E、經既有的場景切換進入房間（不是整頁導覽）、等相機收斂（連續兩次讀數差 ≤ 1 px）
- **THEN** 至少 `seat_index` 0 與 4（近端那一對）的錨點 SHALL 在 Canvas 內且不是 hidden（viewHeight 12、房間深 24，出生點看不到北端是預期的）；
  用 0 與 4 的錨點（已知世界 x 距離）量出每單位的像素數 s 後，其餘**在畫面內**的錨點的螢幕位置 SHALL 與模板推導的位置相差 ≤ 2 px
- **AND** 桌子有畫出來：對每個**方塊完整落在 Canvas 內**的錨點（以錨點為中心、邊長 `DESK_SAMPLE_SIDE`（以 s 為單位）px 的方塊，
  桌面投影的內側，不含桌腳與椅子；`seat_index` 0 與 4 的方塊 SHALL 完整在 Canvas 內，少一個就紅），方塊裡與**裸地板基準色**的顏色距離（RGB 歐氏）
  > `DESK_COLOR_DISTANCE` 的像素比例 SHALL ≥ `DESK_PIXEL_RATIO`
  （突變：把桌面的 mesh 拿掉、桌腳、地毯與椅子留著 → 那個方塊露出的是同一種裸地板 → 比例掉下去 → 紅）。
  **裸地板基準色**：同一畫面一份。候選取樣點是每張桌子的世界座標 `(桌子 x 的同側 ±7.0, 0, 桌子的 z)`（桌子 ±3.6 與外牆 ±12 之間、
  通道地毯 |x| ≤ 2 之外；量測時那裡沒有任何陰影、離散 0）投影後、邊長 `DESK_SAMPLE_SIDE` 的方塊；依 `seat_index` 0→7 取**第一個完整落在 Canvas 內**的方塊，
  基準色是它的平均色；一個都沒有 SHALL 直接紅，MUST NOT 略過像素判準。基準方塊的每個像素離平均色的距離 SHALL 全部 ≤ `DESK_COLOR_DISTANCE`
  （基準落在陰影邊界或家具上時它自己會紅，而不是靜默放寬判準）。
  三個具名常數的數值（design〈待答問題〉的量測程序量出來的，2026-09-16；量測紀錄在 tasks 4.0）：
  `DESK_SAMPLE_SIDE = 0.4·s`（1280×720 時 s ≈ 53.7、方塊 21 px；桌面投影 0.8·s × 1.13·s，方塊落在內側）、
  `DESK_COLOR_DISTANCE = 40`、`DESK_PIXEL_RATIO = 60%`。
  量到的分布（門檻 40）：正常建置 3 次 × 8 張桌全部 100%；拔桌面 mesh 3 次的最大值 17.0%（非零的部分是留下來的桌腳投在方塊裡的陰影，不是桌面）——
  間隔 83 個百分點，門檻取中間 (100 + 17) / 2 ≈ 58 → 60%。基準方塊量到的顏色離散是 0（單一材質、平光）
- **AND** 遠端玩家的像素 SHALL 出現在 `seat_index=0` 錨點旁（`avatar-pixels.mjs` 的判準）
- **AND WHEN** 用錨點當里程計（每一小步：按鍵 ≤ 80 ms、等收斂、量一次；步數上限 200；世界距離用 s 與 s/√2 反算）沿中央通道往北走
- **THEN** 角色相對錨點的 z SHALL 前進到通道北端（允許 ≤ 1 px 的回抖）；走到通道中點時八個錨點 SHALL 都在 Canvas 內且位置與模板相差 ≤ 2 px
- **AND WHEN** 從通道北端走回 `seat_index=1` 的站位（沿通道往南、再往西；同一套里程計，到站的判準是離站位的反算距離 ≤ 0.3 單位）
- **THEN** 走到站位；接著**持續送出朝它的桌子走的移動輸入**（以下距離全部在螢幕空間量，單位 px；「單位」指世界單位、以 s 換算）：
  到達 plateau 之前 SHALL **至少有 1 步**使角色與該錨點（扣掉桌面高度偏移後）的反算距離**減少** ≥ 2 px（證明輸入有生效、方向對、步幅高於容差），
  且該距離 SHALL 曾 < 1 單位（站位在 1.1）；其後在連續 5 次同方向的輸入後，該距離每次的變化都 SHALL ≤ 1 px（plateau）；
  plateau 時的反算距離 SHALL 等於「桌子碰撞盒近側邊到桌面中心的距離 ＋ 角色半徑」
  （從配置與家具 definition 推導）± 0.15 單位 —— 比它小就是穿過桌子了（只拔桌子的 collider 會停在椅子或牆上，距離對不上 → 紅）；步數上限 60
- **AND WHEN** 繞回通道再走到 `seat_index=2` 的站位
- **THEN** 離該錨點的反算距離 SHALL 收斂到站位與桌面中心的模板距離 ± 0.15 單位
- **AND** 全程 Canvas SHALL 是在大廳取得的同一個 element handle；MUST NOT 用固定毫秒判定「走到了」
- **AND** 突變對照：只拿掉桌子的 collider、mesh 留著 → plateau 那段 SHALL 失敗（角色穿過桌子）；只拿掉桌面 mesh、collider 留著 → 像素那段 SHALL 失敗
- → 驗於：e2e

> 為什麼是「至少 1 步」不是「連續 3 步」（2026-09-16 實作 e2e 時量到）：一步的位移量是**整個 frame** 的 —— 方向每 frame 讀一次、物理把該 frame 的 dt 補完
> （`LocalPlayer` 的 `advanceRenderMotion`），所以按鍵再短，最小一步也是 `MOVE_SPEED × 一個 frame`：swiftshader 20 fps 時 ≈ 0.2 單位 ≈ 11 px，
> 慢一點的 runner 更大。而站位到桌子碰撞面只有 `3.6 − 0.4 − 0.25 − 2.5 = 0.45` 單位（到站容差 0.3 → 最多 0.75）——
> 這段只裝得下 1～3 步，「連續 3 步」在到站位置偏西時一定紅（實測到站 x = −2.33 時剛好 3 步）。
> 「輸入有生效、方向對」一步距離減少就證明了；「沒在動卻 plateau」與「撞到別的東西」由 plateau 距離那句擋（站位離桌面中心 1.1、椅子更遠，都不是 0.65）。
