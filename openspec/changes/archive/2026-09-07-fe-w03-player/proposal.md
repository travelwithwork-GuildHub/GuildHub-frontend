## Why

`/world` 現在有一個 3D 世界、一台定案的相機、一份座標對映 ——
**但裡面沒有人。** 畫面上只有一塊除錯用的地板與一個不會動的方塊。

不做會怎樣：

1. **W1 的里程碑第一句話還沒兌現。** `docs/WBS.md`：
   「進得了 3D 世界、**走得動**、看得到別人」
2. **`FE-W02` 交接過來的驗證還沒人做。** 那份規格證明不了
   「按下往下的鍵，角色在畫面上往下走」—— 它把這件事交給本項。
   現在相機定案了，那個驗證才算數
3. **`FE-R03` PositionSync 沒有東西可以同步。** 位置同步要有一個會動的位置

## What Changes

- 新增一個**程式化的 Chibi 角色**：用 primitive（圓角方塊、膠囊體、球體）
  組出來，**不載入任何外部模型**
- 鍵盤輸入（WASD 與方向鍵）驅動 X／Z 平面上的移動
- **移動有速度上限，而且對角線不得比直線快**
- 朝向用 `world-coordinates` 的對映 —— **import 那一份，不得自己再寫一次**
- Idle 與 Walk 的程式動畫（身體 bounce、手腳擺動）
- 相機的 target 接到角色身上

## Non-goals

- **不做碰撞、世界邊界、穿牆防護** —— `FE-W04`（W1）。
  **本次的角色可以走出地板** —— 那是刻意的，不是遺漏
- **不做正式的模組化 Avatar** —— `FE-W08`（W3）的
  Head / Hair / Body / Arms / Legs 與 Local／Remote 共用。
  本次這隻是簡單版，`FE-W08` 會取代它
- **不做互動與 E 提示** —— `FE-W06`（W1）
- **不做位置同步與網路** —— `FE-R03`（W1）
- **不做 3D 色票與材質規範** —— `FE-W09`（W3）
- **不做遠端玩家** —— `FE-R07`（W1）

## Capabilities

### New Capabilities

- `world-player`: 本地玩家 —— 鍵盤輸入、平面移動與速度限制、朝向、
  以及 Idle／Walk 的程式動畫

### Modified Capabilities

（無。`world-camera` 的 target 本來就是 ref，接上角色不改變它的任何 Requirement。）

## Impact

- **新增**：`src/world/player/` 底下的輸入、移動、動畫與角色元件
- **不新增任何相依套件** —— 角色是 primitive 組出來的
- ⚠️ **架構約束**：`CONTEXT.md`「高頻資料不進 React」——
  位置、朝向、**動畫相位**都不得寫入 React state 或 Zustand，
  只能放 ref 與 Three object transform。違反不會有錯誤訊息，只會變慢
- ⚠️ **`world-coordinates` 是唯一一份**：朝向要 import
  `facingFromDirection`，**不得在這裡再寫一次判斷**（那份 design 的 R1）
- **後續項目**：`FE-W04` 加碰撞、`FE-R03` 把位置送出去、`FE-W08` 換掉這隻角色
