# name-tag Specification

## Purpose
世界裡每一個遠端玩家的頭上有一塊名字牌，寫的是協定送來的那個名字，跟著角色每幀走，
畫面外就不呈現。它讓「看見誰在這裡」在走過去之前就成立（`CONTEXT.md` 那條鏈的第一環），
也是 `FE-R10`「兩個瀏覽器互相看得見對方的名字」的渲染能力。牌子是 DOM 不是 3D 文字，
位置由 render loop 直接寫進 DOM、不進 React —— 跟門標籤、工位錨點同一條路。

## Requirements

### Requirement: 每個遠端玩家頭上有一塊寫著名字的牌子

名單上的每一個遠端玩家 SHALL 各有一塊名字牌，文字 SHALL 等於協定送來的 `name`（不 trim、不改寫、不加前後綴）。
名單改變（`snapshot`／`presence` 的 join／leave）時牌子 SHALL 跟著增減；離開的人的牌子 SHALL 從 DOM 移除。
自己 SHALL NOT 有名字牌。

`name` 不是字串、或去掉頭尾空白後是空字串時，那個人 SHALL NOT 有名字牌 —— **MUST NOT 顯示任何替代字**
（「訪客」「未命名」之類）。理由：`BE-G02` 那一段歷史 —— 一整片「訪客」看起來像前端壞了；沒有名字就是沒有牌子。

#### Scenario: [FE-W08-S01] 名單上有兩個人，畫面上就有他們兩個的名字

- **GIVEN** 偽造的即時後端在 snapshot 裡給了兩個別人：`{name:"小玉"}` 與 `{name:"Ada Lovelace"}`，都站在自己附近
- **WHEN** 世界就緒
- **THEN** 畫面上恰有兩塊名字牌，文字分別是「小玉」與「Ada Lovelace」
- **AND** 沒有任何一塊牌子的文字是自己的名字

#### Scenario: [FE-W08-S02] 進場出場，牌子跟著增減

- **GIVEN** 畫面上有「小玉」的牌子
- **WHEN** 收到 `presence` 說「小玉」離開、「阿明」加入
- **THEN** DOM 裡沒有「小玉」的牌子（不是隱藏，是不在）
- **AND** 有「阿明」的牌子

#### Scenario: [FE-W08-S03] 名字空白或不是字串就沒有牌子

- **WHEN** snapshot 裡有一個人的 `name` 是 `"   "`、另一個是 `""`、另外至少一個有合法的名字
- **THEN** 前兩個人都沒有名字牌
- **AND** 畫面上沒有任何一塊牌子寫著替代字
- **AND** 有合法名字的那個人的牌子照常
- **AND** 把 `name` 不是字串（例如 `null`、數字）的人直接放進名單、渲染名字牌那一層（jsdom，有掛載）時，那些人沒有牌子、有名字的人照常

> ⚠️ 「不是字串」到不了真瀏覽器的名單：`realtime-protocol` 的驗證器對不合協定的訊息是 **fail-closed、整則丟掉**（`FE-R07-S05`），
> 一則帶 `name: null` 的 snapshot 連同裡面合法的人一起被丟。那是既有規格刻意的行為，這裡不改；
> 名單層的判斷仍 SHALL 拒絕非字串（同一份 `hasName`），用單元判準守 —— 兩層各守各的，不在這裡要求「同一則 snapshot 裡合法的人照常」。

### Requirement: 牌子釘在頭頂、跟著角色每幀走，而且不經過 React

牌子的螢幕位置 SHALL 是頭頂錨點用**同一份投影**算出來的像素位置（牌子的底邊中點對齊那個點）。
角色的位置每幀由 `remote-interpolation` 求值，牌子 SHALL 用**同一幀、同一次求值**的結果
—— 牌子 MUST NOT 落後角色一幀以上、MUST NOT 另外求值一次。
位置的更新 SHALL 直接寫進那個元素的 style，MUST NOT 觸發 React 的 render／commit（`CONTEXT.md`：高頻資料不進 React）。
樣本還沒到或已被清掉的那幾幀（`FE-R08-S20` 的空窗），牌子 SHALL 停在上一個位置 —— 跟角色一樣，不跳回原點；
從來沒有過位置的人 SHALL NOT 呈現牌子。

#### Scenario: [FE-W08-S04] 兩個人的位置不同，牌子的位置差等於投影差

- **GIVEN** 兩個遠端玩家站在不同的世界座標
- **THEN** 兩塊牌子的螢幕位置不同
- **AND** 兩者底邊中點的差 SHALL 等於用 `screenPixelFor`（已含 y 軸翻轉的 CSS 像素）從各自頭頂錨點算出來的差（±1 px）

#### Scenario: [FE-W08-S05] 角色移動時牌子每幀跟著走，React 一次都不重繪

- **GIVEN** 一個遠端玩家在畫面上
- **WHEN** 連續收到他的 `pos`，讓他在插值下走了 10 幀以上
- **THEN** 那 10 幀裡牌子的 `transform` 每幀都不同
- **AND** 牌子與角色頭頂的投影點在每一幀都對齊（±1 px）
- **AND** 這期間名字牌那一層的 React render 次數是 0

#### Scenario: [FE-W08-S06] 樣本被清掉的空窗，牌子停在原地

- **GIVEN** 一個遠端玩家的牌子在畫面上某個位置
- **WHEN** 他的樣本被清掉、元件還沒卸載（`FE-R08-S20` 那一幀）
- **THEN** 牌子的位置與上一幀相同，而且仍然呈現
- **AND** 沒有任何錯誤被拋出
- **AND** 另一個剛進名單、還沒有任何樣本的人，他的牌子在有位置之前 SHALL NOT 呈現（不在左上角閃一幀）

### Requirement: 牌子的寬度固定、名字過長截字

牌子 SHALL 有固定的寬與高（design D4），MUST NOT 隨名字長度改變；文字超過寬度 SHALL 截字（可見的省略記號），
MUST NOT 換行、MUST NOT 撐大牌子。`name` 的上限是 20 個 code point（`api-contract` 的 `displayName`），
但牌子 SHALL 以視覺寬度為準 —— 20 個全形字放不下就截。

#### Scenario: [FE-W08-S07] 二十個全形字的名字，牌子寬度不變

- **GIVEN** 一個人的 `name` 是二十個全形字、另一個人的是兩個字
- **THEN** 兩塊牌子的 `getBoundingClientRect().width` 相同、`height` 相同
- **AND** 長名字的牌子只有一行（高度等於短名字的）、`textContent` 仍是完整的名字
- **AND** 真的截了：長名字牌子的 `scrollWidth` 大於 `clientWidth`（內容確實超出盒子）、它的 `overflow-x` 計算值不是 `visible`
  （超出的部分被裁掉）、`text-overflow` 計算值是 `ellipsis`（省略記號看得見）—— 只量牌子的寬會漏掉「漏寫 `overflow: hidden`、字溢出去蓋到別人」與「只裁不加省略記號」

### Requirement: 畫面外不呈現、不擋操作、看得清楚

頭頂錨點的投影**點**不在畫面內時，牌子 SHALL NOT 呈現，也 SHALL NOT 在無障礙樹裡（不要求從 DOM 移除 —— 那是每幀的高頻判斷）。
錨點在畫面內、但牌子的矩形有一部分越出畫面時，牌子 SHALL 照常呈現，由容器裁掉越界的部分。
**這跟門標籤 `FE-W12-S13`（整個矩形要在畫面內）刻意不同**：門在畫面外時被切一半的標籤會被讀成「那個方向有東西」；
名字牌跟著一個**看得見的人**，人站在畫面邊緣 80 px 處名字卻憑空消失才是缺陷。判斷用的是同一份 `screenPixelFor` 的 `inside`。牌子 SHALL NOT 接收指標事件（點牌子等於點它底下的世界）。
牌子的文字對它的底 SHALL 至少 4.5:1 對比、底的 alpha SHALL 為 1（`dom-visual-system` 的表面規則）；
文字與底、邊界、字級 SHALL 只從 token 取值。
牌子 SHALL 在 `hud` 層，面板開著時 SHALL 被面板蓋住（面板在 `panel` 層）。

#### Scenario: [FE-W08-S08] 走遠之後那個人離開畫面，牌子就不呈現也不被唸出來

- **GIVEN** 相機跟著自己（世界固定、畫面跟著自己走）
- **WHEN** 自己走到讓某個遠端玩家站在畫面邊緣、頭頂錨點仍在畫面內但牌子的矩形已越出一部分
- **THEN** 那塊牌子仍然 `visible`（被容器裁掉一部分，不消失）
- **WHEN** 再走到讓那個人的頭頂錨點落在畫面外
- **THEN** 那塊牌子 `visibility` 不是 `visible`、無障礙樹裡沒有它
- **AND** 走回來、錨點回到畫面內之後它又呈現

#### Scenario: [FE-W08-S09] 牌子不擋操作、看得清楚、被面板蓋住

- **GIVEN** 一塊名字牌在畫面上，而且那個人站在看板面板打開後會蓋到的位置（畫面右側）
- **THEN** `document.elementFromPoint(牌子中心)` 不是那塊牌子（它不接收指標事件）
- **AND** 文字對底的對比 ≥ 4.5:1、底的 alpha = 1（顏色畫到 canvas 讀）
- **WHEN** 打開看板面板
- **THEN** `document.elementFromPoint(牌子中心)` 在面板的子樹裡（牌子被面板蓋住，不是只比 `z-index` 的數字）

### Requirement: 房間裡也有名字牌

名字牌 SHALL 在每一個場景都有（Guild Hall 與 Project Room），因為名單在每個場景都有。
換場景時舊場景的牌子 SHALL 隨舊子樹卸載，新場景的牌子 SHALL 由新的名單建立。

#### Scenario: [FE-W08-S10] 進了房間，房間裡的人有名字

- **GIVEN** 偽造的即時後端對 `room:<id>` 這個 scene 的 snapshot 給一個別人「房主」
- **WHEN** 從大廳進入那間房
- **THEN** 畫面上有「房主」的牌子
- **AND** 大廳那些人的牌子不在 DOM 裡
