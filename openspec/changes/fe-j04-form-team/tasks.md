# tasks：`fe-j04-form-team`

三個 `feat/fe-j04-form-team--<slice>` PR（每個產品碼 ≤250、手寫 ≤800）：`--rooms` → `--backend` → `--actions`（`--actions` 超過上限就按 Requirement 切出 `--reveal`）。
（`--backend` 是 e2e 第一次跑才加的：替身沒有 form-team／close。）
每片：先寫判準（紅）→ commit → 實作（綠）→ 突變（拔掉防禦要紅、紀錄貼 PR）→ 檢查。

## 1. 規格

- [x] 1.1 規格已在 PR 上談定（`spec/fe-j04-form-team` 合併進 `main`）。驗證：`pnpm exec openspec validate fe-j04-form-team --strict` 通過且 PR 已合併 —— #504

## 2. `--rooms`：門的立即重取（`world-interactive-objects` ADDED；design D5）

- [x] 2.1 `tests/rooms-refresh.test.tsx`：`S10`（沒在飛就打、在飛等結束再打一次不是兩次、`enabled=false`／不可見 no-op、在飛時切背景／卸載／`enabled=false` 都不再打、500 → stale）；`listRooms` 替身；先 commit 紅
- [x] 2.2 `useRooms` 回 `refresh`（`pendingRefresh` 只在**沒被中止**的 `finally` 消費；中止時清掉；不可見時 no-op）；新 `RoomsRefreshContext`（`WorldCanvas` 提供、預設 no-op）
- [x] 2.3 **突變**：在飛時直接再打 → `S10` 紅；`pendingRefresh` 不消費 → `S10` 紅；中止的 `finally` 也消費 → `S10` 紅；`enabled=false`／不可見也打 → `S10` 紅；卸載不清把手 → `S10` 紅。「中止的 finally 也消費」單獨拿掉是等價突變（中止前待辦已被清）—— 跟「背景不清待辦」一起拿掉才紅（兩道防線）

## 2b. `--backend`：替身的 form-team／close（`internal-backend` ADDED）

- [ ] 2b.1 `tests/contract/rest/lifecycle.contract.ts`：`S12`（200 十鍵 active、rooms 含、enter 對／錯、非 owner 403、401、404）、`S13`（closed、座位 SQL 為 0、rooms 不含、重複 200、非 owner 403）；先 commit 紅（對 internal 是 404）
- [ ] 2b.2 `src/server/projects.ts`：`formTeam(id, hash)`、`closeProject(id)`（交易：update ＋ delete seats）；兩個 route 檔 `handle({ auth: 'required' })`，owner 檢查 → 403 原句
- [ ] 2b.3 對 `internal` 契約套件綠；對 `guildhub`（本機自起）跑一次綠；**突變**：拿掉 owner 檢查 → `S12`／`S13` 紅；close 不刪座位 → `S13` 紅；form-team 不設 room_template → `S12` 紅（`room_ready` check 會 500）

## 3. `--actions`：成軍／結案（`project-lifecycle` 五條；design D1／D2／D3／D6）

- [ ] 3.1 `tests/project-lifecycle.test.tsx`：`S01`～`S08`（`mountBoard`＋真的 `InboxPanelProvider`＋`RoomsRefreshContext` 的替身，**成功時 `refresh` 恰好一次、失敗時零次**、列表 500／`refresh` 拋錯不回滾；`S02` 用 `vi.mock` 換 `FORM_LIMITS.roomPassword.max`、emoji 以 code point 計；`S05`／`S06` 注入會成功／會失敗的 `ClipboardPort`；`S07` 送出中連按與 Escape／返回被擋、403 語彙；`S08` 在掛載前攔 `setItem`／cookie setter／`pushState`／`replaceState`，原文與 encoded 都掃）；先 commit 紅
- [ ] 3.2 `FORM_LIMITS.roomPassword`；`projectRules.ts` 的 `FormTeamSchema`（code point 計數，跟 `projectTitle` 同一招）；`useProjectDetail.replace(project)`；`OwnerActions.tsx`（成軍表單、密碼呈現＋複製＋寄給隊員（剪貼簿＋`openList(null)`）、結案＋`CloseConfirm`）；`BoardPanel` 接進 `ownerActions`（成功後先 `replace` 再各自 `reload()`、`refreshRooms()`）；`ProjectDetail` 把 `replace` 交給插槽
- [ ] 3.3 **突變**：payload 多 trim → `S03` 紅；成功後重打詳情 → `S03` 紅；成功不呼叫 `refresh` → `S03`／`S07` 紅；500 也 reload 列表／也 `refresh` → `S04`／`S07` 紅；列表失敗回滾詳情 → `S03` 紅；密碼寫進 sessionStorage（之後刪掉）→ `S08` 紅；`.length` 計密碼 → `S02` 紅；取消也送 close → `S07` 紅；closed 也給成軍 → `S01` 紅；剪貼簿失敗也開收件匣 → `S06` 紅
- [ ] 3.4 `tests/e2e/form-team.mjs`：`S09`（發案 → 成軍 → 複製 → 門長出來且 rooms 請求數增加 → 結案 → 門消失）；對 `next start`＋internal 跑綠；`board-panel.mjs`／`create-project.mjs` 重跑綠

## 4. 收尾

- [ ] 4.1 `ui-ux-pro-max` pre-delivery（密碼欄、確認層、一次性提示）；`pnpm exec eslint --ignore-pattern '.claude/worktrees/**' .`、`pnpm exec tsc --noEmit`、`pnpm test`；`bash .github/scripts/pr-size.sh`
- [ ] 4.2 量 client JS 前後差貼 PR；合併後 `vercel deploy --prod`；閘道單次人工 smoke（只走不壓）
- [ ] 4.3 `archive/fe-j04-form-team`：`openspec validate --archived --strict` 與 `--all --strict`；Sheet `FE-J04` Done
