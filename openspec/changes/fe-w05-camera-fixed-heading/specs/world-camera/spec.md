## MODIFIED Requirements

### Requirement: 固定的 Orthographic Elevated 相機

相機 SHALL 使用 orthographic 投影，不得使用 perspective ——
固定視角的俯視世界要的是「同樣大小的東西在畫面上一樣大」。

相機 SHALL 位於 target 的**上方且 +Z 側**（常數 offset），以**固定的世界座標朝向**觀察場景：
朝向由常數 offset **一次決定**（從 `target + offset` 看向 `target` 的方向恆為 `−offset`，與 target 在哪無關），
**MUST NOT 隨 target 每幀重算**。target 靜止時相機 SHALL 收斂到 `target + offset`、target 在畫面中心；
**移動期間 target 得暫時偏離畫面中心**（位置平滑落後），但朝向 MUST NOT 改變。
這個方位保證世界的 **+X 出現在畫面右側、+Z 出現在畫面下方**，
也就是 `world-coordinates` 那份對映的視覺依據。

> ⚠️ **「每幀 `lookAt(target)`」是被禁止的實作**：位置有阻尼、會落後 target，從落後的位置 `lookAt` 移動中的 target，
> 視線就偏離 `−offset`（走速 3 單位/秒、半衰期 0.12 s 約偏 2.5°），起停與變向時反覆擺動 ——
> 這是**只在走路時發生、非使用者主導的旋轉光流**，對前庭敏感者是暈眩源（demo 實測回報「有些人會頭暈」）。

系統 MUST NOT 提供任何讓使用者旋轉或自由移動相機的操作。

#### Scenario: [FE-W05-S01] 投影型別

- **WHEN** 檢查 World 的相機
- **THEN** 它是 orthographic 相機
- **AND** 它不是 perspective 相機

#### Scenario: [FE-W05-S02] +X 在畫面右、+Z 在畫面下

- **WHEN** 把世界座標 `(+1, 0, 0)` 與 `(0, 0, +1)` 投影到畫面
- **THEN** `(+1, 0, 0)` 的畫面水平位置比原點更靠右
- **AND** `(0, 0, +1)` 的畫面垂直位置比原點更靠下

#### Scenario: [FE-W05-S03] 沒有旋轉相機的操作

- **WHEN** 檢查 World 的相機控制
- **THEN** 沒有任何接受使用者輸入來改變相機角度或距離的機制

#### Scenario: [FE-W05-S11] 移動中相機朝向不變

- **GIVEN** 正式的 `WorldCamera` 已建立、target 靜止，記下相機此時的四元數為**基準**
- **WHEN** target 以走路速度連續移動並**反覆變向**（例如往 +X 走、再往 −Z、再回頭），每幀推進相機跟隨，至少 120 幀
- **THEN** **每一幀**相機四元數與基準的夾角（`Quaternion.angleTo`）SHALL ≤ 0.01°（約 1.7e-4 弧度，浮點誤差）
- **AND** 相機位置 SHALL 仍在跟隨：停止移動後繼續推進，`|camera.position − (target + offset)|` SHALL 收斂到接近 0（不是一台不動的相機）
- → 驗於：jsdom（mock `useFrame`／`useThree` 直接驅動正式元件，如 `tests/camera-no-rerender.test.tsx`）

> ⚠️ 兩個 AND 都要。少了「位置仍在跟隨」，一台完全靜止的相機朝向當然不變；少了「每一幀」，只比最後一幀會漏掉移動中的擺動（停下來就收斂回去了）。
> 用夾角不比四元數元件：`q` 與 `−q` 是同一個旋轉。

### Requirement: 跟隨是平滑的，而且與影格率無關

相機 SHALL 平滑地跟隨 target，不得瞬移。**阻尼的是位置，不是朝向** —— 朝向是常數（見〈固定的 Orthographic Elevated 相機〉），
MUST NOT 被阻尼、也 MUST NOT 每幀重算。

平滑 SHALL 與影格率無關：以**半衰期**定義 —— 經過一個半衰期，
相機與 target 的剩餘距離減半。同一段時間拆成幾次更新，結果 SHALL 相同。

**不得**用「每幀乘一個固定係數」那種寫法：那在 120 Hz 的機器上會比
60 Hz 快一倍，而且沒有任何東西會告訴你。

時間間隔不是有限數值時 SHALL 拋出錯誤。
時間間隔極大時（例如分頁切回前景）SHALL 收斂到 target，不得發散或越過它。

#### Scenario: [FE-W05-S04] 一個半衰期之後剩餘距離減半

- **WHEN** 相機與 target 相距一段距離，經過剛好一個半衰期
- **THEN** 剩餘距離是原本的一半（允許浮點誤差）

#### Scenario: [FE-W05-S05] 拆成幾次更新不影響結果

- **WHEN** 用一次 `0.1` 秒的更新，與十次 `0.01` 秒的更新，走過同樣的總時間
- **THEN** 兩者得到的相機位置相同（允許浮點誤差）

#### Scenario: [FE-W05-S06] 極大的時間間隔

- **WHEN** 時間間隔非常大（例如分頁在背景待了 60 秒）
- **THEN** 相機收斂到 target
- **AND** MUST NOT 越過 target，也 MUST NOT 發散

#### Scenario: [FE-W05-S07] 非有限的時間間隔

- **WHEN** 時間間隔是 `NaN` 或 `Infinity`
- **THEN** 更新拋出錯誤
- **AND** MUST NOT 回傳任何位置
