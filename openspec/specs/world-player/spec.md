# world-player Specification

## Purpose
本地玩家：鍵盤輸入怎麼變成移動、移動怎麼受速度限制、角色朝哪個方向、
以及站著與走路時身體怎麼動。它是 W1 里程碑「進得了 3D 世界、**走得動**」
的那個「走得動」，也是 `world-coordinates` 那份對映第一次有東西可以驗證 ——
在此之前「+Z 是畫面下方」只有數學和相機數學證明過，沒有人真的按下按鍵看過。

## Requirements

### Requirement: 鍵盤輸入變成方向

系統 SHALL 接受 WASD 與方向鍵，把按下的鍵轉成 X／Z 平面上的方向。

按鍵與方向的對應 SHALL 與畫面一致：W／↑ 往畫面上、S／↓ 往畫面下、
A／← 往畫面左、D／→ 往畫面右。畫面方向與世界軸的關係由 `world-camera` 決定。

同時按下相反的兩個鍵時，那個軸的分量 SHALL 是零 —— 而不是任選一邊。

沒有按任何方向鍵時 SHALL 回報零向量。

#### Scenario: [FE-W03-S01] 四個方向鍵

- **WHEN** 分別按下 W、S、A、D
- **THEN** 得到的方向分別對應畫面的上、下、左、右

#### Scenario: [FE-W03-S02] 方向鍵與 WASD 等價

- **WHEN** 按下 ↑ 與按下 W
- **THEN** 得到相同的方向

#### Scenario: [FE-W03-S03] 相反的鍵互相抵消

- **WHEN** 同時按下 W 與 S
- **THEN** 該軸的分量是零

#### Scenario: [FE-W03-S04] 沒有按鍵

- **WHEN** 沒有按下任何方向鍵
- **THEN** 得到零向量

### Requirement: 移動有速度上限，對角線不得更快

角色在 X／Z 平面上的移動速度 SHALL 有上限。

**同時按下兩個方向鍵時，速度 MUST NOT 超過只按一個鍵時的速度。**
沒有正規化的話對角線會快約 41%，而那是一個看得出來但很少有人查得出來的問題。

移動 SHALL 與影格率無關：同一段時間拆成幾次更新，走過的距離 SHALL 相同。

時間間隔不是有限數值時 SHALL 拋出錯誤。

#### Scenario: [FE-W03-S05] 對角線不比直線快

- **WHEN** 同時按下兩個垂直方向的鍵，走過一段時間
- **THEN** 移動的距離不大於只按一個鍵走過同樣時間的距離

#### Scenario: [FE-W03-S06] 移動與影格率無關

- **WHEN** 用一次較長的時間間隔，與多次較短的間隔，走過同樣的總時間
- **THEN** 兩者的位移相同（允許浮點誤差）

#### Scenario: [FE-W03-S07] 非有限的時間間隔

- **WHEN** 時間間隔是 `NaN` 或 `Infinity`
- **THEN** 更新拋出錯誤

### Requirement: 朝向用既有的那一份對映

角色的朝向 SHALL 由 `world-coordinates` 的方向→朝向對映決定。

**MUST NOT 在這裡另外實作一次判斷** —— 那份規格的風險清單第一條就是
「這份對映是唯一一份，但沒有機器擋得住複製」。

方向為零（站著不動）時 SHALL 保留前一個朝向，**角色不得轉頭**。

#### Scenario: [FE-W03-S08] 移動時朝向跟著方向

- **WHEN** 角色往某個方向移動
- **THEN** 它的朝向等於 `world-coordinates` 對該方向給出的值

#### Scenario: [FE-W03-S09] 停下來時不轉頭

- **WHEN** 角色從移動變成靜止
- **THEN** 朝向維持停止前的那一個

### Requirement: Idle 與 Walk 的程式動畫

角色 SHALL 有兩種動畫狀態：靜止時的 Idle、移動時的 Walk。

動畫 SHALL 由時間與速度計算出來，**不使用任何外部動畫檔案**。

動畫相位 SHALL 是連續的 —— 從 Idle 切到 Walk（或反過來）時
MUST NOT 出現跳動。

#### Scenario: [FE-W03-S10] 移動時進入 Walk

- **WHEN** 角色的速度大於零
- **THEN** 動畫狀態是 Walk

#### Scenario: [FE-W03-S11] 靜止時進入 Idle

- **WHEN** 角色的速度是零
- **THEN** 動畫狀態是 Idle

#### Scenario: [FE-W03-S12] 動畫相位連續

- **WHEN** 動畫相位隨時間推進，且中途在 Idle 與 Walk 之間切換
- **THEN** 相位沒有跳動（相鄰兩次取樣的差不超過該段時間應有的變化量）

### Requirement: 相機跟著角色

`world-camera` 的 target SHALL 指向角色的位置。

該位置 SHALL 透過 ref 讀取，MUST NOT 每幀寫入 React state。

#### Scenario: [FE-W03-S13] 角色移動時相機的 target 跟著改變

- **WHEN** 角色的位置改變
- **THEN** 相機讀到的 target 是角色的新位置
- **AND** 該次改變沒有觸發 React 重新渲染
