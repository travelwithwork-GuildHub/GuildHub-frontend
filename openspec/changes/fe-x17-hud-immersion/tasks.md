# tasks：`FE-X17 世界 HUD 臨場感`

**切法**：每一刀帶著直接證明它的判準。產品碼上限 250 行／刀。看得見的東西動 `.tsx` 版面／`globals.css`／`src/design/` 前先叫 `ui-ux-pro-max`（已做過方向討論）。

## 1. 自己的名牌（`name-tag`：`FE-X17-S01`／`S02`、`FE-W08-S01` 反轉）

- [ ] 1.1 `NameTags` 渲染一塊「自己」的牌子：文字＝身分 `display_name`、狀態＝自己的 `FE-K05` 狀態；登記節點進 `nodesRef`（特定 key）。
- [ ] 1.2 `LocalPlayer` 每幀把頭頂錨點投影（跟 `RemotePlayer` 同一份 `screenPixelFor`），寫自己牌子節點的 transform／visibility。**不另寫一套投影。**
- [ ] 1.3 自己的牌子視覺上以 accent 區分（邊框或色）。
- [ ] 1.4 判準：`FE-X17-S01`（自己有牌子、文字是自己名字、標示為自己）、`FE-X17-S02`（狀態顯示／清空）、`FE-W08-S01` 改寫（遠端兩塊、不再斷言「沒有自己」）。
- [ ] 1.5 **e2e**：真瀏覽器裡自己頭上看得到自己的名字牌（線上只有自己時也有）。

## 2. 名牌視覺改成 Gather Town 膠囊（`name-tag`，視覺）

- [ ] 2.1 名字盒／狀態改成深色半透明膠囊＋`backdrop-filter` blur＋白字＋`text-shadow`（淺地板也讀得清）；狀態用色點＋短文。
- [ ] 2.2 尺寸判準（`FE-W08-S07`）不破：改樣式不改 176×28 的量測基礎，或同步更新判準（先確認）。

## 3. 常駐 HUD 半透明融合（`dom-visual-system`：`FE-X17-S03`／`S04`）

- [ ] 3.1 加**glass 表面 token**（半透明 surface，深淺色各一；alpha `< 1`）到 `globals.css`／`src/design`。
- [ ] 3.2 `AppHeader`：黑裸字＋白方塊 → 小 logo／emblem ＋線上數膠囊 badge（🟢 1），毛玻璃底、浮起。
- [ ] 3.3 `StatusHud`：白盒 → 毛玻璃、浮起；狀態縮成色點＋單行摘要，點擊才展開編輯。
- [ ] 3.4 `SceneChatHud`：白盒 → 毛玻璃、浮起；預設可收成浮動鈕、展開才出完整面板。
- [ ] 3.5 判準：`FE-X17-S03`（真瀏覽器量 HUD 背景合成 alpha `< 1`、有 `backdrop-filter`、不變暗世界）、`FE-X17-S04`（文字對比 `≥ 4.5:1`）。

## 4. 消滅原生表單感（實作層，走 controls token）

- [ ] 4.1 HUD 內的按鈕改用 `TERTIARY`（無邊框、hover 才浮）；主要動作留 `PRIMARY`；選中狀態低飽和 accent 填色。
- [ ] 4.2 HUD 內輸入框拔原生邊框、改底線或 `surface-sunken`。
- [ ] 4.3 按鈕點擊微動畫（`transform: scale`、尊重 `prefers-reduced-motion`）。
- [ ] 4.4 不破 `FE-X16` 既有判準（data-tier、對比、焦點環、每區至多一主要動作）。

## 5. 情境提示膠囊＋出口鈕降級（`dom-visual-system`：`FE-X17-S05`／`S06`）— demo P0 病灶

- [ ] 5.1 `InteractionPrompt`：白盒（`border-line bg-surface text-ink border`）→ 深色半透明 glass 膠囊（沿用 §3.1 的 glass token）＋圓角＋浮起；`E` 用獨立鍵帽樣式（`<kbd>` 已在，補樣式看得出是一顆鍵）；位置維持 `bottom-gutter left-1/2 -translate-x-1/2`。文字對底 `≥ 4.5:1`。
- [ ] 5.2 `ReturnToHallButton`／`AppHeader`：房間裡不再把「回到 Guild Hall」當常駐具名文字大鈕；收進 overflow／`⋯` 選單項或 icon-only＋`aria-label`，觸發同一個 `returnToHall`。鍵盤可達、讀屏有名。大廳不受影響（大廳本來就沒這顆）。
- [ ] 5.3 判準：`FE-X17-S05`（真瀏覽器量：門前提示背景合成 alpha `< 1`、有 `kbd` 鍵帽、下半部置中、對比 `≥ 4.5:1`）、`FE-X17-S06`（房間裡沒有常駐具名「回到 Guild Hall」大鈕、返回動作鍵盤可達、門前提示在）。
- [ ] 5.4 不破 `FE-V01` 既有 e2e／判準（穿門即走、門前按 E、`returnToHall` 行為不變）。

## 6. 收尾

- [ ] 6.1 全套件綠、`FE-X16` 既有 e2e 與判準不紅、`openspec validate` 綠、`progress.sh --check` 綠。
- [ ] 6.2 **前後截圖**（1440×900 與手機寬），自問「有 3D 體驗了嗎、還像網頁嗎」。
- [ ] 6.3 送 codex／gemini 驗成品。
- [ ] 6.4 部署最新版到正式站（使用者 `vercel --prod`）。
