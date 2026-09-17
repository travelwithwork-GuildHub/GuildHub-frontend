# tasks：`fe-j01-create-project`

三個 `feat/fe-j01-create-project--<slice>` PR（每個產品碼 ≤250、手寫 ≤800）：`--backend` → `--form` → `--e2e`。
每片：先寫判準（紅）→ commit → 實作（綠）→ 突變（拔掉防禦要紅、紀錄貼 PR）→ 檢查。

## 1. 規格

- [ ] 1.1 規格已在 PR 上談定（`spec/fe-j01-create-project` 合併進 `main`）。
      驗證：`pnpm exec openspec validate fe-j01-create-project --strict` 通過且 PR 已合併

## 2. `--backend`：替身的 `POST /api/projects` ＋ 契約判準（`S09`／`S10`／`FE-O03-S05`）

- [ ] 2.1 `tests/contract/rest/projects.contract.ts`：`S09`（201 形狀、`owner_id` = me、預設值、`expires_at` ±5 分、列表第 0 頁第一筆）、
      `S10`（三種型別錯 422 形狀、未登入 401 且 `GET /api/projects` 沒多一筆）；**先 commit 紅**
- [ ] 2.2 `tests/contract/harness.ts`：`internal` 的 `contractUnimplemented` 拿掉 `POST /api/projects`；
      `tests/contract/rest/profiles.contract.ts` 的 `S05` probes 加 `GET /api/projects/{id}/seats`、拿掉 `GET /api/messages`（早就有了）
- [ ] 2.3 `src/server/projects.ts`：`insertProject(ownerId, input)`（`insert … returning ${COLUMNS}`，**不算 `expires_at`**、不驗長度）；
      `src/app/api/projects/route.ts`：`export const POST = handle({ auth: 'required' }, …)`，body 用 `contract.ProjectCreate`；route 檔頭那句「沒有 POST」拿掉
- [ ] 2.4 對 `internal` 跑契約套件綠；對 `guildhub`（`scripts/contract-guildhub.mjs`，本機自起）跑一次綠、`todo` 數從 11 減少（記在 PR）
- [ ] 2.5 突變（先 commit）：`insertProject` 忘了帶 `seat_count`（用預設）→ `S09` 紅；route 拿掉 `auth: 'required'` → `S10` 紅；
      `unimplemented` 沒拿掉 `POST /api/projects` → `S05` 紅
- [ ] 2.6 `pnpm exec eslint --ignore-pattern '.claude/worktrees/**' .`、`pnpm exec tsc --noEmit`、`pnpm test`；`bash .github/scripts/pr-size.sh`

## 3. `--form`：入口、表單、回第 0 頁、確認層（`S01`～`S07`）

- [ ] 3.1 動 tsx 之前過 `ui-ux-pro-max`（`--domain` 表單；輸出不進版控）；按鈕用 `@/design/controls`
- [ ] 3.2 `tests/create-project.test.tsx`（真 `BoardPanel`＋`ListPanelProvider`＋`IdentityProvider` 替身＋`contract-server`）：
      `S01`（signed-in 有「發案」、人才面板沒有、訪客沒有）、`S02`（四個標籤、座位數 4、列表 `inert`、沒有預算等字樣）、
      `S03`（五種超上限即時＋停用＋沒請求；`FORM_LIMITS.seatCount.max` 改 6 訊息跟著變 —— 用 `vi.mock` 或 `vi.spyOn` 換掉常數）、
      `S04`（空白送出：兩個錯誤、焦點在標題；打字後只剩內容的）、`S05`（在 `page=1`；body 逐字相等；一次 `GET ?page=0`；第一筆；`onShownPage(0)`；焦點在列表）、
      `S06`（500 留值＋alert＋沒有 GET；重送 201 關閉重取）、`S07`（dirty 問／乾淨直接關／送出中關不掉）；**先 commit 紅**
- [ ] 3.3 `src/forms/limits.ts`：`seatCount: { min: 1, max: LIMITS.seatIndex.max + 1 }`（註解寫推導理由）
- [ ] 3.4 `src/projects/projectRules.ts`：`CreateProjectSchema`（title／body trim＋min／max；skills `transform(normalizeSkills)`＋count／length；seat_count `string → int`＋`refine` 範圍）、`toPayload`、`isDirty`
- [ ] 3.5 `src/projects/CreateProjectForm.tsx`：`useForm`＋`SubmitError`；四欄；`onDone(created)`；`closeIntentRef`／`askDiscard` 跟 `ProfileForm` 同一個形狀
- [ ] 3.6 `src/list-panel/paging.ts` 加 `reload` 事件（identity → page 0、loading、shown null）＋ `useListPage` 回 `reload`；`ListPanel` 把它交給 overlay（design D2 二選一）
- [ ] 3.7 `src/list-panel/BoardPanel.tsx`：signed-in 才渲染「發案」；overlay 三態（表單／確認層／無）；`onClose` 只做 `closeIntentRef.current?.() ?? closePanel()`（dirty 與送出中的判斷在表單的 `requestClose`，design D5）；成功 → 關表單、`reload()`、焦點回列表
- [ ] 3.8 突變（先 commit）：「發案」不看 identity → `S01` 紅；`seatCount.max` 寫死 8 → `S03` 紅；payload 多送一個鍵 → `S05` 紅；
      成功後不 `reload` → `S05` 紅；失敗也 `reload` → `S06` 紅；dirty 不問 → `S07` 紅；送出中可關 → `S07` 紅；紀錄貼 PR
- [ ] 3.9 效能：量 `/world` 首屏 JS 前後差（playwright 加總 script bytes），貼 PR；>10 KB gz 改 `next/dynamic`
- [ ] 3.10 eslint／tsc／`pnpm test`／pr-size

## 4. `--e2e`：真瀏覽器（`S08`）

- [ ] 4.1 `tests/e2e/create-project.mjs`：`next start`＋本機 `internal`；兩個 context 各建身分（沿用 `identity-flow.mjs` 的 signUp）；
      第一人走到看板按 E（沿用 `lib/world.mjs`／`board-panel.mjs` 的走位）→ 發案 → 第一筆；`page.route` 旁觀 POST body 恰好四鍵；reload 後仍在；第二人看到且有「發案」
- [ ] 4.2 實跑結束碼 0；截圖存 scratchpad；紀錄貼 PR。突變：e2e 的第二人改成不登入 → 紅（沒有列表）
- [ ] 4.3 `vercel deploy --prod` 之後對閘道人工走一次（只走不壓）；記在 PR

## 5. 收尾

- [ ] 5.1 `archive/fe-j01-create-project`：`openspec validate --archived --strict` 與 `--all --strict`（全勾之後才會綠）
- [ ] 5.2 Sheet `FE-J01` 進度更新
