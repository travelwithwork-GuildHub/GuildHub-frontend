# `FE-W14` 像素／寶可夢風的視覺統一：讓 `/world` 一進去就像個像素世界

## Why

**使用者（視覺主導、demo 前）拍板要把 `/world` 改成像素／寶可夢風。** 原話拆解：不換 3D 引擎、不改 2D、
寶可夢也有 3D 版，要的是「看起來的風格」。到目前為止 `/world` 是一組平滑的方塊與純色平面 ——
使用者第一次看到時的評語是「只是改個配色而已，沒什麼差別」。真正讓它變成像素世界的，是**貼圖＋像素化渲染
＋角色重設計**，不是換色。

這一列是 `docs/WBS.md` 的 `FE-W14 VisualPolish`（與 `FE-X09` 同組「弱裝置、好看」）。它的 charter 已在
governance PR 從原本的「Toy-like／圓角」改為像素方向（圓角是硬邊的反面）。這份 change 是那個方向的規格。

**不做會怎樣**：3D 世界的第一價值是「看見這裡值得靠近」（`CONTEXT.md` 的鏈：看見 → 靠近 → 旁聽 → 加入）。
一個平滑無質感、角色是無臉方塊的世界，使用者的評語已經給了 —— 沒有人想待在裡面。視覺是這個 demo 的主軸，
不做這一列，前面所有功能都掛在一個沒有人想用的畫面上。原型已做出來、使用者驗收通過；這份 change 把驗證過的
配方正式化成規格，讓實作有據可循、之後改視覺有唯一的地方改。

## What Changes

- **新 capability `world-visual-polish`**，收像素風的六條 Requirement：
  1. 暖色像素調色盤（值在 `src/design/world.ts`，`world-design-system` 單一色票原則不變）＋角色對地面可辨識。
  2. 場景材質帶**依 color token 程序生成**的最近鄰像素貼圖（`wood`／`woodDark` 用橫向木紋、其餘用雜訊）；
     **不破壞** `world-design-system` 的材質快取（貼圖只依 token、不事後改寫、同 token 同實例），
     沒有 `document` 時退化為純色不拋錯。
  3. 地面疊像素草地，且**經共用 resource factory 取得**（不在 `WorldShell` 直接 `new CanvasTexture`）。
  4. 像素化渲染：固定低有效 DPR（`0.25`）＋關 antialias＋`image-rendering: pixelated`（最近鄰放大）。
  5. 角色像素外觀：inverted-hull 描邊、框臉髮型、臉部細節（眼／嘴／腮紅）。
  6. 可重用的坐姿姿勢（`seated`）—— 只做姿勢。
- **MODIFIED `world-canvas`**：把「裝置像素比限制在 1 到 2 之間」放寬成「上限 `2`、下限交由渲染面決定」，
  讓像素模式的 `0.25` 合法（`0.25 ≤ 2`，上限仍成立）。兩個既有 Scenario 原樣保留。

## Non-goals

- **不換 3D 引擎、不改 2D。** 只在既有 R3F／three.js 上用程序生成達成像素風。
- **不用外部美術資產。** 不引入 sprite sheet／tileset／GLB —— 那是 `FE-W15` 資產管線的範圍。1:1 GBA 級的
  sprite 品質需要美術工作，本 change 誠實地只到「明顯不一樣、可愛、風格一致」。
- **不做「漂亮地坐在椅子上」。** 坐在正確座位上的定位、面向桌子、走動起身、跟後端座位權威接軌都歸 `FE-J13`
  （空間互動＋座位狀態）。本 change 只提供 `seated` 姿勢這個視覺能力。
- **不改 HUD／DOM 浮層。** 白盒子面板改成 cozy 像素面板是 `FE-X17`（HUD 臨場感）的範圍。
- **不改動畫狀態機。** Idle／Walk 的相位、擺幅不動；`getObjectByName` 的子部位名字（`CHIBI_PARTS`）不動 ——
  改名字會讓動畫靜默停止。走／跑的正式動畫狀態機仍是 `FE-W08`／未來範圍。
- **不改 `world-camera` 的相機參數。** 固定 Orthographic Elevated 相機不動；像素風在現有相機下成立。
- **不動 `avatarLook` 的八款色。** 角色軀幹／四肢的可辨識色差歸 `avatar-appearance`／`FE-A05`／`FE-W19`。
- **不做效能數字目標。** 低 DPR 順帶降 GPU 負擔是加分，但 40 人同畫面的 instancing／LOD 與數字目標歸
  `FE-W13`／`FE-O12`。
