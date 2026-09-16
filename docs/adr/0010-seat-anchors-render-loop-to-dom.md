# 0010. 工位錨點：render loop 直接寫 Canvas 外面的 DOM；八格固定容量、不讀 `seat_count`

- **Status**: Accepted
- **Date**: 2026-09-16
- **Deciders**: 實作 `FE-W16` 的那個 session；兩位外部審查（規格 PR #422、實作 PR）
- **邊界狀態**: 已強制
- **證據**: tests/world-project-room-anchors.test.tsx:180、tests/world-project-room-anchors.test.tsx:83、tests/world-project-room-furniture.test.tsx:153、src/world/seats/SeatAnchorProjector.tsx:20、src/world/seats/SeatAnchors.tsx:21、src/world/layout/projectRoomLayout.ts:21

> `邊界狀態` 與 `證據` 兩欄由 `bash .github/scripts/arch-view.sh` 讀。
> 三種狀態的意思見 `docs/adr/README.md`。

## 背景

Project Room（`FE-W16`）的每個工位要有一個「投影到螢幕的參考點」：`FE-J13` 之後把座位狀態（Occupied、名字）放在那裡，
真瀏覽器驗收（`FE-W16-S08`）拿它當尺量「桌子在哪」與「撞桌子會停」。位置每幀都在變（相機跟著角色、有阻尼），
而要放的東西是 DOM（文字、狀態；`CONTEXT.md`：3D 負責空間、DOM 負責產品操作；3D 裡畫字會建 GPU texture，違反 ADR 0003 的資源契約）。
所以有一條高頻資料要從 R3F 的 render loop（Canvas 裡面）流到 Canvas 外面的 DOM。門標籤（`FE-W12`，`DoorLabelProjector`）走過同一條路，
但當時沒有記成 ADR；工位錨點是第二個走這條路的東西，該把邊界寫下來。

另一個跨功能的生命週期決定綁在一起：房間要長幾張桌子。後端 `SeatClaim.seat_index` 的域是 0–7，專案各自有 `seat_count`。

## 選項

### A. 位置進 React（`useFrame` 裡 `setState`，錨點元件讀 state 排版）
- 好：一般的 React 資料流，好懂。
- 壞：每幀 8 次 setState → 整棵 DOM 子樹每幀重繪；**沒有錯誤訊息，只會變慢**（`CONTEXT.md`「高頻資料不進 React」明列這條）。

### B. 3D 裡放錨點（`<Html>`／CSS3DRenderer／3D 文字）
- 好：位置天然跟著場景。
- 壞：drei `<Html>` 是第二套「3D→DOM」投影機制，跟門標籤那套會漂；3D 文字建 GPU 資源（ADR 0003）。

### C. render loop 直接寫 DOM（門標籤的做法）
- 好：一份投影函式（`labelProjection.ts`，跟構圖判準同源 `toScreen`）；每幀只寫 8 個 `style.transform`；React 一次都不重繪。
- 壞：兩個元件（Canvas 外的 DOM、Canvas 內的投影器）靠一個 `Map` ref 接起來；忘了掛任一半都不會報錯（DOM 在但不動／投影器對著空 Map）。

### 容量：D. 依 `seat_count` 實體化前幾格 vs E. 八格固定
- D 好：四人房只有四張桌。壞：房間子樹在 `wsScene` 換掉時整棵重掛、物理世界在掛載時用 `layout` 建一次 ——
  資料到了才長桌子＝物理世界要能動態增減碰撞體；先拿資料再掛＝過場多等一個 REST、`FE-V01` 的 10 秒語意要改。兩條都比 E 貴一個數量級。
- E 好：配置是靜態資料、跟大廳同一條路；`FE-J13` 本來就要讀座位，「索引 ≥ `seat_count` 不開放」是它的一種狀態，資料在那裡才有。
  壞：`FE-J13` 合併前四人房看起來有八張桌（桌子今天不能認領，所以沒有「看起來能用、按了 400」的問題）。

## 決定

選 **C** ＋ **E**。

- `src/world/seats/SeatAnchors.tsx`：Canvas **外面**的 DOM，只負責「有哪幾個」（`data-seat-index` 0–7、`aria-hidden`、無內容、0×0），
  節點登記進一個 `Map` ref，**不進 React state**；只在 `room` 場景掛。
- `src/world/seats/SeatAnchorProjector.tsx`：Canvas **裡面**、渲染 `null`，`useFrame` 每幀用 `screenPixelFor`（門標籤同一份投影）
  把桌面中心（x／z 讀配置裡的桌子，y 讀家具 definition 的桌面高度）寫進節點的 `style.transform`；畫面外 `visibility: hidden` 但元素仍在、位置仍寫；
  NaN 不寫進 DOM。掛在 `SceneObjects` 的 `room` 分支。
- `src/world/layout/projectRoomLayout.ts`：八個工位模板、不讀 `seat_count`（design D3）；哪幾格對這個專案不開放由 `FE-J13` 呈現。

**理由**：門標籤已經證明這條路可用，而且它跟構圖判準同源（`toScreen`），兩份投影不會漂；React 不重繪是可以用測試釘住的。
容量放 `FE-J13` 是因為只有它讀座位資料，「不開放」在那裡才有東西可依。

## 邊界

- **不進 React**：`tests/world-project-room-anchors.test.tsx` 的「相機跟拍時位置每幀更新，而且不經過 React」—— 相機移動兩幀、位置變了、投影器函式的呼叫次數不變。走 state 會數到每幀一次重繪 → 紅。
- **只在 room、hall 沒有**：同檔「大廳裡一個都沒有」＋ `tests/world-project-room-furniture.test.tsx` 的「房間裡一幀之後八個節點都被寫了位置；大廳裡一個都沒被寫」。
- **座標有限、對齊桌面中心 ≤ 1 px、畫面外 hidden**：同檔「一幀之後每個座標是有限數；0／4 在手算位置 ±1 px…」（期望是手算常數，不呼叫 `toScreen`）；`tests/world-project-room-desk-top.test.ts`：桌面高度換了錨點 y 要跟著（不是寫死）。
- **八格固定**：`tests/world-layout-project-room.test.ts` 的 `[FE-W16-S03]`（集合恰好 0–7）；配置不含任何 `seat_count` 的讀取（靜態資料）。

## 代價

- 兩半靠 ref 接起來，**忘了掛投影器不會報錯**（DOM 在、不動）—— 這條由 `S08` 的真瀏覽器里程計守（e2e 那片的突變「不掛投影器 → 里程計量不到位移」）；jsdom 這層只守「掛了就會寫」。
- 每幀 8 次 `style.transform` 寫入，跟門標籤同量級；`FE-J13` 若把錨點數量放大（例如每格多個標籤）要重新量。
- `FE-J13` 合併前四人房畫八張桌。

## 什麼情況下要重新考慮

- 出現第三個「render loop → DOM」的消費者：把 `Map` ref ＋ 投影器抽成通用的 `ScreenAnchors`，門標籤與工位錨點都改用它。
- 產品決定要依容量長桌子（動態碰撞體）：那是 `project-room-layout` 的一條 delta，不是就地改。
- `FE-W14` 改相機（透視、可旋轉）：`toScreen` 的封閉式投影不再成立，兩個投影器都要改用 `camera.project`。
