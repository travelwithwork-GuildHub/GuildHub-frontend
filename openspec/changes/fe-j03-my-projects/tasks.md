# tasks：`fe-j03-my-projects`

三個 `feat/fe-j03-my-projects--<slice>` PR（每個產品碼 ≤250、手寫 ≤800）：`--url`（`view` 進網址與 provider、`listProjects` 的 `status`）→ `--scan`（掃描 hook 與純函式、`ListPanel` 的 `body`、`MyProjects` 元件）→ `--board`（工具列切換、詳情接合、e2e）。
每片：先寫判準（紅）→ commit → 實作（綠）→ 突變（拔掉防禦要紅、紀錄貼 PR）→ 檢查。看得見的 tsx 動之前叫 `ui-ux-pro-max`。

## 1. 規格

- [ ] 1.1 規格已在 PR 上談定（`spec/fe-j03-my-projects` 合併進 `main`）。驗證：`pnpm exec openspec validate fe-j03-my-projects --strict` 通過且 PR 已合併

## 2. `--url`：`view=mine` 進網址與 provider；`listProjects` 多 `status`（`deep-link` MODIFIED；design D1）

- [ ] 2.1 判準先紅：`tests/deep-link*.test.tsx` 補 `S07`（`view=mine` 開在我的案件且不送 `page=0`；`profiles` 下去掉；`bogus` 去掉；`view=mine` 去 `page`；切換兩次網址依序、`pushState` 零次）；契約判準補 `listProjects({ status })` 的請求形狀
- [ ] 2.2 `urlState.ts`（解析／序列化 `view`）、`ListPanelProvider`（`route.view`、`setView`）、`PanelUrlSync`（replace）；`operations.ts` 的 `listProjects` 多 `status`
- [ ] 2.3 突變：`view` 在 `profiles` 下不去掉 → `S07` 紅；`view=mine` 留 `page` → `S07` 紅；切換用 push → `S07` 紅

## 3. `--scan`：掃描與 `MyProjects`（〈三種狀態逐頁掃描〉〈晚到的回應〉；design D2／D3）

- [ ] 3.1 判準先紅：`tests/my-projects.test.tsx` 的 `S02`（8 個請求、9 筆、排序、看過 128、`closed` 到上限）、`S03`（loading／empty／failed＋重試／blocked）、`S05`（切回招募中晚到不混；重掃作廢）；`tests/list-panel*.test.tsx` 補「有 `body` 時不畫列表與翻頁、`useListPage` 不打」
- [ ] 3.2 `src/projects/myProjectsScan.ts`（`mergeMine`、`nextPage`、`MAX_PAGES=5`）、`src/projects/useMyProjects.ts`（三條並行、generation＋abort）、`src/projects/MyProjects.tsx`（三種狀態、標示、卡片）、`ListPanel` 的 `body`
- [ ] 3.3 突變：到上限不停 → `S02` 紅；不滿一頁繼續打 → `S02` 紅；沒過濾 `owner_id` → `S02` 紅；失敗仍呈現部分結果 → `S03` 紅；不比 generation → `S05` 紅

## 4. `--board`：工具列切換、詳情接合、真瀏覽器（〈入口〉〈卡片與詳情共用〉〈真瀏覽器〉；design D4／D5）

- [ ] 4.1 判準先紅：`tests/my-projects-board.test.tsx` 的 `S01`（訪客沒有；第 2 頁切過去、切回來 `page=0`）、`S04`（點開詳情、成軍回來已成軍且掃描請求數不變、結案回來已結案仍在）；e2e `tests/e2e/my-projects.mjs` 的 `S06`
- [ ] 4.2 `BoardPanel`：工具列 `role="group"` 兩顆 `aria-pressed`（`ui-ux-pro-max` 先問）、`view=mine` 時 `body={<MyProjects …/>}`、`onReplaced` 加 `patchMine`、發案成功在 `view=mine` 下重掃
- [ ] 4.3 突變：切換不換 `body` → `S01` 紅；成軍回來不 `patchMine` → `S04` 紅；成軍回來重掃 → `S04` 紅（請求數）；訪客也長切換 → `S01` 紅
- [ ] 4.4 e2e 對 `next start`＋`internal` 跑過（`my-projects`、`form-team`、`board-panel`、`deep-link`、`dom-visual` 的 S09 那一段：工具列一個主要）；截圖貼 PR

## 5. 收尾

- [ ] 5.1 每片：`pnpm exec eslint .`、`pnpm exec tsc --noEmit`、`pnpm test` 全綠；每片 PR 回報效能影響（board chunk gz 前後差、請求數）
- [ ] 5.2 合併後 `vercel deploy --prod`、閘道 `/world?panel=projects&view=mine` 一次人工 smoke（只走不壓）
- [ ] 5.3 tasks 全勾後、archive 前：`bash .github/scripts/archive-review.sh fe-j03-my-projects`（背景）；需修正修完 `--rereview` 一次、每條 `--judge`
- [ ] 5.4 Sheet `FE-J03` → Done（瀏覽器層驗過之後才打）
