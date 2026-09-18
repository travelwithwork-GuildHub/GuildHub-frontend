# tasks：`fe-j04-form-team`

五個 `feat/fe-j04-form-team--<slice>` PR（每個產品碼 ≤250、手寫 ≤800）：`--rooms` → `--backend` → `--actions`（成軍）→ `--close`（結案）→ `--reveal`（密碼一次性呈現＋e2e）。
（`--actions` 做完量出 336 行產品碼／872 手寫，按 Requirement 切出 `--reveal`；審查修正後又 282 行，再按〈結案要確認〉切出 `--close`。）
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

## 3. `--actions`：成軍（`project-lifecycle`〈動作跟著狀態走〉的 recruiting／closed／非 owner 半邊、〈成軍〉；design D1／D2／D6）

- [x] 3.1 `tests/project-lifecycle.test.tsx`：`S01`（成軍那一半）～`S04`（真的 `IdentityProvider`＋`InboxPanelProvider`＋`ListPanelProvider`＋`BoardPanel`，外包 `RoomsRefreshProvider` 的 vi.fn：**成功時 `refresh` 恰好一次、失敗時零次**、列表 500／`refresh` 拋錯不回滾；`S02` 用 `FORM_LIMITS` 的數字比對、emoji 以 code point 計；送出的**同一個 tick** 內按返回被擋；3 個 emoji 不送）；先 commit 紅（對 HEAD 只有判準跑過：10 條全紅）
- [x] 3.2 `FORM_LIMITS.roomPassword`；`projectRules.ts` 的 `FormTeamSchema`（code point 計數）；`useProjectDetail.replace(project)`；`OwnerActions.tsx`（成軍表單；`onBusyChange` 在 submit 事件當下同步通知、深度計數）；`BoardPanel` 接進 `ownerActions`（成功後先 `replace` 再各自 `reload()`（只有成軍）、`refreshRooms()`；送出中擋返回／關閉）；`ProjectDetail` 的 `ownerActions` 可以是 render-prop（拿 `project`、`replace`）；返回鈕 `shrink-0 whitespace-nowrap`（長標題擠成兩行，e2e 截圖抓到）
- [x] 3.3 **突變**：payload 多 trim → `S03` 紅；成功後重打詳情 → `S03` 紅；成功不呼叫 `refresh` → `S03` 紅；500 也 reload 列表／也 `refresh` → `S04` 紅；列表失敗回滾詳情 → `S03` 紅；`.length` 計密碼 → `S02` 紅；closed 也給成軍 → `S01` 紅；送出中不擋關閉 → `S04` 紅
- [x] 3.4 `board-panel.mjs`（36 ✅）／`create-project.mjs`（18 ✅）對 `next start`＋internal 重跑綠（e2e `S09` 在 `--reveal`：要有密碼呈現才走得完）

## 3a. `--close`：結案（`project-lifecycle`〈結案要確認…〉、〈動作跟著狀態走〉的 active 半邊；design D6）

- [x] 3a.1 `tests/project-close.test.tsx`：`S07`（取消／Escape 不送、焦點回結案且開著時焦點在「取消」、送出中連按一次且同一 tick 按返回被擋、成功後沒有按鈕、`refresh` 一次、不重取列表、500／403 語彙留著）；`S01` 的 active 半邊（有結案沒成軍）補進 `project-lifecycle.test.tsx`；J04 三個測試檔共用的樹與手勢抽到 `tests/support/project-lifecycle.tsx`；先 commit 紅（3 條紅、S02～S04 仍綠）
- [x] 3a.2 `OwnerActions`：結案按鈕、`CloseConfirm`（`alertdialog`、不宣告 modal、`aria-disabled`、焦點在取消、Escape ＝ 取消、`flushSync` 還焦點）、`confirmClose`（ref guard 連按、`enterBusy`／`leaveBusy`）
- [x] 3a.3 **突變**：取消也送 close → `S07` 紅；結案也 reload 列表 → `S07` 紅；成功不 `refresh` → `S07` 紅；送出中不擋關閉 → `S07` 紅；另加：取消不還焦點、連按沒 guard、送出中 Escape 仍取消 → 都 `S07` 紅（7／7）

## 3b. `--reveal`：密碼只在這一次詳情裡呈現（`project-lifecycle`〈密碼只在這一次詳情裡呈現…〉；design D3／D4）

- [x] 3b.1 `tests/project-password-reveal.test.tsx`：`S05`／`S06`（`vi.mock('@/identity/clipboard')` 控制成功／失敗；`S05` 第二次複製用「壓著不回」抓「先說已複製再改回」、`S06` 進對話驗輸入框是空的）、`S08`（掛載前攔 `setItem`／cookie setter／`pushState`／`replaceState`，原文與 encoded 都掃；密碼含空白與 `#` 讓 encoded 長得不一樣；流程含「寄給隊員」→ 關收件匣 → 重開看板與詳情）；先 commit 紅（3 條全紅）
- [x] 3b.2 `OwnerActions`：`revealed` state、密碼區塊（`room-password-reveal`、一次性提示）、「複製密碼」（`ClipboardPort`）、「寄給隊員」（草稿進剪貼簿成功才 `onSendToTeam`）；`BoardPanel`：`onSendToTeam` = `closePanel()` ＋ `inbox?.openList(null)`
- [x] 3b.3 **突變**：密碼寫進 sessionStorage 之後刪掉 → `S08` 紅；剪貼簿失敗也開收件匣 → `S06` 紅；複製失敗也說已複製 → `S05` 紅；返回重開還呈現密碼 → `S05`／`S08` 紅；另加：密碼 encoded 進網址 → `S08` 紅（encoded 那條抓的）、「寄給隊員」開的是對話 → `S06` 紅（6／6）；審查後再加：拿掉複製／寄給隊員共用的同步 guard → `S05`／`S06` 紅（7／7）
- [x] 3b.4 `tests/e2e/form-team.mjs`：`S09`（發案 → 成軍 → 複製 → 門長出來且 rooms 請求數增加 → 深連結回詳情 → 結案 → 門消失）；對 `next start`＋internal 跑綠（13 ✅）

## 4. 收尾

- [x] 4.1 `ui-ux-pro-max` pre-delivery（密碼欄、確認層、一次性提示：狀態用 `role="status"`／`role="alert"` 回報、寫入中 `aria-disabled` 不丟焦點、密碼與草稿 `select-all` 可手動選取、按鈕走 `@/design/controls`）；每片都跑 `pnpm exec eslint --ignore-pattern '.claude/worktrees/**' .`、`pnpm exec tsc --noEmit`、`pnpm test`（合併後在 main 再跑一次：全綠）；`bash .github/scripts/pr-size.sh` 每片 ≤250／≤800（`--reveal` 117／437）
- [x] 4.2 量 client JS 前後差貼 PR（`--rooms`／`--backend` 無可量的差；`--actions` 全部 chunk gz 1292.6 → ~1294 KB；`--close` +~1 KB；`--reveal` 含 `OwnerActions` 的 chunk 163,149 → 163,853 B gz，+704 B）；沒有新套件、沒有新請求；每片合併後 `vercel deploy --prod` READY（最後 #511）；閘道單次人工 smoke（只走不壓）：`/login` 200
- [x] 4.3 `archive/fe-j04-form-team`：`openspec validate --archived --strict` 與 `--all --strict`；Sheet `FE-J04` Done
