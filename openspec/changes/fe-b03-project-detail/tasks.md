# tasks：`fe-b03-project-detail`

四個 `feat/fe-b03-project-detail--<slice>` PR（每個產品碼 ≤250、手寫 ≤800）：`--url` → `--owner` → `--detail` → `--wire`。
（原本三片；`--detail` 做完量出 269 行產品碼，按 Requirement〈發案者名片是獨立的載入單元〉切出 `--owner`。）
每片：先寫判準（紅）→ commit → 實作（綠）→ 突變（拔掉防禦要紅、紀錄貼 PR）→ 檢查。

## 1. 規格

- [x] 1.1 規格已在 PR 上談定（`spec/fe-b03-project-detail` 合併進 `main`）。驗證：`pnpm exec openspec validate fe-b03-project-detail --strict` 通過且 PR 已合併 —— #496
- [x] 1.2 `governance/wbs-fe-b03-owner-entry`：`docs/WBS.md` 的 `FE-B03` 兩列改寫（owner 標示＋插槽；成軍／結案可見入口歸 `FE-J04`；進房不在詳情），`progress.sh --check` 綠 —— 先於 1.1 合併 —— #497

## 2. `--url`：網址與選中狀態（`deep-link` MODIFIED；design D4）

- [x] 2.1 `tests/url-state.test.ts`：`FE-B09-S14` 的解析／序列化／canonical（**八種輸入逐一**：帶錯面板 ×2、單獨 `project`＋`page`、兩個單獨 detail、顯式 panel＋兩個 detail、`panel=bogus&project`、不合 UUID、同名重複；定點；`depthOf` 把 `project` 算第 2 層）；`tests/list-panel-route.test.tsx`（provider 層）：`restore` 帶 `project` 時 `selected` 是它、`selectProject` 只在案件面板下有效；**先 commit 紅**。（`deep-link.test.tsx` 的 `S14` 整棵樹判準要有詳情元件才驗得到 → 移到 4.1）
- [x] 2.2 `urlState.ts`：`project` 欄位、canonical 規則；`ListPanelProvider`：`selected` = 開著面板的那一筆、`selectProject`；`PanelUrlSync`：層數含 `project`
- [x] 2.3 **突變**：`panel=projects` 帶 `profile` 不去掉 → `S14` 紅；`depthOf` 不算 `project` → `S14`（push／Escape 那一半）紅；直達時也 push → `S14` 紅（整棵樹的那一半在 4.x；這一片：不驗 UUID／bogus 推導面板／兩個單獨取 project／selected 永遠讀 profile 各紅；「selectProject 在人才面板下也生效」是等價突變 —— `selected` 依面板讀，看不到）

## 3a. `--owner`：發案者名片（ADDED〈發案者名片是獨立的載入單元〉；design D2）

- [x] 3a.1 `tests/owner-card.test.tsx`：`S08`（名片半邊）、`S09`、`S15`、`S16`（`rerender` 換 owner）；先 commit 紅
- [x] 3a.2 `OwnerCard.tsx`：重用 `useProfileDetail`＋名字／外觀色／技能，自己的 `data-phase`、`EmptyState` 失敗、重試
- [x] 3a.3 **突變**：失敗不顯示 → `S09` 紅；印 `bio` → `S08` 紅；`aria-busy` 拿掉 → `S15` 紅

## 3. `--detail`：詳情、動作列（ADDED 三條；design D1／D3；發案者的成對判準）

- [x] 3.1 `tests/project-detail.test.tsx`：`S03`～`S12`、`S15`、`S16`（`contract-server` 替身；`S06` 用 `renderHook` 逐格看沒有「B 的 id 配 A 的內容」；`S16` 用 `replyFor` 的 `after` 把 X 的名片壓到最後；`S09` 發案者 500 時案子 ready、重試只打 profiles；`S11` 訪客走 401；`S12` 掃控制項名字；`S10`「看板關、進對話」要有 `BoardPanel` → 移到 4.1）；先 commit 紅
- [x] 3.2 `useProjectDetail.ts`（照 `useProfileDetail` 的紀律）、`OwnerCard.tsx`（重用 `useProfileDetail`＋`TalentFacts` 精簡版）、`ProjectDetail.tsx`（overlay、返回、Escape 層、焦點、`data-phase`、`FE-X04` 三種失敗、owner 標示＋ `ownerActions` 插槽）、`SendMessageButton` 多 `label`
- [x] 3.3 **突變**：詳情用預覽不打 id → `S03` 紅；identity 檢查拿掉 → `S06` 紅；發案者失敗把本體標成 error → `S09` 紅；owner 也長「私訊發案者」→ `S11` 紅；404 不用 X03 的 `not-found` 語彙 → `S05` 紅（`FE-X04` 的五種狀態封閉、沒有「找不到」那一種：404 是 `load-failed` 形狀＋`not-found` 的句子）；另 案子沒成功就打發案者 → S04／S05 紅、標示給每個人 → S11 紅、floor → S07 紅、預覽 body 當正式 → S04 紅

## 4. `--wire`：卡片變控制項、接上看板、e2e（MODIFIED 卡片；`S01`／`S02`／`S13`／`S14`；design D5）

- [ ] 4.1 `tests/project-card.test.tsx`：`FE-B02-S08` 改成「根是 `button`、裡面沒有第二個控制項」、加 `S02`（Enter／Space）；`tests/board-panel-wiring.test.tsx`：`S01`、`S13`（第 1 頁、非零 `scrollTop`、列表請求總次數不增加）；`tests/create-project.test.tsx` 或新檔（`mountBoard`＋真的 `InboxPanelProvider`）：`S10` 私訊發案者 → 看板關、收件匣在與 owner 的對話；`tests/deep-link.test.tsx`：`FE-B09-S14` 直達 `?panel=projects&project=<id>` 送出 `GET /api/projects/<id>`、不多一層紀錄、Escape 用 replace 回 `?panel=projects`；清單裡開詳情 push 一層、上一頁回清單；先 commit 紅
- [ ] 4.2 `ProjectCard` → `<button>`＋`onOpen`；`BoardPanel` 案件那一支：`selected` → overlay 放 `ProjectDetail`（預覽是列表那一筆）、返回焦點回那張卡、`SendMessageButton label="私訊發案者"`；`create-project` 表單與詳情共用 overlay 插槽（一次只開一個）
- [ ] 4.3 `tests/e2e/board-panel.mjs` 案件那一段：Tab 到第一張卡按 Enter、詳情 `body` 是詳情端點的、發案者名字、返回焦點回卡（`S14`）；對 `next start` 重跑綠；`create-project.mjs` 重跑綠
- [ ] 4.4 **突變**：卡片改回 `<article>` → `S02` 紅；返回時卸載列表 → `S13` 紅

## 5. 收尾

- [ ] 5.1 `ui-ux-pro-max` pre-delivery（詳情版面、焦點、對比）；`pnpm exec eslint --ignore-pattern '.claude/worktrees/**' .`、`pnpm exec tsc --noEmit`、`pnpm test`；`bash .github/scripts/pr-size.sh`
- [ ] 5.2 量 client JS 前後差貼 PR；合併後 `vercel deploy --prod`
- [ ] 5.3 `archive/fe-b03-project-detail`：`openspec validate --archived --strict` 與 `--all --strict`；Sheet `FE-B03` Done
