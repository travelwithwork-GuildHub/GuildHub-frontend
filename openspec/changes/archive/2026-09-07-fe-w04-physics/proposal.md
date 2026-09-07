## Why

角色現在**走得出地板**。沒有碰撞、沒有邊界、沒有任何東西擋得住它。

不做會怎樣，三件事：

1. **走出去就回不來。** 相機跟著角色，所以玩家會看到一片空白的背景，
   而且沒有任何提示告訴他發生什麼事
2. **`FE-W06` SpatialInteraction 沒有地基。** `CONTEXT.md` 定義
   Interaction Range 是「走近可互動物件的觸發範圍（**Rapier sensor**）」——
   sensor 是這一項要提供的原語
3. **`FE-W11` Guild Hall 沒辦法擺牆。** 那一項要做「簡化 Collider」，
   而 collider 的規範在這裡定

## What Changes

- 導入 Rapier 物理世界
- 角色改用 **kinematic character controller** 移動 ——
  它會被靜態物體擋住，但不會被推、不會有慣性
- 地面與靜態障礙物的 collider
- **World Bounds**：角色走不出遊玩區域
- **穿牆防護**：無論速度多快都不得穿過障礙物
- **Sensor／Trigger 原語**：不擋住移動但回報重疊，給 `FE-W06` 用

## Non-goals

- **不做互動邏輯與 E 提示** —— `FE-W06`（W1）。本次只提供 sensor 原語
- **不做場景元件** —— `FE-W10`（W3）的 Floor / Wall。
  本次的地面與牆是**除錯用的**，跟 `DebugShadowScene` 同一類
- **不做 Guild Hall 的實際配置** —— `FE-W11`（W3）
- **不做場景切換時的物理世界拆除** —— `FE-W07`（W1）的
  「Rapier world 與 R3F tree 的拆除順序」是它的 W4 那一列
- **不做重力驅動的移動**（跳躍、掉落）—— 這是俯視角的平面移動，
  `CONTEXT.md`：「移動是 2D gameplay logic」

## Capabilities

### New Capabilities

- `world-physics`: 物理世界 —— 角色的碰撞、靜態障礙物、遊玩區域邊界、
  穿牆防護，以及 sensor 原語

### Modified Capabilities

- `world-player`: Requirement「移動有速度上限，對角線不得更快」——
  移動從「直接寫 transform」變成「交給 character controller 解算」。
  **速度限制與對角線的性質不變**，變的是誰決定最終位置。
  **Scenario ID 不變**

## Impact

- **新增相依**：`@react-three/rapier@2.2.0`（含 `@dimforge/rapier3d-compat`）。
  peer 是 `react ^19`、`@react-three/fiber ^9.0.4` —— 都符合
- ⚠️ **位置的權威來源改變**：從我們的 ref 變成 **Rapier rigid body**。
  `CONTEXT.md` 明訂那是允許放高頻資料的地方之一
- ✅ **Rapier 在 jsdom 裡跑得起來**（實測過）——
  所以碰撞、邊界、穿牆防護**全部是單元測試驗得到的**，
  不像 `FE-W01` 那樣一半只有眼睛驗得了
- **bundle 會再長一塊**：Rapier 的 WASM。`FE-O12` 的效能預算要記這一筆
