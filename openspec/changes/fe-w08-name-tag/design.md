# `FE-W08` 名字牌 —— 設計

## D1｜牌子是 DOM，不是 3D 文字

門標籤（`FE-W12`）與工位錨點（`FE-W16`，ADR 0010）已經走過：3D 裡畫字的三條路（troika／drei `<Html>`／`CanvasTexture`）
都建 GPU texture 或第二套投影機制，違反 ADR 0003 的資源契約。名字牌是第三個消費者，同一條路。
**代價**：牌子跟角色是兩個渲染樹，靠 render loop 每幀對齊；面板開著時牌子要靠 `z-index` 讓面板蓋住（`hud` < `panel`）。

## D2｜每幀寫位置的是 `RemotePlayer` 自己的 `useFrame`，不是另一個投影器

門標籤與工位錨點的錨是**靜態**的，一個中央投影器每幀掃一遍就好。名字牌的錨是**每幀求值出來的角色位置**
（`evaluate(track, now())`，`FE-R08`）。兩個選項：

- **A. 另一個 `NameTagProjector`**：每幀對名單上每個人再 `evaluate` 一次 → 同一幀兩次求值，`FE-R08-S20` 那段「樣本已清、元件還在」的處理要複製一份，兩份會漂。
  或者讀 `RemotePlayer` 的 group position → 誰先跑由 `useFrame` 的註冊順序決定，牌子可能落後一幀（`S05` 的「同一幀」量得出來）。
- **B. `RemotePlayer` 在自己的 `useFrame` 裡、寫完 `root.position` 之後，順手把頭頂錨點投影寫進牌子的 style**。
  相機與畫布尺寸從 `useFrame` 的 `state` 拿（不另訂閱 `useThree`）。一次求值、同一幀、空窗的處理只有一份。

選 **B**。**代價**：`RemotePlayer` 從「只碰 3D」變成也碰 DOM（透過 `nodesRef` 的 Map 查自己的節點；查不到就跳過）。
它仍然不知道 DOM 長什麼樣 —— 只寫 `transform` 與 `visibility`，跟 `DoorLabelProjector` 寫的是同兩個屬性。

## D3｜頭頂錨點：`y = 1.6`

`ChibiPlayer` 的頭是 `position.y = 1.15`、高 `0.58` → 頭頂 `1.44`；再往上 `0.16` 讓牌子不貼著頭。
**這個數字讀常數，不寫死在兩處**：`src/world/player/nameTag.ts` 匯出 `NAME_TAG_ANCHOR_Y`，`FE-W08` 正式版換頭的高度時改那一個。
角色的 `root.position.y` 有起伏（走路動畫寫在 body 的 `position.y`，不在 root），錨點用 root 的 x／z 加固定 y —— 牌子不跟著上下跳。

## D4｜牌子尺寸：176 × 28 CSS px，固定

門標籤是 200 × 34（名稱＋在線數）。名字牌只有名字：寬 176（`CAPTION` 14 px 下約 12 個全形字，之後省略號）、高 28（`CAPTION` 行高 20 ＋ 上下 4）。
**固定寬的理由跟 `FE-W12-S12` 一樣**：名字的長度由後端決定，讓它影響版面等於把版面交給不可控的輸入。
牌子用 `transform: translate(-50%, -100%)` 把底邊中點對到錨點，所以定位只需要那一個點（D6）。
**畫面外的判準跟門標籤刻意不同**：門標籤要整個矩形在畫面內才呈現（`FE-W12-S13`，被切一半的門名會被讀成「那個方向有東西」）；
名字牌跟著一個看得見的人，判的是**錨點在不在畫面內**，矩形越界的部分由容器 `overflow: hidden` 裁掉 ——
不然人站在畫面邊緣 80 px 處名字就憑空消失（審查一輪 Gemini 指出）。
**代價**：超過約 12 個全形字的名字被截，牌子上看不到全名（`textContent` 完整、螢幕閱讀器唸得到；`title` 在 `pointer-events: none` 下不會出現）。
名字上限 20 個 code point，所以最長的名字大約看得到六成。要看全名走名片（`FE-A04`）—— 本 change 不做。

## D5｜名單從 Canvas 裡流到 Canvas 外：一個 callback，跟在線人數同一條路

名單（`roster`）住在 `RemoteWorld`（Canvas 裡）；牌子是 DOM（Canvas 外）。R3F 的 reconciler 不能 portal 到 DOM，
所以 `RemoteWorld` 多一個 `onRosterChange(roster)` callback（跟 `onOnlineCountChange` 同一個形狀、同樣要求身分穩定），
`WorldCanvas` 存成 state、交給 HUD 層的 `<NameTags roster nodesRef>`。名單只在 join／leave 變，低頻，進 React 是對的。
**不**把在線人數改成從名單推導：`OnlineCount.tsx` 有別人的 PR 在改（`FE-R10`），不碰。
**代價**：`WorldCanvas` 再多一個 state；`RemoteWorld` 的 props 再多一個。

節點登記：`NameTags` 每個牌子用 ref callback 把 `HTMLElement` 放進 `nodesRef: Map<id, HTMLElement>`（跟 `useLabelNodes` 同一個做法）；
`RemotePlayers` 把同一個 `nodesRef` 傳給每個 `RemotePlayer`。**兩半靠 ref 接、忘了任一半不會報錯**（ADR 0010 記過這個代價）——
由 `S05` 的真瀏覽器判準守（不接投影 → transform 不變）。

`name` 的合法性（字串、trim 後非空）只在 `NameTags` 判一次：不合法就不渲染那個節點，`RemotePlayer` 查不到節點就跳過。
**不在兩處各判一次**。

## D6｜投影只用既有的 `screenPixelFor`；不抽通用元件；ADR 0012

ADR 0010 的「重新考慮」：出現第三個 render loop → DOM 的消費者時把共用的部分抽出來。考慮過，結論是**什麼都不用抽**：
名字牌只需要一個點（錨點的 CSS 像素與 `inside`），而 `screenPixelFor(point, target, viewport)` 已經是工位錨點在用的那一份
（門標籤的 `labelRectFor` 也是從它算的）。`labelProjection.ts` **一行不改**。
**不抽通用的 `ScreenAnchors` 元件** —— 三個消費者的「誰寫、什麼時候寫」各不相同（中央投影器 × 2、角色自己寫 × 1），
硬抽會多一層對三者都不合身的抽象。ADR 0012 記這條邊界與這個決定。

## D7｜名字牌是 HUD：`dom-shell` 的世界遮蓋判準把它列進白名單

`FE-X16-S05` 的判準掃「面板開著時蓋在世界區上的東西」，HUD 白名單是 `scene-chat, online-count, rooms-notice, door-labels, interaction-prompt`。
`name-tags` 容器加進去 —— 它跟 `door-labels` 是同一種東西。這是測試碼，`feat/` 可改。

## D8｜牌子在第一次投影前 `visibility: hidden`

跟門標籤一樣：沒被投影過的牌子會閃在左上角一幀。初始 `hidden`，第一次寫位置時才 `visible`；
從來沒有位置的人（理論上不會有：`snapshot`／`join` 都帶座標）就一直 `hidden` —— 這就是規格「從來沒有過位置的人 SHALL NOT 呈現牌子」的實作。

## 待答（實作量出來，不寫進 Requirement）

- 40 個牌子每幀寫 40 次 `transform`：跟門標籤（≤ 6）與工位（8）不同量級。`render-budget.mjs` 那支既有的 e2e 在 40 人下量一次幀時間，
  超過 `FE-W13` 的預算就要改成只投影畫面內的人（先判 `inside` 再寫）。數字在 PR 貼。
- 兩個人重疊時牌子疊在一起可不可讀 —— 截圖看；避讓是 Non-goal。
