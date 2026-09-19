# tasks：`fe-j03-my-projects`

三個 `feat/fe-j03-my-projects--<slice>` PR（每個產品碼 ≤250、手寫 ≤800）：`--url`（`view` 進網址與 provider、`listProjects` 的 `status`）→ `--scan`（掃描 hook 與純函式、`ListPanel` 的 `body`、`MyProjects` 元件）→ `--board`（工具列切換、詳情接合、e2e）。
每片：先寫判準（紅）→ commit → 實作（綠）→ 突變（拔掉防禦要紅、紀錄貼 PR）→ 檢查。看得見的 tsx 動之前叫 `ui-ux-pro-max`。

## 1. 規格

- [x] 1.1（#538）規格已在 PR 上談定（`spec/fe-j03-my-projects` 合併進 `main`）。驗證：`pnpm exec openspec validate fe-j03-my-projects --strict` 通過且 PR 已合併

## 2. `--url`：`view=mine` 進網址與 provider；`listProjects` 多 `status`（`deep-link` MODIFIED；design D1）

- [x] 2.1（`url-state.test.ts` 純函式 15 條、`deep-link.test.tsx` 網址半邊 3 條、`list-paging-request.test.ts` 2 條；「不送 page=0」與「返回回到我的案件」要等視圖的畫面，在 `--board`）判準先紅：`tests/deep-link*.test.tsx` 補 `S07`（`view=mine` 開在我的案件且不送 `page=0`；`profiles` 下去掉；`bogus` 去掉；`view=mine` 去 `page`；切換兩次網址依序、`pushState` 零次）；契約判準補 `listProjects({ status })` 的請求形狀
- [x] 2.2 `urlState.ts`（解析／序列化 `view`）、`ListPanelProvider`（`route.view`、`setView`）、`PanelUrlSync`（replace）；`operations.ts` 的 `listProjects` 多 `status`
- [x] 2.3（四個：profiles 下不去掉 → 2 紅；view=mine 留 page（解析）→ 2 紅；序列化寫 page → 1 紅；depthOf 把 view 算一層（等於 push）→ 2 紅）突變：`view` 在 `profiles` 下不去掉 → `S07` 紅；`view=mine` 留 `page` → `S07` 紅；切換用 push → `S07` 紅

## 3. `--scan`：掃描與 `MyProjects`（〈三種狀態逐頁掃描〉〈晚到的回應〉；design D2／D3）

- [x] 3.1（`my-projects.test.tsx` 7 條：純函式 2、S02、S03 ×2、S05 hook 半邊、S04 patch；`list-panel-container.test.tsx` body 1 條；contract-server 的 `replyFor` 可帶 query —— 三種 status 並行時回應要對得上）判準先紅：`tests/my-projects.test.tsx` 的 `S02`（8 個請求、9 筆、排序、看過 128、`closed` 到上限）、`S03`（loading／empty／failed＋重試／blocked）、`S05`（切回招募中晚到不混；重掃作廢）；`tests/list-panel*.test.tsx` 補「有 `body` 時不畫列表與翻頁、`useListPage` 不打」
- [x] 3.2（`ListPanel` 把分頁那一半抽成 `PagedList`，`body` 開著時它不掛；`reload` 由子元件掛載後交上來）`src/projects/myProjectsScan.ts`（`mergeMine`、`nextPage`、`MAX_PAGES=5`）、`src/projects/useMyProjects.ts`（三條並行、generation＋abort）、`src/projects/MyProjects.tsx`（三種狀態、標示、卡片）、`ListPanel` 的 `body`
- [x] 3.3（8 個：6 紅、2 等價 —— 成功回呼不看 aborted／不比 key，abort 之後 fetch 本來就 reject；**拿掉 abort → S05 紅**，切走再切回來 key 相同，abort 是唯一防線，已註明）突變：到上限不停 → `S02` 紅；不滿一頁繼續打 → `S02` 紅；沒過濾 `owner_id` → `S02` 紅；失敗仍呈現部分結果 → `S03` 紅；不比 generation → `S05` 紅

## 4. `--board`：工具列切換、詳情接合、真瀏覽器（〈入口〉〈卡片與詳情共用〉〈真瀏覽器〉；design D4／D5）

- [x] 4.1（`my-projects-board.test.tsx` 4 條：S01、S07 畫面半邊、S04、S05 看板半邊；e2e `my-projects.mjs` 15 綠。量尺坑：「返回」是 `history.go(-1)`，popstate 會打到下一條測試 → 每個返回後等網址落地）判準先紅：`tests/my-projects-board.test.tsx` 的 `S01`（訪客沒有；第 2 頁切過去、切回來 `page=0`）、`S04`（點開詳情、成軍回來已成軍且掃描請求數不變、結案回來已結案仍在）；e2e `tests/e2e/my-projects.mjs` 的 `S06`
- [x] 4.2（`view=mine` 就換 body、身分未問完也先換 —— 不然直達會先送一次 `page=0`；`aria-pressed` 加了看得見的按下狀態：邊界加粗、不填色，S10 才不紅）`BoardPanel`：工具列 `role="group"` 兩顆 `aria-pressed`（`ui-ux-pro-max` 先問）、`view=mine` 時 `body={<MyProjects …/>}`、`onReplaced` 加 `patchMine`、發案成功在 `view=mine` 下重掃
- [x] 4.3（5 個 5 紅：不換 body → S01/S07/S04/S05；不 patch → S04；回來重掃 → S04；訪客也長切換 → S01；body 等身分才換 → S07）突變：切換不換 `body` → `S01` 紅；成軍回來不 `patchMine` → `S04` 紅；成軍回來重掃 → `S04` 紅（請求數）；訪客也長切換 → `S01` 紅
- [x] 4.4（`my-projects` 15、`form-team` 13、`create-project` 18、`board-panel` 36、`control-contrast` 15、`dom-visual` 535 全綠；截圖 `docs/evidence/fe-j03/`）e2e 對 `next start`＋`internal` 跑過（`my-projects`、`form-team`、`board-panel`、`deep-link`、`dom-visual` 的 S09 那一段：工具列一個主要）；截圖貼 PR

## 5. 收尾

- [x] 5.1（三片各自的 PR 都貼了：/world JS +73／±0／±0、CSS ±0／±0／+26、看板 chunk +905；請求只在切到我的案件時發）每片：`pnpm exec eslint .`、`pnpm exec tsc --noEmit`、`pnpm test` 全綠；每片 PR 回報效能影響（board chunk gz 前後差、請求數）
- [x] 5.2（#541 合併後 `guildhub-frontend-8l6lpyiaj`、alias 到正式站；`/world?panel=projects&view=mine` 一次人工 200）合併後 `vercel deploy --prod`、閘道 `/world?panel=projects&view=mine` 一次人工 smoke（只走不壓）
- [x] 5.3（跑了：**bundle 144,509 bytes > 110 KB → exit 2「人工拆開審」**，沒進帳本 —— 三片 diff 98 KB＋規格 35 KB，中文 UTF-8 三倍膀脹；連三片的小 change 都塞不進，上限要治理決定）tasks 全勾後、archive 前：`bash .github/scripts/archive-review.sh fe-j03-my-projects`（背景）；需修正修完 `--rereview` 一次、每條 `--judge`
- [x] 5.4（2026-09-19 Done 100：e2e 對 internal 15 綠＋正式站 smoke 之後才打）Sheet `FE-J03` → Done（瀏覽器層驗過之後才打）
