# `FE-W16` Project Room —— 任務

每一片是一個 `feat/fe-w16-project-room--<slice>` PR，產品碼（`src/`）≤250 行、手寫合計 ≤800 行。
先寫判準（紅）→ commit → 實作（綠）→ 突變（拔掉防禦要紅）。

## 1. 規格

- [ ] 1.1 規格已在 PR 上談定（`spec/fe-w16-project-room`；兩位外部審查）
- [ ] 1.2（流程，不對應 Requirement）動 tsx／視覺之前先過 `ui-ux-pro-max`（`--domain` 3D 場景構圖與地毯色；輸出不進版控）
- [ ] 1.3（流程，不對應 Requirement）ADR：錨點的 render loop → DOM 邊界、八格固定容量歸 J13（design D5 補記）

## 2. 配置：出口、工位模板、判準（PR：`--layout`；產品碼 ≤180、測試 ≤250）

- [ ] 2.1 先寫單元：`[FE-W16-S01]`（可達性含 8 個站位與門廊；門洞放牆 → 門廊不可達）、`[FE-W16-S02]`（封門對照組不可達、淨寬 ≥ 2 倍角色直徑、門廊走不出外層）、`[FE-W16-S03]`（索引集合恰好 0–7、三件齊全、左右分組與由南到北（0／4 靠門）、站位在桌與通道之間、椅子在桌子靠牆側、互距 ≥ 2 倍直徑、W11-S05／S07／S08）、`[FE-W16-S05]`（近端工位、通道入口、門洞在畫面內；九個站位視線不被擋；門輪廓 ≥ 角色直徑；視線段上的盒子要紅；門轉向要紅；出生點移到牆北側 1 要紅）；`FE-V01-S01`／`S02` 對應的既有測試改成新的斷言 —— 全部先紅
- [ ] 2.2 `projectRoomLayout.ts`：`BOUNDARY_WALLS` ＋ 內側南牆兩段 ＋ 門洞的 `door` 造型 ＋ `stationAt(seatIndex)` 推導 8 組桌椅與站位 ＋ 通道地毯；`ROOM_SPAWN` 移到門洞內側；門洞淨寬、桌距、通道淨寬量出來之後，若成為判準的數字（S02 的 2 倍、S08 的容差）需要改，**重開 spec PR** 補進 Requirement，不就地改
- [ ] 2.3 突變：內側南牆做成整面 → S01 的「門廊可達」紅（S02 的對照組本來就封門，看的是原配置那條）；拿掉外層南牆 → S02 的「邊界以南代表點不可達」紅（搜尋域要延伸到邊界外）；兩個工位共用識別字 → S03 紅；索引順序反過來 → S03 紅；工位搬出畫面 → S05 紅

## 3. 渲染、碰撞、不互動、錨點（PR：`--anchors`；產品碼 ≤200、測試 ≤250）

- [ ] 3.1 先寫 jsdom：`[FE-W16-S04]`（整棵房間子樹：8 桌 8 椅各一渲染物件與碰撞盒、刪一張兩邊同時消失；辨識桌型物件用配置的識別字，不用 Three 物件名）、`[FE-W16-S07]`（真實目標選擇路徑；註冊表沒有桌椅；E 沒有請求）、`[FE-W16-S06]`（room 8 個錨點、有限座標、畫面外 hidden；hall 0 個）
- [ ] 3.2 `SeatAnchorProjector`（照 `DoorLabelProjector`／`labelProjection.ts`；`aria-hidden`、`data-seat-index`、無內容）掛進 `SceneObjects` 的 `room` 分支；錨點 DOM 在 Canvas 外
- [ ] 3.3 突變：桌子註冊 `Interactable` → S07 紅；錨點在 hall 也掛、座標 NaN → S06 紅；JSX 另畫一張桌 → S04 紅（不掛投影器是 S08 的事，e2e 那片再拔）

## 4. 瀏覽器與收尾

- [ ] 4.0 量像素常數：照 design 待答的程序跑（正式建置 3 次＋突變 3 次），定出 `DESK_SAMPLE_SIDE`／`DESK_COLOR_DISTANCE`／`DESK_PIXEL_RATIO`，**重開 spec PR** 補進 S08 —— 這條合併前 4.1 不能打勾
- [ ] 4.1 `tests/e2e/project-room.mjs`：`[FE-W16-S08]`（`next start`；viewport 1280×720、DPR 1；進房前取 Canvas handle；大廳先取 Canvas handle、票先放進 sessionStorage、門前按 E 進房；近端錨點在 Canvas 內、畫面內的錨點相對位置 ≤ 2 px；桌面方塊 vs 桌旁裸地板的像素判準（常數待量：先跑量測程序、重開 spec PR 補數字，補進前這段不打勾）；遠端玩家在 seat 0 旁；錨點里程計往北前進（≤ 1 px 回抖）、通道中點八個錨點都在；從北端走回 seat 1 站位（反算距離 ≤ 0.3；反算先扣桌面高度偏移）再朝桌子走：先連續 3 步 ≥ 2 px 再 plateau 5 步、plateau 距離＝碰撞盒近側＋角色半徑 ± 0.15；繞回通道到 seat 2（模板距離 ± 0.15）；Canvas 同一 handle；只設步數上限）；突變：拿掉桌面 mesh（collider 留）→ 像素那段紅；拿掉桌子 collider（mesh 留）→ plateau 那段紅；不掛投影器 → 里程計那段紅；里程計函式抽到 `tests/e2e/lib/` 與 `scene-switch.mjs` 共用
- [ ] 4.2 e2e 加進 `.github/scripts/e2e-main.sh`（`governance/`，獨立 PR）
- [ ] 4.3 `pnpm run typecheck`、`pnpm exec eslint --ignore-pattern '.claude/worktrees/**' .`、`pnpm test`、e2e 對正式建置跑 3 次的結果如實記在這裡
- [ ] 4.4 Google Sheet：`FE-W16` → On-going／Done 各一次
- [ ] 4.5 封存（`archive/fe-w16-project-room`；勾勾先用 `feat/fe-w16-project-room--tasks` 進 main；archive 會把 `world-scenes` 那條 Requirement 整條換掉 —— 對 diff 時確認 `S01`／`S03` 逐字沒變）
