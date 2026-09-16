# `FE-W16` Project Room —— 任務

每一片是一個 `feat/fe-w16-project-room--<slice>` PR，產品碼（`src/`）≤250 行、手寫合計 ≤800 行。
先寫判準（紅）→ commit → 實作（綠）→ 突變（拔掉防禦要紅）。

## 1. 規格

- [x] 1.1 規格已在 PR 上談定（`spec/fe-w16-project-room`；兩位外部審查）—— #422，2026-09-15 合併
- [ ] 1.2（流程，不對應 Requirement）動 tsx／視覺之前先過 `ui-ux-pro-max`（`--domain` 3D 場景構圖與地毯色；輸出不進版控）
  - 2026-09-16 `--layout`：查了 `--domain ux`「isometric 3d room desks aisle」與 `--stack threejs`「scene composition」，資料庫沒有 3D 房間構圖的條目（回的是觸控間距、材質／燈光）；這片沒有 tsx、地毯與桌椅沿用 `world-environment` 既有材質色，沒有新的視覺決定。`--anchors` 片再過一次
  - 2026-09-16 `--anchors`：查了 `--domain ux`「invisible positioned anchor overlay aria-hidden screen reader」—— 回的是「Screen Reader：語意 HTML、不要 div soup」；錨點沒有可見內容，做成 `aria-hidden`、`pointer-events-none`、0×0，不進無障礙樹。這片的 tsx 沒有任何看得見的像素，沒有新的視覺決定。剩 e2e 片（不動 tsx）
- [x] 1.3（流程，不對應 Requirement）ADR：錨點的 render loop → DOM 邊界、八格固定容量歸 J13（design D5 補記）
  - 2026-09-16：`docs/adr/0010-seat-anchors-render-loop-to-dom.md`（已強制；證據是這片的三條測試；`arch-view.sh` 對得上）

## 2. 配置：出口、工位模板、判準（PR：`--layout`；產品碼 ≤180、測試 ≤250）

- [x] 2.1 先寫單元：`[FE-W16-S01]`（可達性含 8 個站位與門廊；門洞放牆 → 門廊不可達）、`[FE-W16-S02]`（封門對照組不可達、淨寬 ≥ 2 倍角色直徑、門廊走不出外層）、`[FE-W16-S03]`（索引集合恰好 0–7、三件齊全、左右分組與由南到北（0／4 靠門）、站位在桌與通道之間、椅子在桌子靠牆側、互距 ≥ 2 倍直徑、W11-S05／S07／S08）、`[FE-W16-S05]`（近端工位、通道入口、門洞在畫面內；九個站位視線不被擋；門輪廓 ≥ 角色直徑；視線段上的盒子要紅；門轉向要紅；出生點移到牆北側 1 要紅）；`FE-V01-S01`／`S02` 對應的既有測試改成新的斷言 —— 全部先紅
  - 2026-09-16：`tests/world-layout-project-room.test.ts`（15 條）先紅（commit `f848458`：模組沒有那些匯出）；S05 的視線集合含門的**視覺盒**（門板沒 collider 但不透明，站在門後一樣被擋）
- [x] 2.2 `projectRoomLayout.ts`：`BOUNDARY_WALLS` ＋ 內側南牆兩段 ＋ 門洞的 `door` 造型 ＋ `stationAt(seatIndex)` 推導 8 組桌椅與站位 ＋ 通道地毯；`ROOM_SPAWN` 移到門洞內側；門洞淨寬、桌距、通道淨寬量出來之後，若成為判準的數字（S02 的 2 倍、S08 的容差）需要改，**重開 spec PR** 補進 Requirement，不就地改
  - 2026-09-16：內側南牆 z=9.75（南面 10、門廊 z∈(10,12)）、門洞淨寬 1.8（門造型 1.58，跟走廊開口同一組）、出生點 (0, 6.75)；站位 x=±2.5、桌 ±3.6（`turns:1`）、椅 ±4.6，z = 5 − 4·(i mod 4)；通道地毯寬 4、z 從 7 到 −9。判準的數字（S02 的 2 倍直徑＝1.0、S03 的 2 倍直徑）都沒改，不用重開 spec PR
- [x] 2.3 突變：內側南牆做成整面 → S01 的「門廊可達」紅（S02 的對照組本來就封門，看的是原配置那條）；拿掉外層南牆 → S02 的「邊界以南代表點不可達」紅（搜尋域要延伸到邊界外）；兩個工位共用識別字 → S03 紅；索引順序反過來 → S03 紅；工位搬出畫面 → S05 紅
  - 2026-09-16 執行紀錄（每個突變後 `git checkout` 還原）：① 門洞加一段牆 → S01 門廊可達紅（S02 兩條也紅）；② 濾掉 `boundary-south` → S02「邊界以南不可達」紅（V01-S02 四面也紅）；③ desk id 用 `index % 4` → S03 唯一性紅（W11-S05 也紅）；④ z 順序反過來 → S03 由南到北紅；⑤ 整組往北搬（firstZ −3、pitch 2.2，仍在區域內）→ 只有 S05「看得到完整工位」紅
  - 2026-09-16 第二批（Gemini 審查要求補齊規格〈拔掉什麼會紅〉全部項目）：⑥ 桌子實體 z 寫死 0 → S03 排列紅（審查抓到：原本只量 `stationAt`，實體擺錯測不到；改成量配置裡的桌椅 `z`）；⑦ 出生點放進內側南牆 → S01（一格都走不到）＋S05 紅；⑧ 少一個工位 → S03 集合紅；⑨ 索引 6 重複、缺 7 → S03 集合紅（W11-S05 也紅）；⑩ 不放椅子 → S03 三件紅；⑪ 站位放到桌子外側（stanceX 4.2）→ S03 朝向紅；⑫ 桌子擺到區域外（deskX 11.9）→ W11-S07 紅；⑬ 出生點移到北端 → S05「門洞在畫面內」紅

## 3. 渲染、碰撞、不互動、錨點（PR：`--anchors`；產品碼 ≤200、測試 ≤250）

- [x] 3.1 先寫 jsdom：`[FE-W16-S04]`（整棵房間子樹：8 桌 8 椅各一渲染物件與碰撞盒、刪一張兩邊同時消失；辨識桌型物件用配置的識別字，不用 Three 物件名）、`[FE-W16-S07]`（真實目標選擇路徑；註冊表沒有桌椅；E 沒有請求）、`[FE-W16-S06]`（room 8 個錨點、有限座標、畫面外 hidden；hall 0 個）
  - 2026-09-16：`tests/world-project-room-furniture.test.tsx`（S04 ×2、S06 接線 ×1、S07 ×1）＋ `tests/world-project-room-anchors.test.tsx`（S06 ×6、S07 DOM ×1）先紅（commit `abfe805`：模組不存在）。畫出來的桌子靠**部件幾何實例**辨識（`geometryFor` 的快取），位置再對回配置識別字 —— 不靠 Three 物件名、不靠配置數量；S07 用真的 `LocalPlayer`（Rapier）從站位走到撞上桌子（停在近側面＋角色半徑 ±0.05）
- [x] 3.2 `SeatAnchorProjector`（照 `DoorLabelProjector`／`labelProjection.ts`；`aria-hidden`、`data-seat-index`、無內容）掛進 `SceneObjects` 的 `room` 分支；錨點 DOM 在 Canvas 外
  - 2026-09-16：`src/world/seats/{anchors.ts,SeatAnchors.tsx,SeatAnchorProjector.tsx}`；`labelProjection.ts` 抽出 `screenPixelFor`（門標籤與錨點同一份像素投影，`labelRectFor` 改成它的呼叫端）；錨點 x／z 讀配置裡的桌子、y 讀 definition 的桌面高度（`DESK_TOP` = 0.76，e2e 反算要扣的那個 h）；NaN 不寫進 DOM
- [x] 3.3 突變：桌子註冊 `Interactable` → S07 紅；錨點在 hall 也掛、座標 NaN → S06 紅；JSX 另畫一張桌 → S04 紅（不掛投影器是 S08 的事，e2e 那片再拔）
  - 2026-09-16 執行紀錄（每個突變後 `git checkout` 還原）：① 桌子註冊 `Interactable` → S07 紅；② `SeatAnchors` 與投影器在 hall 也掛 → S06「大廳裡一個都沒有」＋「大廳裡一個都沒被寫」紅；③ `DESK_TOP = NaN` → S06 五條紅；④ `SceneObjects` 的 JSX 另畫一張桌 → S04 兩條紅（9 張）；⑤ 投影器每幀 `setState` → **原本照樣綠**：frame 沒包在 `act` 裡，排隊的重繪沒 flush 就數不到 —— 測試改成 `act` 包 frame（commit `6d922b5`）後紅；⑥ room 分支不掛投影器 → S06「八個節點都被寫了位置」紅（jsdom 這層守「掛了就會寫」；「不掛也不動」仍由 S08 的里程計守）；⑦ 畫面外也 `visible` → S06 紅；⑧ 配置少桌子時靜默略過 → S06「配置錯誤要拋」紅；⑨ `LayoutItems` 不畫 desk → S04 兩條紅；⑩ `screenPixelFor` 的螢幕 y 符號反了 → `FE-W12-S10`（門標籤）＋ S06 跟拍那條紅
  - 2026-09-16 第一輪雙審後補（codex：S06 沒驗 ≤1 px、S04 只在渲染位置找碰撞盒、`DESK_TOP` 寫死 0.76 照樣綠；Gemini：S06 期望用 `isOnScreen` 跟投影器同源、S07 的 DOM 斷言在 mock 掉 `SpatialInteraction` 的殼裡恆真）：S06 期望改成**手算常數**（門廊視角 seat 0／4 在 (424, 78.5)／(856, 78.5) ±1 px、其餘六個寫進 DOM 的像素在畫面外且 hidden）、S04 數**整份碰撞裡全部桌型／椅型盒**再對回渲染位置、新增 `tests/world-project-room-desk-top.test.ts`（把桌面部件抬高 0.5，`DESK_TOP` 與錨點 y 要跟著）、拿掉恆真的 S07 DOM 斷言（那一句由 S07 的目標恆為 null ＋ `FE-W06-S13` 合起來守）。突變：⑪ 投影寫偏 10 px → S06 紅；⑫ `DESK_TOP = 0.76` → desk-top 紅；⑬ `staticBoxesFor` 多回一個放在別處的桌型盒 → S04 兩條紅
  - 2026-09-16 第二輪雙審後補（codex：S06 只對 0／4 比手算、其餘六個偏 10 px 照樣綠；刪桌案例沒驗椅子碰撞盒仍 8。Gemini：S04 的 `orphan` 只保證每個盒子靠近某張桌子、八個盒子全疊在第一張桌子上照樣綠）：S06 八個錨點**全部**對手算位置 ±1 px（z = 5／1／−3／−7 → y = 78.5／−91.2／−260.9／−430.6；x = 424／856）；S04 改成每個渲染位置上**恰好一個**盒子（`perRendered` 全 1）＋總數；刪桌案例加驗椅子碰撞盒 8。突變：⑭ 只對畫面外的錨點寫偏 10 px → S06 紅；⑮ 八個桌型盒全疊在第一張桌子上 → S04 兩條紅；⑯ 缺 `desk-seat-3` 時漏掉 `chair-seat-5` 的盒子 → S04 刪桌案例紅

## 4. 瀏覽器與收尾

- [x] 4.0 量像素常數：照 design 待答的程序跑（正式建置 3 次＋突變 3 次），定出 `DESK_SAMPLE_SIDE`／`DESK_COLOR_DISTANCE`／`DESK_PIXEL_RATIO`，**重開 spec PR** 補進 S08 —— 這條合併前 4.1 不能打勾
  - 2026-09-16 量測（`next start` 正式建置、1280×720、DPR 1、swiftshader；量測腳本放 scratchpad、跑完即刪，不進 repo）：
    s = 53.67（錨點 0／4 相距 386.4 px ÷ 7.2）；方塊 0.4·s = 21 px；地板基準 (181,184,193)、離散 0
    - 正常 ×3：出生視角 seat 0／1／4／5 ＋ 往北走後 seat 1～3／5～7（第 3 次 0～7 全在畫面內）—— 門檻 20／30／40／50／60／80 的比例**全部 100%**
    - 拔桌面 mesh ×3（桌腳、collider、`DESK_TOP` 留著）：seat 0／3／6／7 = 0%；seat 1／2／4／5 在門檻 20 時 15.9～18.8%、門檻 40 時 15.0～17.0%（留下來的桌腳的陰影）
    - 定：`DESK_SAMPLE_SIDE = 0.4·s`、`DESK_COLOR_DISTANCE = 40`、`DESK_PIXEL_RATIO = 60%`（門檻 40 時間隔 83 個百分點 ≥ 20；門檻取中間）
- [ ] 4.1 `tests/e2e/project-room.mjs`：`[FE-W16-S08]`（`next start`；viewport 1280×720、DPR 1；進房前取 Canvas handle；大廳先取 Canvas handle、票先放進 sessionStorage、門前按 E 進房；近端錨點在 Canvas 內、畫面內的錨點相對位置 ≤ 2 px；桌面方塊 vs 桌旁裸地板的像素判準（常數待量：先跑量測程序、重開 spec PR 補數字，補進前這段不打勾）；遠端玩家在 seat 0 旁；錨點里程計往北前進（≤ 1 px 回抖）、通道中點八個錨點都在；從北端走回 seat 1 站位（反算距離 ≤ 0.3；反算先扣桌面高度偏移）再朝桌子走：先連續 3 步 ≥ 2 px 再 plateau 5 步、plateau 距離＝碰撞盒近側＋角色半徑 ± 0.15；繞回通道到 seat 2（模板距離 ± 0.15）；Canvas 同一 handle；只設步數上限）；突變：拿掉桌面 mesh（collider 留）→ 像素那段紅；拿掉桌子 collider（mesh 留）→ plateau 那段紅；不掛投影器 → 里程計那段紅；里程計函式抽到 `tests/e2e/lib/` 與 `scene-switch.mjs` 共用
- [ ] 4.2 e2e 加進 `.github/scripts/e2e-main.sh`（`governance/`，獨立 PR）
- [ ] 4.3 `pnpm run typecheck`、`pnpm exec eslint --ignore-pattern '.claude/worktrees/**' .`、`pnpm test`、e2e 對正式建置跑 3 次的結果如實記在這裡
- [ ] 4.4 Google Sheet：`FE-W16` → On-going／Done 各一次
- [ ] 4.5 封存（`archive/fe-w16-project-room`；勾勾先用 `feat/fe-w16-project-room--tasks` 進 main；archive 會把 `world-scenes` 那條 Requirement 整條換掉 —— 對 diff 時確認 `S01`／`S03` 逐字沒變）
