# world-physics Specification

## Purpose
物理世界：角色會被什麼擋住、走得到哪裡、以及哪些東西只回報重疊而不擋路。
它讓「走得動」變成「走得動但撞得到東西」，也提供 `world-interaction`
之後要用的 sensor 原語。**這一層的正確性全部在 jsdom 裡驗得到** ——
Rapier 跑得起來，所以碰撞與穿牆不必只靠眼睛。

## Requirements

### Requirement: 角色會被靜態障礙物擋住

角色 SHALL 有一個 collider，並以 **kinematic character controller** 移動 ——
它會被靜態物體擋住，但**不會被推動、不會有慣性、不會被重力帶走**。

朝障礙物移動時，角色 SHALL 停在障礙物之前，而不是穿過去或被彈開。

沿著障礙物斜向移動時，角色 SHALL 沿著表面滑動，
而不是完全停住 —— 完全停住會讓玩家覺得被卡住。

#### Scenario: [FE-W04-S01] 走向牆會停下來

- **WHEN** 角色朝一面靜態的牆持續移動
- **THEN** 它停在牆的這一側
- **AND** 它的位置 MUST NOT 越過牆

#### Scenario: [FE-W04-S02] 沿著牆斜走會滑動

- **WHEN** 角色以斜向朝牆移動
- **THEN** 它沿著牆面移動，垂直於牆的分量被擋掉
- **AND** 它 MUST NOT 完全停住

#### Scenario: [FE-W04-S03] 沒有障礙物時照常移動

- **WHEN** 角色朝空曠的方向移動
- **THEN** 它移動的距離等於期望的距離（允許浮點誤差）

### Requirement: 遊玩區域有邊界

系統 SHALL 在遊玩區域四周設置靜態邊界。角色 MUST NOT 走出邊界。

邊界 SHALL 用與其他障礙物相同的機制（靜態 collider），
不得用「把座標夾在範圍內」那種寫法 —— 夾座標會讓角色在邊界上抖動，
而且跟 `FE-W06` 的 sensor 判定對不起來。

#### Scenario: [FE-W04-S04] 朝邊界走會停下來

- **WHEN** 角色朝任一邊界持續移動很長一段時間
- **THEN** 它停在遊玩區域內
- **AND** 它的座標仍在邊界之內

### Requirement: 任何速度都不得穿牆

角色以任何速度移動時 MUST NOT 穿過靜態障礙物。

**單幀位移大於障礙物厚度時尤其危險** —— 用「移動後再檢查有沒有重疊」
那種寫法會直接穿過去，而且低速時測不出來。

#### Scenario: [FE-W04-S05] 單幀位移遠大於牆厚

- **WHEN** 角色以一次遠大於牆厚的位移朝薄牆移動
- **THEN** 它停在牆的這一側
- **AND** 它的位置 MUST NOT 越過牆

### Requirement: Sensor 回報重疊但不擋路

系統 SHALL 支援標記為 sensor 的 collider：它**回報**與角色的重疊，
但 MUST NOT 阻擋角色移動。

這是 `Interaction Range` 的原語（`CONTEXT.md`）。
判定哪個物件可互動、怎麼提示，是 `FE-W06` 的範圍。

#### Scenario: [FE-W04-S06] 走進 sensor 不會被擋

- **WHEN** 角色走進一個 sensor 的範圍
- **THEN** 它照常通過，位置不受影響

#### Scenario: [FE-W04-S07] Sensor 回報重疊

- **WHEN** 角色在 sensor 的範圍內
- **THEN** 系統查得到那個重疊
- **AND WHEN** 角色離開該範圍
- **THEN** 系統查不到那個重疊

### Requirement: 物理狀態不進 React

角色的位置 SHALL 由 Rapier 的 rigid body 持有，
MUST NOT 每幀寫入 React state 或 Zustand。

`CONTEXT.md` 明訂 rigid body 是允許放高頻資料的地方之一。

#### Scenario: [FE-W04-S08] 移動不觸發重新渲染

- **WHEN** 角色連續移動多幀
- **THEN** 角色元件的渲染次數不增加
