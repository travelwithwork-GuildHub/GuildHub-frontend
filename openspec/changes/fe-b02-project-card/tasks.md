# tasks：`fe-b02-project-card`

一個 `feat/fe-b02-project-card--card` PR（產品碼 ≤250、手寫 ≤800）。
先寫判準（紅）→ commit → 實作（綠）→ 突變（拔掉防禦要紅、紀錄貼 PR）→ 檢查。

## 1. 規格

- [ ] 1.1 規格已在 PR 上談定（`spec/fe-b02-project-card` 合併進 `main`）。驗證：`pnpm exec openspec validate fe-b02-project-card --strict` 通過且 PR 已合併

## 2. 案件卡（`src/projects/ProjectCard.tsx`、`src/projects/projectStatus.ts`）—— Requirement〈案件卡讓人一眼判斷…〉

- [ ] 2.1 `tests/project-card.test.tsx`：`S01`～`S05`、`S08`（`now` 以 prop 釘住；`S02` 三種狀態互不相同且跟著 `status` 變；`S03` 含恰等於 `now`、沒有 `-\d`；`S04` 屬性＋「未指定」文字；`S05` 含 `room_template`、唯一的 `<time>` 是 `expires_at`；`S08` 根是 `article`、卡內可聚焦元素查詢為空）；**先 commit 紅**
- [ ] 2.2 `projectStatus.ts`：`PROJECT_STATUS_LABEL`（唯一一份）；`ProjectCard`：`<article data-testid="project-card" data-project-id>`、標題（`data-testid="project-card-title"`）、技能 chip（`data-testid="project-skill"`，單行不換行）、
      狀態（`data-testid="project-status"`）、`<time dateTime={expires_at}>`（`data-testid="project-expires"`，`ceil`、≤0 →「已到期」）、座位數（`data-testid="project-seats"`，「N 個座位」）；`Missing` 多 `label` prop（預設「未提供」）、`field` 多 `needed_skills`
- [ ] 2.3 **突變**：`floor` → `S01` 紅；狀態寫死「招募中」→ `S02` 紅；`≤ 0` 改 `< 0` → `S03` 紅；空技能不畫 `Missing`／印「未提供」→ `S04` 紅；把 `body` 或 `room_template` 印上 → `S05` 紅；根改 `<button>` → `S08` 紅

## 3. 接上看板（`src/list-panel/BoardPanel.tsx`）—— Requirement〈專案看板的列項就是案件卡〉

- [ ] 3.1 `tests/board-panel-wiring.test.tsx`：`S06`（兩個列項各一張卡、`data-project-id` 對得上）；先 commit 紅
- [ ] 3.2 `BoardPanel` 案件那一支 `renderItem` 換成 `ProjectCard`，拿掉 `projectLine`；註解「案件那一支的列項仍是佔位」改掉
- [ ] 3.3 `tests/e2e/board-panel.mjs`：fixture 補 `expires_at`（當下 ＋7 天）、`needed_skills`、`seat_count`，案件那一段驗 `S07`；`tests/e2e/create-project.mjs` 的 `firstItemText` 改讀 `[data-testid="project-card-title"]`；兩支對 `next start` 重跑綠
- [ ] 3.4 **突變**：`renderItem` 換回一行標題 → `S06` 紅

## 4. 收尾

- [ ] 4.1 `ui-ux-pro-max` pre-delivery：狀態不靠顏色、chip 不換行、對比；`pnpm exec eslint --ignore-pattern '.claude/worktrees/**' .`、`pnpm exec tsc --noEmit`、`pnpm test`；`bash .github/scripts/pr-size.sh`
- [ ] 4.2 量 `/world` 首屏 JS 前後差貼 PR；合併後 `vercel deploy --prod`
- [ ] 4.3 `archive/fe-b02-project-card`：`openspec validate --archived --strict` 與 `--all --strict`；Sheet `FE-B02` Done
