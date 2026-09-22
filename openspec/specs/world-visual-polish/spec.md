# world-visual-polish Specification

## Purpose
`world-visual-polish`（`FE-W14`）是 3D 世界 `/world` 的**像素／寶可夢風視覺統一面**：它把出生就看得見的世界
——地面、場景材質、角色——收成一套一致的像素外觀。它負責暖色像素調色盤、依 color token 程序生成的最近鄰
像素貼圖（含木紋）、像素草地、低有效 DPR 的像素化渲染，以及角色的深色描邊、框臉髮型、臉部細節與坐姿姿勢。
目的是讓使用者（視覺主導）一進世界就覺得「這是個像樣、可愛、風格一致的像素世界」，而不是一組平滑方塊。
它**不換 3D 引擎、不改 2D、不用外部美術資產** —— 只用程序生成，在固定俯視相機下達成像素風。

## Requirements

### Requirement: 世界用暖色像素調色盤，角色與地面在畫面上分得出來

世界的顏色 token（`WORLD_COLORS`，唯一來源 `src/design/world.ts`，`world-design-system` 的單一色票原則不變）
SHALL 是一組**暖色、彼此拉得開的像素色票**：地面偏草綠、牆與地毯偏暖奶油、強調色偏暖金。
場景元件與角色 SHALL NOT 硬寫顏色，一律經 `worldColor()` 取 token（沿用 `world-design-system`）。

固定俯視相機下，角色（`avatarLook` 的 body／limb）與其所站的地面 SHALL 在一般遊戲視角下**清楚分得出來**
（可讀性）—— 角色的深色描邊是達成這條的手段之一。

#### Scenario: [FE-W14-S01] 場景與角色的顏色都來自色票 token

- **WHEN** 渲染地面、牆、家具與角色
- **THEN** 每一個顏色 SHALL 取自 `worldColor()` 的一個 token，沒有硬寫的 hex 混進場景元件
- **AND** 在真瀏覽器的固定俯視畫面裡，角色的軀幹／四肢 SHALL 與其腳下地面在視覺上分得出來（前後截圖為證）

### Requirement: 場景材質帶依 color token 生成的像素貼圖，且不破壞材質快取

`materialFor` 產生的每個 `MeshStandardMaterial` SHALL 帶一張**依該材質 color token 程序生成**的像素貼圖當 `map`
（`NearestFilter`、`RepeatWrapping`）：`wood`／`woodDark` SHALL 用**橫向木紋**貼圖，其餘 token SHALL 用同色系的
雜訊貼圖。`MeshBasicMaterial`（自發光體）SHALL NOT 加貼圖。

貼圖 SHALL **只依 color token 的 hex 決定**（同一個 token 永遠拿到同一張快取貼圖），因此
`world-design-system` 的材質快取契約不變：同一組參數 SHALL 仍回同一個材質實例、不同參數回不同實例，
且回傳的材質實例仍是**不可變**的（貼圖在建構時掛上，不事後改寫）。貼圖本身 SHALL 依 hex 快取，
render loop **MUST NOT** 每幀新建 `CanvasTexture`。

沒有 `document` 的環境（伺服器端渲染、jsdom 測試）取不到 canvas 2D context，此時 `map` SHALL 退化為
**無貼圖**（純色 `MeshStandardMaterial`），MUST NOT 拋錯 —— 純色在那些環境本來就看不到，靜默退化是對的。

#### Scenario: [FE-W14-S02] 木頭 token 的材質帶橫向木紋、同 token 同實例

- **GIVEN** 有 `document`（瀏覽器／jsdom 有 canvas 2D context）
- **WHEN** 用 `{kind:'standard', color:'wood'}` 取兩次材質
- **THEN** 兩次 SHALL 得到同一個材質實例（快取不因加貼圖而失效）
- **AND** 該材質的 `map` SHALL 是一張 `NearestFilter`、`RepeatWrapping` 的貼圖
- **AND WHEN** 改用 `{kind:'standard', color:'carpet'}` 取用
- **THEN** SHALL 得到不同的材質實例，其 `map` 是雜訊貼圖（非木紋）

#### Scenario: [FE-W14-S03] 沒有 document 時退化為無貼圖純色、不拋錯

- **WHEN** 在沒有 `document` 的環境（SSR／測試）用 `{kind:'standard', color:'wood'}` 取材質
- **THEN** SHALL 回一個純色 `MeshStandardMaterial`、其 `map` 為未設定（`null`）
- **AND** SHALL NOT 拋錯

### Requirement: 地面疊一張像素草地，且經共用 resource factory 取得

Guild Hall 的地面 SHALL 在主地板上疊一張**像素草地** plane（`NearestFilter`、`RepeatWrapping`，
tiling 隨物理範圍縮放），讓地面看起來是草而不是一塊平色。

草地貼圖 SHALL **經 `world-design-system` 的共用 resource factory 取得**，場景元件（`WorldShell`）
**MUST NOT** 自己 `new CanvasTexture` —— 沿用 `world-environment`「場景元件 MUST NOT 直接建立 GPU 資源」
與「誰負責釋放」的既有契約；貼圖與草地 plane 共用的 geometry SHALL 是 factory 擁有的不可變快取實例，
場景元件 MUST NOT 對它 `dispose()`。

#### Scenario: [FE-W14-S04] 地面有像素草地、貼圖來自共用 factory

- **WHEN** 進入 Guild Hall
- **THEN** 主地板上 SHALL 疊一張像素草地 plane，其貼圖是 `NearestFilter`、`RepeatWrapping`
- **AND** 該貼圖 SHALL 由共用 resource factory 產生（`WorldShell` 不直接 `new CanvasTexture`）
- **AND** `WorldShell` 卸載時 SHALL NOT 對草地貼圖或其 geometry 呼叫 `dispose()`（factory 擁有）

### Requirement: World 以低有效 DPR 做像素化渲染

`/world` 的 WebGL 畫面 SHALL 以固定的**低有效 DPR**（`0.25`）、**關閉 antialias** 渲染，
並把 canvas 的 CSS `image-rendering` 設為 `pixelated`，使低解析度的 backing store 被**最近鄰放大**
成點陣外觀。這是像素風的來源，也把 GPU 要著色的像素數降到約 1/16（與 `FE-X09`「弱裝置」同一目標）。

此有效 DPR **刻意低於** `world-canvas` 原本「1 到 2 之間」的下限；`world-canvas` 的 DPR Requirement
已在本 change 一併 MODIFIED 放寬下限、把像素模式的低 DPR 交由此處決定（上限 `2` 仍成立，`0.25 ≤ 2`）。

#### Scenario: [FE-W14-S05] 畫面以 1/4 解析度渲染再最近鄰放大

- **WHEN** 在支援 WebGL2 的真瀏覽器開啟 `/world`
- **THEN** canvas 的 backing store 每一軸 SHALL 約為其 CSS 顯示尺寸的 1/4（有效 DPR ≈ `0.25`）
- **AND** canvas 的 `image-rendering` SHALL 是 `pixelated`（最近鄰放大，不是平滑內插）
- **AND** renderer 的 antialias SHALL 關閉
- **AND** 畫面上的邊緣 SHALL 呈現硬邊的點陣外觀（前後截圖為證）

### Requirement: 角色有描邊、框臉髮型與臉部細節

`ChibiPlayer` SHALL 有：
- **描邊**：頭、軀幹、四隻肢體各自後疊一個放大一點、只畫背面（`BackSide`）的深色 box（inverted-hull），
  露出一圈深色輪廓 —— 不用後處理 pass。
- **框臉髮型**：頂＋瀏海＋兩側鬢角＋後腦組成的髮型（不是單一平板），讓角色從畫面上讀得出「這是人」。
- **臉部細節**：眼睛（朝向可辨）、嘴、腮紅。

顏色（描邊色、髮色）是像素風的常數（`FE-W14` 範圍）。角色的軀幹／四肢色仍由 `avatarLook(av)` 決定
（`avatar-appearance`／`FE-A05`／`FE-W19`），本 change 不改那組色，也不改動畫用的 `getObjectByName`
子部位名字（`CHIBI_PARTS`）—— 改名字會讓動畫靜默停止。

#### Scenario: [FE-W14-S06] 角色主要部位都有 inverted-hull 描邊

- **WHEN** 渲染一個 `ChibiPlayer`
- **THEN** 頭、軀幹、每一隻肢體 SHALL 各有一個比本體大、材質是深色且 `side` 為 `BackSide` 的 mesh（描邊）
- **AND** 角色 SHALL 有框臉髮型（多於一個髮型部件）與臉部細節（眼、嘴、腮紅）

#### Scenario: [FE-W14-S07] avatar 值越界時角色照常渲染

- **WHEN** 以 `av` 為 `null` 或超出值域的整數渲染 `ChibiPlayer`
- **THEN** 角色 SHALL 照常渲染（描邊、髮型、臉部細節不受影響）
- **AND** 軀幹／四肢色 SHALL 由 `avatarLook` 決定（值域交給 `avatar-appearance`，此處不重複判斷）

### Requirement: 角色有可重用的坐姿姿勢

`ChibiPlayer` SHALL 接受一個 `seated` 旗標：為真時，大腿 SHALL 往前（往臉的 +Z 方向）彎、手 SHALL 往前擱、
整體 SHALL 略抬到椅面高度，形成坐姿；為假時是原本的站姿。

**非驅動的實例**（`RemotePlayer`、靜態渲染）SHALL 直接呈現該姿勢。**每幀驅動四肢的實例**（`LocalPlayer`
的走路擺動）若要呈現坐姿，SHALL 在 seated 時**跳過**每幀對四肢的擺動寫入（否則靜態姿勢會被每幀蓋掉）。

本 change **只做姿勢本身**。坐在正確座位上的定位、面向桌子、走動起身、以及跟後端座位權威的接軌
歸 `FE-J13`（見 Non-goals）—— 那是空間互動與座位狀態，不是視覺姿勢。

#### Scenario: [FE-W14-S08] seated 為真時大腿往前彎、整體抬到椅面

- **WHEN** 以 `seated` 為真渲染一個非驅動的 `ChibiPlayer`
- **THEN** 兩隻大腿的關節 SHALL 往前（臉的方向）彎一個明顯角度、整體 SHALL 比站姿略高（坐上椅面）
- **AND WHEN** 以 `seated` 為假渲染
- **THEN** 四肢 SHALL 回到中性站姿、整體高度回到地面
