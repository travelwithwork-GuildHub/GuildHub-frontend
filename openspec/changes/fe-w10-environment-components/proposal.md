## Why

世界現在是：一片 20×20 的灰藍色平面、一個藍色方塊、一個 Chibi 角色。
那個平面與方塊在 `src/world/DebugShadowScene.tsx` 裡，它的檔頭與
`openspec/specs/world-canvas/spec.md` 的 Requirement 都逐字寫著
**「這兩個物件是臨時的，由 `FE-W10` 移除」**。

`FE-W09`（已封存）交了它們要用的材料：顏色 token、`geometryFor`、`materialFor`。
**現在缺的是東西本身。**

**不做會怎樣**：`/world` 已經對外公開，而它現在展示的是鷹架。
再往下 `FE-W11 Guild Hall` 要「配置」，但沒有東西可以配置；
`FE-W12 互動物件` 要讓 Board 依 API 生成，但沒有 Board 的形狀。
**這一項是 W3 那條鏈的第一環，卡住的話後面兩項都動不了。**

## What Changes

- 新增 `world-environment` capability：場景元件的分類、碰撞契約與資源限制
- 場景元件分**三類**，各自用最貼合的形狀（見 design 的 D1）
- **碰撞尺寸由元件擁有，註冊由 `FE-W11` 負責** —— 元件導出的是**局部**描述，
  不是帶世界座標的 `StaticBox`
- 一條**雙向**的判準把視覺與碰撞釘在一起：碰撞盒等於「宣告會擋路的部件」的聯集
- 一條資源限制：場景元件**不得自建 GPU 資源**，一律經由 `FE-W09` 的共用 factory
- `WorldCanvas` 掛上永久的 World Shell（地面＋與物理邊界對齊的可見牆），
  **移除 `DebugShadowScene`**
- 修改 `world-canvas` 的〈燈光與陰影〉Requirement —— 那條現在明文說那兩個物件是臨時的

## Non-goals

- **不做任何配置。** spawn 點、社交區、走廊、哪張桌子放哪裡逐字是 `FE-W11`。
  這個 change 交的是元件，**一個座標都不訂**（World Shell 的地面與牆是例外，
  理由見 design 的 D4：那不是配置，是世界成立的條件）
- **不接任何 API。** `ProjectBoard`／`TalentBoard`／`Door` 依 `GET /api/rooms`
  生成、顯示名稱與在線數是 `FE-W12`。這裡交的是**形狀**
- **不註冊任何 Rapier collider。** 這個 change 一行 physics 的程式碼都不改
- **不決定 3D 裡要不要有字。** 見 design 的 D5 —— 這個 repo 今天沒有任何
  文字渲染能力（沒有 drei、沒有 troika），而加上它會直接違反這個 change
  自己訂的資源限制。**列為 `FE-W12` 的待答問題**，不是由這裡宣告「永遠在 DOM」
- **不決定好不好看。** 色票的值、構圖、比例調校是 `FE-W14 VisualPolish`（W5）。
  這裡交的是**可辨識**（`Sign` 看得出是 `Sign`），不是**好看**
- **不做 instancing／LOD。** `FE-W13`（W5）
- **不動 `FE-W08 ProceduralAvatar`。** 角色不在這個 change 的範圍
- **不引入烘焙貼圖或外部模型。** `FE-W09` 的 proposal 已經逐條寫過為什麼，
  這裡沿用同一份理由（世界是動態的、依賴 `FE-W15`、`CONTEXT.md` 定義 Procedural）

## Capabilities

### New Capabilities

- `world-environment`: 場景元件的分類、碰撞契約與資源限制

### Modified Capabilities

- `world-canvas`: 〈燈光與陰影〉—— 臨時的接收面與投射物退場，換成永久的地面與
  「不得為了驗證而放沒有產品用途的物件」

## Impact

- 新增 `src/world/environment/`（結構、家具 definition、泛用 renderer、語意元件）
- `src/world/WorldCanvas.tsx`：`<DebugShadowScene />` → `<WorldShell />`
- 移除 `src/world/DebugShadowScene.tsx`
- `openspec/specs/world-canvas/spec.md`：一條 Requirement 改寫，
  `FE-W01-S03` 的 **ID 與 WHEN/THEN 不動**，但 `VERIFY-BY` 的證據要重新取得
  —— 舊證據驗的是已經被移除的 debug 方塊
