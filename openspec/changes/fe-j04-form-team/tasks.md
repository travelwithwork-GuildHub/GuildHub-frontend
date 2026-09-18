# tasks：`fe-j04-form-team`

三個 `feat/fe-j04-form-team--<slice>` PR（每個產品碼 ≤250、手寫 ≤800）：`--rooms` → `--inbox` → `--actions`。
每片：先寫判準（紅）→ commit → 實作（綠）→ 突變（拔掉防禦要紅、紀錄貼 PR）→ 檢查。

## 1. 規格

- [ ] 1.1 規格已在 PR 上談定（`spec/fe-j04-form-team` 合併進 `main`）。驗證：`pnpm exec openspec validate fe-j04-form-team --strict` 通過且 PR 已合併

## 2. `--rooms`：門的立即重取（`world-interactive-objects` ADDED；design D5）

- [ ] 2.1 `tests/rooms-refresh.test.tsx`：`S10`（沒在飛就打、在飛等結束再打一次不是兩次、`enabled=false` no-op）；`listRooms` 替身；先 commit 紅
- [ ] 2.2 `useRooms` 回 `refresh`（`pendingRefresh` 在 `finally` 消費）；新 `RoomsRefreshContext`（`WorldCanvas` 提供、預設 no-op）
- [ ] 2.3 **突變**：在飛時直接再打 → `S10` 紅；`pendingRefresh` 不消費 → `S10` 紅；`enabled=false` 也打 → `S10` 紅

## 3. `--inbox`：帶草稿的入口（`inbox` MODIFIED；design D4）

- [ ] 3.1 `tests/inbox-panel.test.tsx`：`FE-J04-S11`（清單、草稿進對話、寄出後清、關閉後清）；先 commit 紅
- [ ] 3.2 `InboxPanelProvider`：`openListWithDraft(text)`、`draft`、寄出成功／關閉時清；`ComposeForm` 多 `initialBody`；`ThreadView` 傳入
- [ ] 3.3 **突變**：寄出後不清草稿 → `S11` 紅；關閉不清 → `S11` 紅；開的是對話不是清單 → `S11` 紅

## 4. `--actions`：成軍／結案（`project-lifecycle` 五條；design D1／D2／D3／D6）

- [ ] 4.1 `tests/project-lifecycle.test.tsx`：`S01`～`S08`（`mountBoard`＋真的 `InboxPanelProvider`＋`RoomsRefreshContext` 的替身；`S02` 用 `vi.mock` 換 `FORM_LIMITS.roomPassword.max`；`S05` 注入會失敗的 `ClipboardPort`；`S08` 掃 location／storage／cookie）；先 commit 紅
- [ ] 4.2 `FORM_LIMITS.roomPassword`；`projectRules.ts` 的 `FormTeamSchema`；`useProjectDetail.replace(project)`；`OwnerActions.tsx`（成軍表單、密碼呈現＋複製＋用私訊寄出、結案＋`CloseConfirm`）；`BoardPanel` 接進 `ownerActions`（成功後 `reload()`、`refreshRooms()`）；`ProjectDetail` 把 `replace` 交給插槽
- [ ] 4.3 **突變**：payload 多 trim → `S03` 紅；成功後重打詳情 → `S03` 紅；500 也 reload 列表 → `S04` 紅；密碼寫進 sessionStorage → `S08` 紅；取消也送 close → `S07` 紅；closed 也給成軍 → `S01` 紅
- [ ] 4.4 `tests/e2e/form-team.mjs`：`S09`（發案 → 成軍 → 複製 → 門長出來且 rooms 請求數增加 → 結案 → 門消失）；對 `next start`＋internal 跑綠；`board-panel.mjs`／`create-project.mjs` 重跑綠

## 5. 收尾

- [ ] 5.1 `ui-ux-pro-max` pre-delivery（密碼欄、確認層、一次性提示）；`pnpm exec eslint --ignore-pattern '.claude/worktrees/**' .`、`pnpm exec tsc --noEmit`、`pnpm test`；`bash .github/scripts/pr-size.sh`
- [ ] 5.2 量 client JS 前後差貼 PR；合併後 `vercel deploy --prod`；閘道單次人工 smoke（只走不壓）
- [ ] 5.3 `archive/fe-j04-form-team`：`openspec validate --archived --strict` 與 `--all --strict`；Sheet `FE-J04` Done
