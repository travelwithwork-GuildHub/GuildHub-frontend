## Why

世界現在的樣子是：一片灰藍色的地板、一個藍色方塊、一個 Chibi 角色。
`DebugShadowScene` 的檔頭自己寫著「**這整個檔案由 FE-W10 移除**」——
它是為了讓 `FE-W01-S03`（陰影看得見）有東西可驗才存在的鷹架。

要讓世界不只是鷹架，下一步是 `FE-W10 EnvironmentComponents`
（地板、牆、地毯、桌椅、書架、植物、燈、招牌、公佈欄、門）。
**但那是十幾種元件**，而現在顏色是這樣散著的：

```
src/world/DebugShadowScene.tsx:28   color="#cfd4e4"
src/world/DebugShadowScene.tsx:36   color="#6b7fd7"
src/world/player/ChibiPlayer.tsx:22 const SKIN = '#f2c9a0'
src/world/player/ChibiPlayer.tsx:23 const BODY = '#4d5bb0'
src/world/player/ChibiPlayer.tsx:24 const LIMB = '#3b4794'
src/world/player/ChibiPlayer.tsx:66 color="#20232e"
```

**不做會怎樣**：`FE-W10` 的十幾種元件會各自挑顏色。
到了 `FE-W14 VisualPolish`（W5）要統一風格時，那不是「調參數」，
是把十幾個檔案逐一改過去 —— 而且沒有任何機制能證明改乾淨了。
今天只有 6 處，成本最低的時刻就是現在。

DOM 那一半已經有這個東西了（`globals.css` 的 `@theme`：
`--color-surface`、`--color-ink`⋯⋯，`FE-X01`）。3D 這一半沒有。

## What Changes

- 新增 3D 的視覺常數單一來源：色票、材質參數、比例、圓角半徑
- 取用方式**型別受限**（token 名打錯在 `npm run typecheck` 就紅），
  沿用 `src/design/layers.ts` 已經證明有效的先例
- 新增一組**封閉列舉**的 primitive：`RoundedBox`／`Capsule`／`Sphere`／`Cylinder`
- 幾何與材質是**模組層級的共用實例**，並明文寫清楚它們**不歸 `FE-W07` 管**
- 把現有的 6 處硬寫顏色遷移過去
- 一條機器檢查：`src/world/**` 底下不得再出現顏色字面值

## Non-goals

- **不決定「好不好看」。** 色票的**值**、固定相機下的構圖、
  Avatar 組合的穿模檢查是 `FE-W14 VisualPolish`（W5）。
  這個 change 交的是**機制**：token 存在、被強制、primitive 可用。
  **兩者的字面描述在 `docs/WBS.md` 上高度重疊，所以邊界要寫在規格裡**，
  否則 `FE-W09` 會把 `FE-W14` 整個吃掉，而 W5 那 10 點會變成空的
- **不做任何場景元件。** `Floor`／`Wall`／`Desk`／`ProjectBoard` 逐字是
  `FE-W10`。這個 change 只提供它們要用的材料
- **不刪 `DebugShadowScene`。** 它的檔頭指名由 `FE-W10` 移除 ——
  提前刪掉會讓 `FE-W01-S03` 沒有東西可驗
- **不做視覺回歸。** 3D 畫面怎麼測（截圖比對還是只測 DOM）是 `FE-O13`（W5），
  **還沒決定**。所以這個 change 的每一條驗收都 MUST 在沒有像素比對的前提下成立
- **不碰 `FE-W08 ProceduralAvatar`。** `ChibiPlayer` 只做顏色遷移，
  不改結構、不改 `CHIBI_PARTS` 契約
- **不做 instancing / LOD。** 那是 `FE-W13`（W5）
- **明確排除烘焙貼圖與外部模型。** 使用者提供的參考專案
  `52-adding-details-to-the-scene` 用**烘焙貼圖 ＋ `MeshBasicMaterial`**
  達到風格化（完全沒有即時光照），那確實是那個場景好看的主因。
  **這個 change MUST NOT 走那條路**，三個理由：
  1. `CONTEXT.md` 定義 Procedural Avatar 是「由 primitive 組出來，
     **不是**載入外部模型」
  2. 它依賴 `FE-W15 資產管線`（W5，且那一列標 `Pending`）
  3. **世界是動態的** —— 玩家會走動、遠端玩家會進出、`FE-W12` 的物件
     依 API 生成。烘焙把光影寫死在靜態貼圖裡，動態物件既接收不到
     烘焙的陰影、也投射不出去，會產生明顯的視覺脫節；
     而 `FE-W01`（已封存）要求「投射陰影的物件在接收陰影的平面上
     留下可見的陰影」

  **未來可以另開 change 評估烘焙貼圖作為靜態環境的最佳化** ——
  排除的是「在這個 change 裡用它取代即時光照」，不是永久排除

## Capabilities

### New Capabilities

- `world-design-system`: 3D 世界的視覺常數與 primitive 的單一來源

### Modified Capabilities

（無）

## Impact

- 新增 `src/design/world.ts`（token）與 `src/world/primitives/`
- `src/world/player/ChibiPlayer.tsx`、`src/world/DebugShadowScene.tsx`：顏色改成取 token
- 新增一條掃描測試（純函式 ＋ 讀檔分離，沿用 `src/api/scope.ts` 的形狀）
- **可能新增依賴 `@react-three/drei`** —— 見 design 的 D1，這是這個 change
  唯一一個難逆轉的決定
