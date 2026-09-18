# tasks：`fe-j04-form-team`

四個 `feat/fe-j04-form-team--<slice>` PR（每個產品碼 ≤250、手寫 ≤800）：`--rooms` → `--backend` → `--actions` → `--reveal`。
（`--actions` 做完量出 336 行產品碼／872 手寫，按 Requirement〈密碼只在這一次詳情裡呈現〉切出 `--reveal`：S05／S06／S08 與 e2e S09。）
（`--backend` 是 e2e 第一次跑才加的：替身沒有 form-team／close。）
每片：先寫判準（紅）→ commit → 實作（綠）→ 突變（拔掉防禦要紅、紀錄貼 PR）→ 檢查。

## 1. 規格

- [x] 1.1 規格已在 PR 上談定（`spec/fe-j04-form-team` 合併進 `main`）。驗證：`pnpm exec openspec validate fe-j04-form-team --strict` 通過且 PR 已合併 —— #504

## 2. `--rooms`：門的立即重取（`world-interactive-objects` ADDED；design D5）

- [x] 2.1 `tests/rooms-refresh.test.tsx`：`S10`（沒在飛就打、在飛等結束再打一次不是兩次、`enabled=false`／不可見 no-op、在飛時切背景／卸載／`enabled=false` 都不再打、500 → stale）；`listRooms` 替身；先 commit 紅
- [x] 2.2 `useRooms` 回 `refresh`（`pendingRefresh` 只在**沒被中止**的 `finally` 消費；中止時清掉；不可見時 no-op）；新 `RoomsRefreshContext`（`WorldCanvas` 提供、預設 no-op）
- [x] 2.3 **突變**：在飛時直接再打 → `S10` 紅；`pendingRefresh` 不消費 → `S10` 紅；中止的 `finally` 也消費 → `S10` 紅；`enabled=false`／不可見也打 → `S10` 紅；卸載不清把手 → `S10` 紅。「中止的 finally 也消費」單獨拿掉是等價突變（中止前待辦已被清）—— 跟「背景不清待辦」一起拿掉才紅（兩道防線）

## 2b. `--backend`：替身的 form-team／close（`internal-backend` ADDED）

- [x] 2b.1 `tests/contract/rest/lifecycle.contract.ts`：`S12`（200 十鍵 active、rooms 含、enter 對／錯、再成軍換密碼、非 owner 403、401、404、422）、`S13`（closed、座位 SQL 為 0、rooms 不含、重複 200、非 owner 403、401、404）；先 commit 紅（對 internal 是 404）
- [x] 2b.2 `src/server/projects.ts`：`formTeam(id, hash)`、`closeProject(id)`（交易：update ＋ delete seats）；兩個 route 檔 `handle({ auth: 'required' })`，owner 檢查 → 403 原句
- [x] 2b.3 對 `internal` 契約套件綠；對 `guildhub`（本機自起）跑一次綠（54 passed｜3 skipped｜11 todo）；internal 57 passed｜11 todo；**突變**：拿掉 owner 檢查 → `S12`／`S13` 紅；close 不刪座位 → `S13` 紅；form-team 不設 room_template → `S12` 紅（`room_ready` check 會 500）

## 3. `--actions`：成軍／結案（`project-lifecycle`〈動作跟著狀態走〉〈成軍〉〈結案〉；design D1／D2／D6）

- [x] 3.1 `tests/project-lifecycle.test.tsx`：`S01`～`S04`、`S07`（真的 `IdentityProvider`＋`InboxPanelProvider`＋`ListPanelProvider`＋`BoardPanel`，外包 `RoomsRefreshProvider` 的 vi.fn：**成功時 `refresh` 恰好一次、失敗時零次**、列表 500／`refresh` 拋錯不回滾；`S02` 用 `FORM_LIMITS` 的數字比對、emoji 以 code point 計；`S07` 送出中連按與 Escape／返回被擋、403 語彙）；先 commit 紅（對 HEAD 只有判準跑過：10 條全紅）
- [x] 3.2 `FORM_LIMITS.roomPassword`；`projectRules.ts` 的 `FormTeamSchema`（code point 計數）；`useProjectDetail.replace(project)`；`OwnerActions.tsx`（成軍表單、結案＋`CloseConfirm`；`onBusyChange`）；`BoardPanel` 接進 `ownerActions`（成功後先 `replace` 再各自 `reload()`（只有成軍）、`refreshRooms()`；送出中擋返回／關閉）；`ProjectDetail` 的 `ownerActions` 可以是 render-prop（拿 `project`、`replace`）；返回鈕 `shrink-0 whitespace-nowrap`（長標題擠成兩行，e2e 截圖抓到）
- [x] 3.3 **突變**：payload 多 trim → `S03` 紅；成功後重打詳情 → `S03` 紅；成功不呼叫 `refresh` → `S03`／`S07` 紅；500 也 reload 列表／也 `refresh` → `S04` 紅；列表失敗回滾詳情 → `S03` 紅；`.length` 計密碼 → `S02` 紅；取消也送 close → `S07` 紅；closed 也給成軍 → `S01` 紅；送出中不擋關閉 → `S04`／`S07` 紅；結案也 reload 列表 → `S07` 紅
- [x] 3.4 `board-panel.mjs`（36 ✅）／`create-project.mjs`（18 ✅）對 `next start`＋internal 重跑綠（e2e `S09` 在 `--reveal`：要有密碼呈現才走得完）

## 3b. `--reveal`：密碼只在這一次詳情裡呈現（`project-lifecycle`〈密碼只在這一次詳情裡呈現…〉；design D3／D4）

- [ ] 3b.1 `tests/project-password-reveal.test.tsx`：`S05`／`S06`（`vi.mock('@/identity/clipboard')` 控制成功／失敗）、`S08`（掛載前攔 `setItem`／cookie setter／`pushState`／`replaceState`，原文與 encoded 都掃）；先 commit 紅
- [ ] 3b.2 `OwnerActions`：`revealed` state、密碼區塊（`room-password-reveal`、一次性提示）、「複製密碼」（`ClipboardPort`）、「寄給隊員」（草稿進剪貼簿成功才 `onSendToTeam`）；`BoardPanel`：`onSendToTeam` = `closePanel()` ＋ `inbox?.openList(null)`
- [ ] 3b.3 **突變**：密碼寫進 sessionStorage 之後刪掉 → `S08` 紅；剪貼簿失敗也開收件匣 → `S06` 紅；複製失敗也說已複製 → `S05` 紅；返回重開還呈現密碼 → `S05` 紅
- [ ] 3b.4 `tests/e2e/form-team.mjs`：`S09`（發案 → 成軍 → 複製 → 門長出來且 rooms 請求數增加 → 深連結回詳情 → 結案 → 門消失）；對 `next start`＋internal 跑綠（本機已先跑過一次 13 ✅）

## 4. 收尾

- [ ] 4.1 `ui-ux-pro-max` pre-delivery（密碼欄、確認層、一次性提示）；`pnpm exec eslint --ignore-pattern '.claude/worktrees/**' .`、`pnpm exec tsc --noEmit`、`pnpm test`；`bash .github/scripts/pr-size.sh`
- [ ] 4.2 量 client JS 前後差貼 PR；合併後 `vercel deploy --prod`；閘道單次人工 smoke（只走不壓）
- [ ] 4.3 `archive/fe-j04-form-team`：`openspec validate --archived --strict` 與 `--all --strict`；Sheet `FE-J04` Done
