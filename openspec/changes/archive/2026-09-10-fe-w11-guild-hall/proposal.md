## Why

`/world` 現在是一個**空房間**：一片地板、四面牆、一個角色。
`FE-W10`（已封存）交了十四種場景元件 —— 地板、牆、地毯、平台、桌椅、書架、
植物、燈、招牌、旗幟、兩種看板、門 —— **但沒有任何一個被擺進世界**。
那是刻意的：`FE-W10` 明寫「不做任何配置，一個座標都不訂」。

這一項就是那些座標。

**不做會怎樣**：`FE-W12`（依 `GET /api/rooms` 生成 Project Door）沒有走廊可以排；
`FE-V02`–`FE-V06`（可旁觀、可漸進加入）沒有「地方」可以聚集。
而 `CONTEXT.md`〈3D 憑什麼存在〉那條鏈的第一環是**看見** ——
一個空房間裡沒有東西可以看見。

## What Changes

- 新增 `world-layout` capability：Guild Hall 的配置是**一份 typed 資料**，
  **渲染與碰撞吃同一份**
- 遊玩區域放大到 **24×24**（`halfExtent` 10 → 12），並讓它成為**唯一的尺寸來源**
- `createPhysicsWorld` 改吃配置推導出來的 `StaticBox[]`；
  **邊界與內牆走同一條路** —— 邊界不再由物理層自己生
- 分區（Board 區／社交區／走廊）是**具名的矩形**，`FE-W12` 從它算門的位置
- 三條構圖驗證與一條**可走路徑**驗證
- 視覺地板 **overscan**：玩家走到邊緣時畫面上不再看到世界外面的空白

## Non-goals

- **不接任何 API。** 看板顯示什麼、Project Door 依 `GET /api/rooms` 生成
  逐字是 `FE-W12`。這裡擺的是**靜態的**佈景
- **不做 sensor 分區。** 「玩家走進 Board 區時 UI 知道」是互動語意，
  今天沒有讀取者 —— 分區只提供**矩形**（見 design 的 D4）
- **不決定門怎麼沿走廊排。** 間距、容量、邊距是 `FE-W12` 的事。
  這裡**不提供** `spacing`／`capacity` 這類今天沒有人讀的欄位
- **不改相機參數。** `viewHeight`／`offset`／`halfLife` 是 `FE-W05` 量出來的，
  調構圖是 `FE-W14 VisualPolish`（W5）
- **不做視覺回歸。** 構圖的驗證一律用**正交投影算**，不用像素比對
  （`FE-O13` 還沒決定怎麼做視覺回歸）
- **不改任何 `FE-W10` 的元件。** 這一項只擺它們，不動它們的造型或碰撞契約
- **不做尋路。** 可走路徑的檢查是**測試裡的 BFS**，不是產品功能。
  角色仍然是玩家自己用鍵盤走

## Capabilities

### New Capabilities

- `world-layout`: Guild Hall 的配置、分區、以及配置推導出來的靜態碰撞

### Modified Capabilities

（無 —— 見 design 的 D6：`world-physics` 的產品義務沒有改變）

## Impact

- 新增 `src/world/layout/`（配置資料、分區、局部 footprint → 世界 `StaticBox`）
- `src/world/physics/world.ts`：`createPhysicsWorld` 收 `staticBoxes`，
  `PHYSICS.halfExtent` 10 → 12
- `src/world/environment/WorldShell.tsx`：地板 overscan、掛上 `GuildHall`
- `src/world/player/LocalPlayer.tsx`：把配置推導出來的 `StaticBox[]` 傳進物理世界
