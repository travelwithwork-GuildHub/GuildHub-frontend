# 0012. 名字牌：第三個「render loop → DOM」的消費者；角色自己寫牌子的位置，投影只用既有的 `screenPixelFor`、不抽通用元件

- **Status**: Accepted
- **Date**: 2026-09-19
- **Deciders**: 寫 `FE-W08` 名字牌規格的那個 session；兩位外部審查（規格 PR #522 三輪、實作 PR）
- **邊界狀態**: 已強制
- **證據**: tests/name-tags.test.tsx:109、tests/name-tags.test.tsx:183、tests/e2e/name-tags.mjs:107、src/world/player/RemotePlayer.tsx:102、src/world/NameTags.tsx:27

> `邊界狀態` 與 `證據` 兩欄由 `bash .github/scripts/arch-view.sh` 讀。

## 背景

ADR 0010 記了「render loop 直接寫 Canvas 外面的 DOM」這條路（門標籤、工位錨點），並在〈什麼情況下要重新考慮〉寫：
**出現第三個消費者時，把 `Map` ref ＋ 投影器抽成通用的 `ScreenAnchors`**。名字牌（`FE-W08`）是第三個。

但它跟前兩個有一個結構上的差別：前兩個的錨是**靜態**的（門在牆上、桌子在地上），一個中央投影器每幀掃一遍就好；
名字牌的錨是**角色每幀求值出來的位置**（`remote-interpolation` 的 `evaluate`），而那次求值已經在 `RemotePlayer` 的 `useFrame` 裡發生。

## 選項

### A. 照 ADR 0010 的字面：抽通用 `ScreenAnchors`（節點登記 ＋ 中央投影器），名字牌也走它
- 好：三個消費者一個機制。
- 壞：中央投影器要拿到角色的位置 —— 要嘛再 `evaluate` 一次（同一幀兩次求值、`FE-R08-S20` 的空窗處理複製一份、兩份會漂），
  要嘛讀 `RemotePlayer` 的 group position（誰先跑由 `useFrame` 註冊順序決定，牌子可能落後一幀）。通用元件對三者之一不合身。

### B. 角色自己寫牌子的位置；只抽最小的共用函式
- `RemotePlayer` 在自己的 `useFrame` 裡、寫完 `root.position` 之後，用同一次求值的結果把頭頂錨點投影寫進牌子的 `style`
  （相機與畫布尺寸從 `useFrame` 的 `state` 拿）。
- 共用的只有投影函式：`screenPixelFor(point, target, viewport)`（工位錨點已經在用的那一份；門標籤的 `labelRectFor` 也是從它算的）。`labelProjection.ts` 一行不改。
- 好：一次求值、同一幀、空窗處理只有一份；投影公式仍然只有一份（`toScreen`）。
- 壞：`RemotePlayer` 從「只碰 3D」變成也碰 DOM（透過 `nodesRef` 查自己的節點寫兩個 style 屬性）；「誰寫、什麼時候寫」在三個消費者裡有兩種形狀。

## 決定

選 **B**。ADR 0010 的「重新考慮」條款照做了（重新考慮過），結論是**不抽通用元件** —— 三個消費者的錨點來源不同，
硬抽出來的 `ScreenAnchors` 對其中一個要不是慢一幀就是多算一次。共用的是函式不是元件。

## 邊界

- **投影只有一份**：名字牌、門標籤、工位錨點的螢幕位置都經 `labelProjection.ts` → `framing.ts` 的 `toScreen`；不得另寫公式。
  守它的是 `FE-W08-S04`（位置差等於 `toScreen` 的差）。
- **不進 React**：牌子的位置每幀寫 `style`，名單才進 state。守它的是 `FE-W08-S05`（`Profiler` 數到 0 次 commit）。
- **同一幀、同一次求值**：牌子與角色頭頂投影每幀對齊 ±1 px（`S05` 的另一半）；「另外求值一次並落後一幀」的突變要紅。

## 代價

- `RemotePlayer` 多一個 DOM 依賴（`tagNodesRef`）；單獨測它時要給一個空 Map。
- 三個消費者兩種形狀 —— 下一個人看到門標籤的做法去找「名字牌的投影器」會找不到；設計文件與這份 ADR 是唯一的路標。
- 40 個牌子每幀 40 次 `transform` 寫入：比前兩個消費者多一個量級。**量過**（2026-09-19，`render-budget.mjs` N=40、真後端、swiftshader）：main 19.8 FPS／p99 66.8 ms，這一片 19.7 FPS／p99 66.7 ms —— 在雜訊內；不先判 `inside` 再寫（已經是：`inside` 為 false 只寫 `visibility`）。

## 什麼情況下要重新考慮

- `FE-K05` 把狀態文字接上同一塊牌子：牌子的內容變成兩段，但位置的寫法不變 —— 不需要重開。
- `FE-W14` 改相機（透視、可旋轉）：`toScreen` 的封閉式投影不再成立，三個消費者一起改用 `camera.project`（ADR 0010 同一條）。
- 出現第四個消費者、而且它的錨也是每幀求值的：那時兩種形狀各有兩個，值得把「角色自己寫」抽成 hook。
