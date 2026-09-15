# `FE-W16` Project Room —— 任務

每一片是一個 `feat/fe-w16-project-room--<slice>` PR，產品碼（`src/`）≤250 行、手寫合計 ≤800 行。
先寫判準（紅）→ commit → 實作（綠）→ 突變（拔掉防禦要紅）。

## 1. 規格

- [ ] 1.1 規格已在 PR 上談定（`spec/fe-w16-project-room`；兩位外部審查）
- [ ] 1.2 動 tsx／視覺之前先過 `ui-ux-pro-max`（`--domain` 3D 場景構圖與地毯色；輸出不進版控）

## 2. 配置：出口、工位模板、判準（PR：`--layout`；產品碼 ≤180、測試 ≤250）

- [ ] 2.1 先寫單元：`[FE-W16-S01]`（可達性含 8 個站位；門洞放牆要紅）、`[FE-W16-S02]`（門洞可穿、兩段牆不可穿、淨寬明顯大於角色直徑、門廊走不出外層）、`[FE-W16-S03]`（8 個工位、識別字含索引且唯一、純函式、站位互距、W11-S05／S07／S08）、`[FE-W16-S05]`（近端工位與通道入口在畫面內、九個站位視線不被擋、+Z 高物要紅）；`FE-V01-S01`／`S02` 對應的既有測試改成新的斷言 —— 全部先紅
- [ ] 2.2 `projectRoomLayout.ts`：`BOUNDARY_WALLS` ＋ 內側南牆兩段 ＋ 門洞的 `door` 造型 ＋ `stationAt(seatIndex)` 推導 8 組桌椅與站位 ＋ 通道地毯；`ROOM_SPAWN` 移到門洞內側；門洞、桌距、通道淨寬的數字量了記在 design 補記
- [ ] 2.3 突變：內側南牆做成整面 → S01／S02 紅；兩個工位共用識別字 → S03 紅；工位搬出畫面 → S05 紅

## 3. 渲染、碰撞、不互動、錨點（PR：`--anchors`；產品碼 ≤200、測試 ≤250）

- [ ] 3.1 先寫 jsdom：`[FE-W16-S04]`（8 桌 8 椅各一渲染物件與碰撞盒、刪一張兩邊同時消失）、`[FE-W16-S07]`（真實目標選擇路徑；註冊表沒有桌椅；E 沒有請求）、`[FE-W16-S06]`（room 8 個錨點、hall 0 個）
- [ ] 3.2 `SeatAnchorProjector`（照 `DoorLabelProjector`／`labelProjection.ts`；`aria-hidden`、`data-seat-index`、無內容）掛進 `SceneObjects` 的 `room` 分支；錨點 DOM 在 Canvas 外
- [ ] 3.3 突變：桌子註冊 `Interactable` → S07 紅；不掛投影器 → S06 紅；JSX 另畫一張桌 → S04 紅

## 4. 瀏覽器與收尾

- [ ] 4.1 `tests/e2e/project-room.mjs`：`[FE-W16-S08]`（`next start`；有票的深連結進房；八個錨點在 Canvas 內且相對位置符合模板；遠端玩家在 seat 0 旁；錨點里程計往北單調前進；朝 seat 1 走會停；繞回通道到 seat 2；Canvas 同一節點；只設步數上限）；里程計函式抽到 `tests/e2e/lib/` 與 `scene-switch.mjs` 共用
- [ ] 4.2 e2e 加進 `.github/scripts/e2e-main.sh`（`governance/`，獨立 PR）
- [ ] 4.3 `pnpm run typecheck`、`pnpm exec eslint --ignore-pattern '.claude/worktrees/**' .`、`pnpm test`、e2e 對正式建置跑 3 次的結果如實記在這裡
- [ ] 4.4 Google Sheet：`FE-W16` → On-going／Done 各一次
- [ ] 4.5 封存（`archive/fe-w16-project-room`；勾勾先用 `feat/fe-w16-project-room--tasks` 進 main；archive 會把 `world-scenes` 那條 Requirement 整條換掉 —— 對 diff 時確認 `S01`／`S03` 逐字沒變）
