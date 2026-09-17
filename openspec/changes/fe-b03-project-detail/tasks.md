# tasks：`fe-b03-project-detail`

三個 `feat/fe-b03-project-detail--<slice>` PR（每個產品碼 ≤250、手寫 ≤800）：`--url` → `--detail` → `--wire`。
每片：先寫判準（紅）→ commit → 實作（綠）→ 突變（拔掉防禦要紅、紀錄貼 PR）→ 檢查。

## 1. 規格

- [ ] 1.1 規格已在 PR 上談定（`spec/fe-b03-project-detail` 合併進 `main`）。驗證：`pnpm exec openspec validate fe-b03-project-detail --strict` 通過且 PR 已合併

## 2. `--url`：網址與選中狀態（`deep-link` MODIFIED；design D4）

- [ ] 2.1 `tests/url-state.test.ts`：`FE-B09-S14` 的解析／序列化／canonical（四種錯位組合、`depthOf` 把 `project` 算第 2 層）；`tests/deep-link.test.tsx`：載入 `?panel=projects&project=<id>` 送出 `GET /api/projects/<id>`、Escape 回 `?panel=projects`；**先 commit 紅**
- [ ] 2.2 `urlState.ts`：`project` 欄位、canonical 規則；`ListPanelProvider`：`selected` = 開著面板的那一筆、`selectProject`；`PanelUrlSync`：層數含 `project`
- [ ] 2.3 **突變**：`panel=projects` 帶 `profile` 不去掉 → `S14` 紅；`depthOf` 不算 `project` → `S14`（Escape 那一半）紅

## 3. `--detail`：詳情、發案者名片、動作列（ADDED 四條；design D1／D2／D3）

- [ ] 3.1 `tests/project-detail.test.tsx`：`S03`～`S12`（`contract-server` 替身；`S06` 用 `renderHook` 逐格看沒有「B 的 id 配 A 的內容」；`S09` 發案者 500 時案子 ready、重試只打 profiles；`S10` 用真的 `InboxPanelProvider`；`S12` 掃控制項名字）；先 commit 紅
- [ ] 3.2 `useProjectDetail.ts`（照 `useProfileDetail` 的紀律）、`OwnerCard.tsx`（重用 `useProfileDetail`＋`TalentFacts` 精簡版）、`ProjectDetail.tsx`（overlay、返回、Escape 層、焦點、`data-phase`、`FE-X04` 三種失敗、owner 標示＋ `ownerActions` 插槽）、`SendMessageButton` 多 `label`
- [ ] 3.3 **突變**：詳情用預覽不打 id → `S03` 紅；identity 檢查拿掉 → `S06` 紅；發案者失敗把本體標成 error → `S09` 紅；owner 也長「私訊發案者」→ `S11` 紅；404 畫成載入失敗 → `S05` 紅

## 4. `--wire`：卡片變控制項、接上看板、e2e（MODIFIED 卡片；`S01`／`S02`／`S13`／`S14`；design D5）

- [ ] 4.1 `tests/project-card.test.tsx`：`FE-B02-S08` 改成「根是 `button`、裡面沒有第二個控制項」、加 `S02`（Enter／Space）；`tests/board-panel-wiring.test.tsx`：`S01`、`S13`；先 commit 紅
- [ ] 4.2 `ProjectCard` → `<button>`＋`onOpen`；`BoardPanel` 案件那一支：`selected` → overlay 放 `ProjectDetail`（預覽是列表那一筆）、返回焦點回那張卡、`SendMessageButton label="私訊發案者"`；`create-project` 表單與詳情共用 overlay 插槽（一次只開一個）
- [ ] 4.3 `tests/e2e/board-panel.mjs` 案件那一段：Tab 到第一張卡按 Enter、詳情 `body` 是詳情端點的、發案者名字、返回焦點回卡（`S14`）；對 `next start` 重跑綠；`create-project.mjs` 重跑綠
- [ ] 4.4 **突變**：卡片改回 `<article>` → `S02` 紅；返回時卸載列表 → `S13` 紅

## 5. 收尾

- [ ] 5.1 `ui-ux-pro-max` pre-delivery（詳情版面、焦點、對比）；`pnpm exec eslint --ignore-pattern '.claude/worktrees/**' .`、`pnpm exec tsc --noEmit`、`pnpm test`；`bash .github/scripts/pr-size.sh`
- [ ] 5.2 量 client JS 前後差貼 PR；合併後 `vercel deploy --prod`
- [ ] 5.3 `archive/fe-b03-project-detail`：`openspec validate --archived --strict` 與 `--all --strict`；Sheet `FE-B03` Done
