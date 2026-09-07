## Purpose

World 的相機：投影型別、方位、跟隨與平滑，以及視窗尺寸改變時的構圖。
它同時是 `world-coordinates` 那份「+X 是畫面右、+Z 是畫面下」對映在畫面上
成立的**物理依據** —— 那個對映本身是純數學，能不能對應到使用者看到的東西，
完全由相機擺在哪裡決定。相機一轉，對映就跟視覺脫鉤，而兩邊的測試都會是綠的。

## Applicability

權限：不適用 —— 不做授權判斷
併發：不適用 —— 相機的更新只在 render loop 裡發生
持久資料相容性：不適用 —— 不讀寫任何持久資料
失敗路徑：適用 —— 非有限的時間間隔、極大的時間間隔（分頁切回前景）
測試環境：**不適用 —— 測試不連任何外部服務。** 平滑是純函式；
方位與構圖用 three.js 的相機數學驗證，**不需要 WebGL 也不需要瀏覽器**

## ADDED Requirements

### Requirement: 固定的 Orthographic Elevated 相機

相機 SHALL 使用 orthographic 投影，不得使用 perspective ——
固定視角的俯視世界要的是「同樣大小的東西在畫面上一樣大」。

相機 SHALL 位於 target 的**上方且 +Z 側**，並看向 target。
這個方位保證世界的 **+X 出現在畫面右側、+Z 出現在畫面下方**，
也就是 `world-coordinates` 那份對映的視覺依據。

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

### Requirement: 跟隨是平滑的，而且與影格率無關

相機 SHALL 平滑地跟隨 target，不得瞬移。

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

### Requirement: target 以 ref 傳遞，不進 React state

相機的 target SHALL 透過 mutable ref 讀取，**MUST NOT** 每幀寫入
React state 或以值的形式當作 prop 傳遞。

`CONTEXT.md` 明訂「高頻資料不進 React」。違反這條**不會有錯誤訊息，
只會變慢** —— 角色每幀移動就會觸發整棵樹重新渲染。

#### Scenario: [FE-W05-S08] target 改變不觸發重新渲染

- **WHEN** target 的座標在 ref 上被改變多次
- **THEN** 相機元件的渲染次數不增加

### Requirement: 視窗尺寸改變時維持構圖

視窗尺寸改變時，**垂直可見的世界範圍 SHALL 保持不變**，
水平可見範圍 SHALL 隨長寬比改變。

也就是說：視窗變寬時看到更多左右，而不是把世界拉扁。

#### Scenario: [FE-W05-S09] 變寬時垂直範圍不變

- **WHEN** 長寬比從 `4:3` 變成 `21:9`
- **THEN** 垂直可見的世界高度不變
- **AND** 水平可見的世界寬度變大

#### Scenario: [FE-W05-S10] 世界不被拉扁

- **WHEN** 在任一長寬比下，把世界座標上一個正方形投影到畫面
- **THEN** 它在畫面上的長寬比與畫布的長寬比一致（沒有額外變形）
