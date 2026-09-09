## Applicability

權限：不適用 —— 本 change 不做授權判斷
併發：**適用** —— 目標選擇在 render loop 每幀執行，而註冊表由 React 的
掛載／卸載改寫，兩者不同步
持久資料相容性：不適用 —— 不讀寫持久資料
失敗路徑：**適用** —— 目標在按下 `E` 的同一幀消失、兩個物件註冊同一個 id、
兩個候選的分數完全相同、走在兩個物件的邊界上

測試會連到什麼：**不適用 —— 測試不連任何外部服務。** 目標選擇是純函式，
在 jsdom 裡驗得到；提示與按鍵用 `@testing-library/react`。

## ADDED Requirements

### Requirement: 同一時間只有一個互動目標

畫面上任何時刻 MUST 最多只有一個 active target。

「兩個物件同時亮起來」不是折衷方案，是壞掉 —— 使用者按下 `E` 之後
不知道會發生什麼。

選擇的規則，依序：

1. **不在互動範圍內的不列入候選。** 範圍由距離判定
2. **朝向優先於距離。** 角色的朝向與「角色到物件」的方向愈接近，分數愈高 ——
   在俯視角裡，「我面對誰」比「我貼著誰」更能代表意圖
3. **分數接近時維持目前的目標。** 只有當另一個候選相對目前目標有
   **明確的優勢**時才切換
4. **完全平手且沒有目前目標時，用 id 決斷** —— 同樣的輸入永遠得到同樣的輸出

> 第 3 條的「明確的優勢」是一個數值門檻，**它的值不寫在這裡**（見 design 的 Q1）。
> 寫死一個猜出來的數字，實作只會回頭改那個數字，規格 review 就白做了。

#### Scenario: [FE-W06-S01] 範圍外沒有目標

- **WHEN** 所有可互動物件都在互動範圍之外
- **THEN** active target 是「沒有」

#### Scenario: [FE-W06-S02] 範圍內只有一個物件時，它就是目標

- **WHEN** 恰好一個可互動物件在範圍內
- **THEN** 它是 active target

#### Scenario: [FE-W06-S03] 兩個都在範圍內時，朝向的那一個贏

- **WHEN** 兩個物件到角色的距離相同
- **AND** 角色面向其中一個
- **THEN** 被面向的那一個是 active target
- **AND WHEN** 角色轉向另一個
- **THEN** active target 換成另一個

#### Scenario: [FE-W06-S04] 分數接近時維持目前的目標

- **WHEN** 角色站在兩個物件的分數幾乎相同的位置
- **AND** 角色的位置在該位置附近**逐幀微幅來回**
- **THEN** active target 在整段過程中**維持不變**
- **AND** 目標的切換次數 MUST 是有上界的，不隨幀數成長

> **這是使用者看得到的 bug**：沒有這一條，提示會在兩個物件之間閃爍。

#### Scenario: [FE-W06-S05] 完全平手且還沒有目標時，結果是決定性的

- **WHEN** 兩個候選的分數完全相同
- **AND** 目前沒有 active target
- **THEN** 選出來的那一個由候選的 id 決定
- **AND** 同樣的輸入重複計算 MUST 得到同樣的結果

### Requirement: 互動範圍用距離判定，且交出連續的距離

互動範圍 SHALL 由角色與物件之間的距離判定。

contract MUST 同時交出 **active target 的 id** 與 **它與角色的距離**。
距離是連續值，MUST NOT 只交出「在範圍內／不在範圍內」。

**理由是下游需要它**：`FE-V04` 漸進式接近要的是「越靠近顯示越多、
每一步都能退回」，那是連續的。只交 boolean 的話，W11 要把這一層整個換掉。

**MUST NOT 在這裡定義接近度的分級**（`far`／`near`／`adjacent` 之類）。
幾級、閾值多少是 `FE-V04` 的範圍。

#### Scenario: [FE-W06-S06] 有目標時，距離跟著角色移動改變

- **WHEN** 有一個 active target
- **AND** 角色朝它移動
- **THEN** contract 交出的距離變小
- **AND WHEN** 角色遠離它
- **THEN** 距離變大

#### Scenario: [FE-W06-S07] 沒有目標時，距離不是一個會被誤用的數字

- **WHEN** 沒有 active target
- **THEN** contract 交出的目標是「沒有」
- **AND** 距離 MUST NOT 是 `0` 或任何看起來像「就在旁邊」的值

> `0` 是最糟的預設值：下游寫 `if (distance < 1)` 的人會在沒有目標時
> 得到「貼在旁邊」。

### Requirement: 目標改變才通知 React

active target 的計算在 render loop 裡每幀進行，但**通知 React 的次數
MUST 只跟目標真正改變的次數成正比**，不跟幀數成正比。

`CONTEXT.md` 的鐵律是高頻資料不進 React。目標本身是低頻的（走過去才變），
但它是從每幀的計算得出的 —— 中間必須有一道比對。

#### Scenario: [FE-W06-S08] 走在兩個物件之間，重繪次數不隨幀數成長

- **WHEN** 角色在兩個物件附近連續移動很多幀，期間目標改變 N 次
- **THEN** React 的更新次數與 N 同階，**不隨幀數成長**

#### Scenario: [FE-W06-S09] 目標從有變成沒有，也要通知

- **WHEN** 角色走出所有物件的範圍
- **THEN** React 收到「現在沒有目標」的更新
- **AND** 提示消失

### Requirement: `E` 只作用在目前的目標

按下 `E` SHALL 只觸發目前的 active target，且只觸發一次。

#### Scenario: [FE-W06-S10] 有目標時按 E 只觸發那一個

- **WHEN** 有一個 active target，而且範圍內還有其他物件
- **AND** 使用者按下 `E`
- **THEN** 只有 active target 被觸發
- **AND** 其他物件 MUST NOT 被觸發

#### Scenario: [FE-W06-S11] 沒有目標時按 E 什麼都不發生

- **WHEN** 沒有 active target
- **AND** 使用者按下 `E`
- **THEN** 沒有任何物件被觸發，且不得拋錯

#### Scenario: [FE-W06-S12] 目標在按下 E 的同一時刻消失

- **WHEN** active target 對應的物件在按鍵被處理之前就註銷了
- **THEN** 不得觸發那個已經消失的物件
- **AND** 不得拋錯

### Requirement: 提示是 DOM，不是 3D 物件

「按 `E`」的提示 SHALL 由 DOM 呈現。

`CONTEXT.md`：**3D 負責空間，DOM 負責產品操作。** 3D 裡的文字在固定的
Orthographic 相機下會有可讀性與縮放問題，而那不是這一層要解決的事。

#### Scenario: [FE-W06-S13] 有目標時提示出現，並指出是哪一個物件

- **WHEN** 有一個 active target
- **THEN** 畫面上出現一個 DOM 的提示
- **AND** 提示的內容包含那個物件的顯示名稱 —— 不能只寫「按 E」

#### Scenario: [FE-W06-S14] 目標換人時提示跟著換

- **WHEN** active target 從 A 換成 B
- **THEN** 提示的內容變成 B 的顯示名稱

### Requirement: 物件自己註冊，卸載時自己註銷

可互動物件 SHALL 用一個明確的 contract 註冊：**穩定的 id、世界座標、顯示名稱**。
卸載時 MUST 註銷。

**id 重複 MUST 明顯失敗，MUST NOT 靜默覆蓋。** 兩個物件用同一個 id 時，
按 `E` 會觸發哪一個變成不確定 —— 而症狀是「有時候按了沒反應」。

#### Scenario: [FE-W06-S15] 卸載後不得再被選為目標

- **WHEN** 一個可互動物件被卸載
- **AND** 角色仍站在它原本的位置旁
- **THEN** 它 MUST NOT 是 active target
- **AND** 如果它原本是 active target，React 收到目標改變的更新

#### Scenario: [FE-W06-S16] 兩個物件用同一個 id 時明顯失敗

- **WHEN** 兩個可互動物件用同一個 id 註冊
- **THEN** 系統 MUST 明顯失敗（拋錯或在開發環境明確報錯）
- **AND** MUST NOT 靜默地讓後者覆蓋前者
