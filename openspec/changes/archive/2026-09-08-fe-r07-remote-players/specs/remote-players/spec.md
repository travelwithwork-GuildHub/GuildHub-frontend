## Purpose

別人在這個世界裡的存在與位置：誰在場、他們在哪、以及那些資料放在哪一層。

分層是這個 capability 最重要的部分，因為放錯層**不會有任何錯誤訊息** ——
`CONTEXT.md` 的原文是「違反這條不會有錯誤訊息，只會變慢」，
而規模是 40 人 × 10 Hz ＝ 每秒 400 次更新。

它也是 W1 里程碑「**看得到別人**」的那一項：做完之後畫面上會真的出現其他人。

## Applicability

權限：不適用 —— 誰在場由後端決定，這一層只反映它說的。
併發：適用 —— 訊息從 WebSocket 進來，而渲染在 render loop 讀同一份資料。
持久資料相容性：不適用 —— 即時層的資料不落 DB，refresh 後清空。
失敗路徑：適用 —— 未知 id 的 `pos`、`leave` 一個不存在的人、
重複 join 同一個人、自己出現在名單裡、元件卸載與 render loop 的競態。
**測試連到什麼**：不適用 —— 測試不連任何外部服務。訊息用固定的資料餵進去。

## ADDED Requirements

### Requirement: 名單與動態分成兩個容器，動態不進 React

系統 SHALL 把遠端玩家的資料分成兩份：

- **名單**：每個人的 `id` 與身分資料（`name`、`av`）。
  這一份 SHALL 進 React —— join / leave 是低頻事件，而且它決定掛幾個元件。
- **動態**：每個人的座標與朝向。這一份 **MUST NOT 寫入 React state 或 Zustand**，
  只能放 ref。

渲染遠端角色的元件 MUST NOT 把座標或朝向當成 props 接收 ——
它只接收穩定的 `id`，在 render loop 裡自己去讀。

理由是 `CONTEXT.md` 的硬規則：**高頻資料不進 React**，
而**違反它不會有錯誤訊息，只會變慢**。`pos` 每秒 10 次 × 40 人 ＝ 每秒 400 次；
每一次都觸發 React 的協調，就是每秒 400 次重繪 40 個角色。

#### Scenario: [FE-R07-S01] 收到位置更新時，名單不會改變

- **WHEN** 名單已經建立，之後收到同一批人的位置更新
- **THEN** 動態資料改變了
- **AND** 名單的內容與其身分**完全沒有變**（連物件本身都沒有被換掉）

> 只斷言「名單內容相等」是不夠的：每次都建一個內容相同的新陣列，
> React 照樣會重繪。要驗的是**沒有產生新的名單**。

### Requirement: snapshot 建立名單，而且排除自己

收到 `snapshot` 時系統 SHALL 用它重建整份名單與動態。

**自己 MUST NOT 出現在遠端玩家裡。** 實測 `snapshot` 的 `players`
**包含自己**（第一個元素的 `id` 就是 `hello` 的 `you`）——
沒有排除的話，畫面上會有一個跟本地角色重疊、而且跟著它走的分身。

每個人的初始座標與朝向 SHALL 取自 `snapshot` 的內容。
**不可以等第一則 `pos` 才決定位置** —— 一個進來之後就沒動過的人
**永遠不會出現在 `pos` 裡**（靜止時後端整則不送）。

#### Scenario: [FE-R07-S02] snapshot 建立名單並排除自己

- **WHEN** 收到一則包含自己與另外兩個人的 `snapshot`
- **THEN** 名單裡有兩個人，**不含自己**
- **AND** 那兩個人的座標來自 `snapshot`，不是預設值

#### Scenario: [FE-R07-S03] 後來的 snapshot 取代整份名單

- **WHEN** 已經有名單，之後收到一則只含另一個人的 `snapshot`
- **THEN** 名單裡只剩那一個人
- **AND** 前一批人的動態資料也被清掉了

### Requirement: presence 的 join 與 leave 在同一則裡處理

`presence` **把 join 與 leave 合併成一則**（後端如此）。
系統 SHALL 在同一則裡處理兩者。

`leave` SHALL 是**原子的清理**：把那個人從**名單與動態兩邊**移除。
只清一邊的話，動態那一份會隨著連線時間累積 ——
而且同一個 id 之後再出現時會讀到舊位置。

以下三種都 MUST NOT 造成錯誤或改變其他人的資料：
`leave` 一個不在名單裡的 id、`join` 一個已經在名單裡的 id、
以及 `join` 裡出現自己。

#### Scenario: [FE-R07-S04] 一則 presence 同時處理進場與離場

- **WHEN** 收到一則 `presence`，`join` 有一個新的人、`leave` 有一個現有的人
- **THEN** 名單裡多了新的那個、少了離開的那個
- **AND** 離開的那個人的動態資料也被清掉了
- **AND** 沒有被提到的人完全沒有受影響

#### Scenario: [FE-R07-S05] 不合常理的 presence 不得造成錯誤

- **WHEN** `leave` 一個不在名單裡的 id
- **THEN** 不拋錯，其他人的資料不變
- **AND WHEN** `join` 一個已經在名單裡的 id
- **THEN** 不拋錯，那個人不會出現兩次
- **AND WHEN** `join` 裡出現自己
- **THEN** 自己不會被加進遠端玩家

### Requirement: pos 只更新已知的人，並在寫入時就換算成世界座標

收到 `pos` 時系統 SHALL 更新對應的人的目標座標與朝向。

**不在名單裡的 id SHALL 被忽略**，MUST NOT 因此建立一個新的人 ——
名單只由 `snapshot` 與 `presence` 決定。`pos` 是差量，不是名單來源。

協定的整數像素 SHALL 在**寫入的時候**換算成世界座標，
**MUST NOT 留到 render loop 每一幀換算**。換算規則來自 `world-coordinates`，
MUST NOT 在這裡重寫。

#### Scenario: [FE-R07-S06] pos 更新已知的人，忽略不認識的 id

- **WHEN** 收到一則 `pos`，其中一個 id 在名單裡、另一個不在
- **THEN** 在名單裡的那個人的目標座標與朝向被更新
- **AND** 不在名單裡的那個 id **沒有**被加進名單
- **AND** 存起來的是世界座標，不是協定的整數像素

### Requirement: 名單上的每個人都在畫面上有一個角色

系統 SHALL 為名單上的每一個人渲染一個角色，並在 render loop 裡
把該角色的位置與朝向設成動態資料裡的值。

角色 SHALL 重複使用既有的程式化 Chibi 角色，MUST NOT 另做一套。

**這一刀的遠端角色會每 100 毫秒跳一格**（後端 `HZ = 10`）。
那**不是缺陷，是這一刀的範圍**：previous / target、平滑、jitter、缺包、
teleport threshold 全部屬於 `FE-R08`。朝向同樣是直接切換。

render loop 在寫入 transform 之前 SHALL 確認角色物件還在 ——
`leave` 造成的卸載與 render loop 之間有競態。

#### Scenario: [FE-R07-S07] 名單改變時，畫面上的角色跟著增減

- **WHEN** 名單上有兩個人
- **THEN** 畫面上有兩個遠端角色
- **AND WHEN** 其中一個離開
- **THEN** 畫面上只剩一個遠端角色

#### Scenario: [FE-R07-S08] 遠端角色的位置來自動態資料，不是 props

- **WHEN** 一個遠端角色已經在畫面上，之後它的動態資料被更新
- **THEN** 下一次 render loop 之後，那個角色的位置變成新的值
- **AND** 過程中**沒有發生任何 React 重繪**
