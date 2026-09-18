# tasks：`fe-x16-dom-visual-and-flow`

四片 `feat/fe-x16-dom-visual-and-flow--<slice>` PR（每片產品碼 ≤250、手寫 ≤800）：`--tokens` → `--shell` → `--flow` → `--surfaces`。
每片：先寫判準（紅）→ commit → 實作（綠）→ 突變（拔掉防禦要紅、紀錄貼 PR）→ 檢查 → **前後截圖貼 PR**（1280×720：
`/login`、訪客提示、看板清單、看板詳情（owner 招募中）、收件匣對話；由 review 對，不進 CI）。
看得見的 tsx 動之前叫 `ui-ux-pro-max`（`--domain ux`／`--stack nextjs`），它是建議不是規格。

## 1. 規格

- [ ] 1.1 規格已在 PR 上談定（`spec/fe-x16-dom-visual-and-flow` 合併進 `main`）。驗證：`pnpm exec openspec validate fe-x16-dom-visual-and-flow --strict` 通過且 PR 已合併
- [ ] 1.2 `docs/WBS.md` 的 `FE-X16` 已在 governance #514 加好；ADR `docs/adr/0011` 隨這個 spec PR 進 main（Status: Proposed → 實作合併後改 Accepted、邊界狀態改「已強制」）

## 2. `--tokens`：token 七類、三級控制項、掃描擴到整個 `src/`（Requirement〈每一類視覺 token 單一來源〉〈文字有四級層次〉〈控制項分三級〉〈動態〉〈預算〉）

- [ ] 2.1 判準先紅：`tests/e2e/dom-visual.mjs` 的 `S02`（font-family 一致、含繁中家族、零字型請求）、`S03`（四級字級）、`S04`（文字對比、空字串要紅）、
      `S10`（三級可區分、焦點環、hover）、`S11`（高度 `≥ 40px`）、`S12`（時長、reduce → `0s`）；jsdom 的 `S01`（掃描 `src/**`、假輸入被抓）
- [ ] 2.2 `globals.css`：`--font-sans`（design D1）、圓角兩級、陰影兩級、`--motion` 與 `prefers-reduced-motion: reduce → 0ms`、`scrim`、`focus`、
      accent 降到白字 `≥ 4.5:1`、`ink-muted` 對兩個 surface 都 `≥ 4.5:1`（D6 的待答在這裡量、數字寫進 PR）；字級四級＋行高
- [ ] 2.3 `controls.ts`：`PRIMARY`／`SECONDARY`／`TERTIARY`／`FIELD` 帶 `data-tier` 的來源（D7）、高度 `≥ 40px`、hover 態、`focus-visible` 環、過渡用 `--motion`
- [ ] 2.4 `colorScan` 的範圍 `src/world/**` → `src/**`（token 定義檔豁免）；`rgb(`／`hsl(`／`oklch(` 也抓
- [ ] 2.5 效能：量 `/world` client JS 與 CSS（gzip）基線與差值（`S18`），寫進 PR

## 3. `--shell`：`PanelShell` 的解剖（Requirement〈表面有三層〉〈每一個阻斷式面板的解剖一致〉）

- [ ] 3.1 判準先紅：e2e `S05`（底 alpha `= 1`、邊界 `3:1`、陰影）、`S06`（遮罩 alpha `[0.3, 0.6]`、關了不在）、`S07`（標題列三個位置、關閉同位、寬度相同）、
      `S08`（30 筆、內容區捲動、標題列不走）；jsdom 的 `S07` 結構半邊（標題列是第一個區塊、返回第一個可聚焦、關閉最後一個）
- [ ] 3.2 `PanelShell`：`back?: { label, onBack }` 插槽（返回在標題列最前）；內容區 `min-h-0 overflow-y-auto`；覆蓋層加 `scrim`；寬度改 token；出現的過渡只動 `opacity`／`transform`
- [ ] 3.3 看板詳情（`ProjectDetail`／`TalentDetail`）與收件匣對話的返回改走殼的插槽（既有 `FE-X06-S12`／`FE-K01-S07` 的焦點行為不變）
- [ ] 3.4 房間密碼視窗與結案確認套上同一層 `scrim`

## 4. `--flow`：一次一個面板、提示讓位、聊天收起（Requirement〈同一時間只有一個阻斷式面板〉）

- [ ] 4.1 判準先紅（jsdom）：`S13`（看板→收件匣→名片→看板）、`S14`（成軍送出中拒絕；回來後接受）、`S15`（提示讓位／回來／關掉不回來）、`S16`（收起顯示 3、展開有 3 則、不持鎖）
- [ ] 4.2 `src/panel/BlockingPanelCoordinator.tsx`：`claim(id)` → 對持有者 `onCloseRequest()` → 接受／拒絕（D3）；三個 provider 登記；`FE-K01-S02` 改走協調者
- [ ] 4.3 `FirstEntryNotice` 讀 `useBlockingPanelOpen()`；`SceneChatHud` 收成一行（D5）
- [ ] 4.4 e2e：`S13`／`S15`／`S16` 在真瀏覽器各走一次（`tests/e2e/dom-visual.mjs` 或 `board-panel.mjs` 補段）
- [ ] 4.5 ADR 0011 改 Accepted、邊界狀態「已強制」、證據補測試路徑

## 5. `--surfaces`：每個表面套上三級與層次（Requirement〈控制項分三級〉〈標題列是固定的導覽〉）

- [ ] 5.1 判準先紅（jsdom）：`S09` 逐表面數 `data-tier="primary"` 且是那一個；`S17` 標題列順序與 `≤ 5`；e2e `S17` 的 rect 不相交
- [ ] 5.2 `/login`：暱稱那條是唯一主要；帳號那一塊次要（D4）
- [ ] 5.3 金鑰交接：複製前「複製鑰匙」主要、複製後「進入世界」主要、「複製鑰匙」退成次要；訪客提示「先四處看看」文字級
- [ ] 5.4 案件詳情：owner 成軍／結案主要；密碼呈現「複製密碼」主要、「寄給隊員」次要；非 owner「私訊發案者」主要
- [ ] 5.5 收件匣、名片、聊天框（「送出」次要）、標題列（品牌左、其餘右）
- [ ] 5.6 前後截圖五張貼 PR；`ui-ux-pro-max` 的 pre-delivery checklist 逐條對

## 6. 突變（驗收條件：拔掉防禦要紅）

- [ ] 6.1 拿掉 `--font-sans` 的繁中家族 → `S02` 紅；把某個表面的內文改成 `14px` → `S03` 紅；`ink-muted` 調淡 → `S04` 紅
- [ ] 6.2 面板底改成半透明 → `S05` 紅；遮罩拿掉 → `S06` 紅；關閉搬到標題列最前 → `S07` 紅；內容區拿掉 `overflow` → `S08` 紅
- [ ] 6.3 `/login` 帳號登入改回主要 → `S09` 紅；焦點環拿掉 → `S10` 紅；`reduce` 的 media query 拿掉 → `S12` 紅
- [ ] 6.4 協調者不呼叫 `onCloseRequest` → `S13` 紅；拒絕不回 `false` → `S14` 紅；提示不讀協調者 → `S15` 紅；聊天框不讀 → `S16` 紅
- [ ] 6.5 假輸入含 `#fff` 掃不到 → `S01` 紅
- [ ] 6.6 每次突變前 commit；突變後還原並重 build `.next`

## 7. 收尾

- [ ] 7.1 每片：`pnpm exec eslint .`、`pnpm exec tsc --noEmit`、`pnpm test` 全綠；e2e 對 `next start` 跑過（`board-panel`、`inbox`、`first-entry`、`form-team`、`scene-chat`、`control-contrast`、`dom-visual`）
- [ ] 7.2 既有判準沒有變紅：`FE-X13`（對比）、`FE-X06`（Escape 層級、焦點）、`FE-A06`（提示不擋世界）、`FE-K04`（聊天記憶體）、`FE-K01-S02`
- [ ] 7.3 合併後 `vercel deploy --prod`、閘道 `/login` smoke（只走不壓）
- [ ] 7.4 Sheet `FE-X16` 進度（使用者先在 Sheet 加列）；每片 PR 回報效能影響
