# 工作項目

**分刀以「每一刀合併之後 main 都可發佈」為準**，行數量出來再決定，不預先猜。
`/world` 是對外公開的。

**驗收條件不是「測試全綠」，是「把防禦拿掉，測試要變紅」。**

## 1. 配置的型別與幾何（`feat/…--layout`）

- [ ] 1.1 `LayoutItem`（discriminated union，每項帶穩定的 `id`）與 `Zone`
- [ ] 1.2 局部碰撞描述 → 世界 `StaticBox`：套上位置與 90° 整數倍的旋轉
- [ ] 1.3 `WORLD_HALF_EXTENT`：**唯一的尺寸來源**，`PHYSICS.halfExtent` 由它推導
- [ ] 1.4 測試 `FE-W11-S02`／`S04`／`S05`／`S07`／`S09`
- [ ] 1.5 **突變**：旋轉轉換不交換半寬半深 → `S04` 要紅
- [ ] 1.6 **突變**：兩個項目用同一個 `id` → `S05` 要紅
- [ ] 1.7 **突變**：把一張桌子擺到區域外面 → `S07` 要紅
- [ ] 1.8 ⚠️ **這一刀不碰 Rapier、不渲染。** 幾何算錯與 React 沒掛載
      混在一起的話，紅燈說不出是哪一個

## 2. Guild Hall 的配置資料與渲染（`feat/…--placement`）

- [ ] 2.1 `LAYOUT`：外牆、內牆、Board 區（兩個看板）、社交區（桌椅植物燈）、
      走廊（門與招牌）、地毯與平台分區
- [ ] 2.2 `ZONES`：`boards`／`social`／`corridor` 三個具名矩形
- [ ] 2.3 `GuildHall` 元件：走 `LAYOUT` 渲染，掛進 `WorldShell`
- [ ] 2.4 測試 `FE-W11-S01`（渲染出來的東西與配置一一對應）、`FE-W11-S14`
- [ ] 2.5 **突變**：`GuildHall` 漏掉一種 `kind` → `S01` 要紅
- [ ] 2.6 **突變**：把兩個分區的矩形疊在一起 → `S14` 要紅

## 3. 靜態碰撞的原子遷移（`feat/…--colliders`）

⚠️ **這一刀不能拆。** 拆開的話 main 會處於「沒有邊界」或「兩組邊界」的狀態，
而 `/world` 是對外公開的。

- [ ] 3.1 `createPhysicsWorld` 收 `staticBoxes`；**新舊互斥**，
      不傳時才走舊的 `addBounds`（同一刀內就會拔掉，見 3.3）
- [ ] 3.2 `PHYSICS.halfExtent` 10 → 12（由 `WORLD_HALF_EXTENT` 推導）
- [ ] 3.3 `LocalPlayer` 傳入配置推導出來的 `StaticBox[]`，**並拔掉 `addBounds`**
- [ ] 3.4 測試 `FE-W11-S03`／`S06`／`S08`
- [ ] 3.5 **突變**：把 `addBounds` 加回去（變成兩組邊界）→ `S08` 要紅
- [ ] 3.6 **突變**：`Door` 的配置項產生碰撞盒 → `S03` 要紅
- [ ] 3.7 **回歸**：`FE-W04-S04`（朝邊界走會停下來）**必須照樣通過** ——
      它的 ID 與 WHEN／THEN 都沒有改

## 4. 可走與構圖（`feat/…--validation`）

- [ ] 4.1 BFS：0.1 格、依 `playerRadius` 膨脹、四方向、**保守判定**
      （格子或移動邊接觸到膨脹後的障礙就算不可走）
- [ ] 4.2 測試 `FE-W11-S10`（出生點到每一個分區都走得到）、`S11`（通道 ≥ 1.0）
- [ ] 4.3 構圖：固定長寬比，用 `orthoFrustum` 算投影 —— `S12`／`S13`
- [ ] 4.4 ⚠️ `S13` 算的是**相機到角色的視線段有沒有穿過物件的包圍盒**，
      **不是**「+Z 一定距離內不得有高物件」那種粗略規則
- [ ] 4.5 **突變**：把走廊入口用一段牆封起來 → `S10` 要紅
- [ ] 4.6 **突變**：在出生點的 +Z 側放一根夠高的柱子 → `S13` 要紅
- [ ] 4.7 **突變**：把一個看板移到畫面外 → `S12` 要紅
- [ ] 4.8 地板 overscan：大小由相機投影到地面的範圍推導，**不寫死常數**
- [ ] 4.9 **突變**：把 overscan 拔掉 → `S14` 要紅

## 5. 驗證與封存（`archive/…`）

- [ ] 5.1 `npm run lint`、`npx tsc --noEmit`、`npx vitest run`
- [ ] 5.2 `node tests/e2e/leak-detection.mjs`（`GuildHall` 不建立 GPU 資源，
      **預期不需要登記**；要確認 `leak-coverage` 沒有變紅）
- [ ] 5.3 **人工瀏覽器**：`/world` 走一圈，確認
      (a) 走得到每一個分區、(b) 沒有卡在家具之間、
      (c) 走到邊緣看不到世界外面、(d) 角色沒有被東西擋住
- [ ] 5.4 送 codex `gpt-5.6-sol` 與 Gemini 3.1 Pro 驗一次
- [ ] 5.5 `openspec archive`、`openspec validate --all --strict`、`progress.sh --check`
