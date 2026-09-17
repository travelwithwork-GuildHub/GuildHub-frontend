# tasks：`fe-j01-create-project`

四個 `feat/fe-j01-create-project--<slice>` PR（每個產品碼 ≤250、手寫 ≤800）：`--backend` → `--rules` → `--form` → `--e2e`。
（原本三片；`--form` 一片做完量出 325 行產品碼，按 Scenario 切出規則層 `--rules`。）
每片：先寫判準（紅）→ commit → 實作（綠）→ 突變（拔掉防禦要紅、紀錄貼 PR）→ 檢查。

## 1. 規格

- [x] 1.1 規格已在 PR 上談定（`spec/fe-j01-create-project` 合併進 `main`）。
      驗證：`pnpm exec openspec validate fe-j01-create-project --strict` 通過且 PR 已合併 —— #484，main `a1bbee9`

## 2. `--backend`：替身的 `POST /api/projects` ＋ 契約判準（`S09`／`S10`／`FE-O03-S05`）

- [x] 2.1 `tests/contract/rest/projects.contract.ts`：`S09`（201 形狀、`owner_id` = me、預設值、`expires_at` ±5 分、列表第 0 頁第一筆）、
      `S10`（三種型別錯 422 形狀、未登入 401 且 `GET /api/projects` 沒多一筆）；`S09` 的鍵集合用原始 JSON 的 `Object.keys` 比、不靠 Zod；**先 commit 紅** —— `eb8bbfd`（S09／S10 對 internal 都是 405）
- [x] 2.2 `tests/contract/harness.ts`：`internal` 的 `contractUnimplemented` 拿掉 `POST /api/projects`；
      `tests/contract/rest/profiles.contract.ts` 的 `S05` probes 加 `GET /api/projects/{id}/seats`、拿掉 `GET /api/messages`（早就有了）
- [x] 2.3 `src/server/projects.ts`：`insertProject(ownerId, input)`（`insert … returning ${COLUMNS}`，**不算 `expires_at`**、不驗長度）；
      `src/app/api/projects/route.ts`：`export const POST = handle({ auth: 'required' }, …)`，body 用 `contract.ProjectCreate`；route 檔頭那句「沒有 POST」拿掉
- [x] 2.4 對 `internal` 跑契約套件綠（54 passed｜11 todo）；對 `guildhub`（`scripts/contract-guildhub.mjs`，本機自起）跑一次綠（51 passed｜3 skipped｜11 todo）。
      `todo` **沒有減少**：那 11 條裡跟 projects 有關的四條（title／body／skillCount／skillLength）pending 的理由是「後端沒有 check」，不是「端點不存在」——
      端點有了仍然沒有邊界可以成對（`tests/contract/boundaries.ts` 的理由已更新）
- [x] 2.5 突變（先 commit `3326b74`；四條各紅一個判準、紀錄在 PR）：`insertProject` 忘了帶 `seat_count`（用預設）→ `S09` 紅；route 拿掉 `auth: 'required'` → `S10` 紅；
      `unimplemented` 沒拿掉 `POST /api/projects` → `S05` 紅
- [x] 2.6 `pnpm exec eslint --ignore-pattern '.claude/worktrees/**' .`、`pnpm exec tsc --noEmit`、`pnpm test`；`bash .github/scripts/pr-size.sh`

## 3. `--rules`：上限與 schema（`S03`／`S04`／`S05`／`S07` 的規則層）

- [x] 3.1 `tests/project-rules.test.ts`：`vi.mock` 把 `LIMITS.seatIndex.max` 換成 5 → `FORM_LIMITS.seatCount` 是 `{1, 6}`、座位數訊息含 6 不含 8；
      標題／內容超上限即時（沒有 `too_small`）且單位是 code point（60 個「𠮷」要過）；技能第 11 項／41 字；座位數 0／7／2.5／空白；空白必填是 `too_small`；
      `toPayload` 恰好四鍵＋trim＋正規化；`isDirty`。**先 commit 紅**
- [x] 3.2 `src/forms/limits.ts`：`seatCount: { min: 1, max: LIMITS.seatIndex.max + 1 }`（註解寫推導理由）
- [x] 3.3 `src/projects/projectRules.ts`：`CreateProjectSchema`（title／body trim＋min／refine(codePointLength)；skills `transform(normalizeSkills)`＋count／length refine；
      seat_count `string → number`＋`.int()`＋`refine` 範圍）、`INITIAL`、`toPayload`、`isDirty`
- [x] 3.4 突變（先 commit `1cb7246`）：`seatCount.max` 寫死 8；title 用 `.length` 數；座位數範圍改 `.min/.max`（變 too_small）；`toPayload` 多送一鍵；skills 不正規化；title 不 trim —— 六條各紅；紀錄貼 PR
- [x] 3.5 eslint／tsc／`pnpm test`（157 檔全綠）／pr-size（產品 72、手寫 209）

## 4. `--form`：入口、表單、回第 0 頁重取、確認層（`S01`～`S07`、`S11`）

- [x] 4.1 過 `ui-ux-pro-max`（`--domain ux`：inline error＋aria-describedby、一個 role=alert、disabled 看得出來、label 在上、type=number；`--stack nextjs` 的 Server Actions 建議與 `src/api/` 規則衝突、規格贏）；按鈕用 `@/design/controls`
- [x] 4.2 `tests/create-project.test.tsx`（共用樹在 `tests/support/project-board.tsx`；`S03` 換數字那半在 `create-project-limits.test.tsx`）（真 `BoardPanel`＋`ListPanelProvider`＋`IdentityProvider` 替身＋`contract-server`）：
      `S01`（signed-in 有「發案」、人才面板沒有、`guest` 沒有、`resolving` 沒有 —— 四個各一個 render）、`S02`（四個標籤、座位數 4、列表 `inert`、沒有預算等字樣）、
      `S03`（五種超上限即時＋停用＋沒請求；`FORM_LIMITS.seatCount.max` 換 6 訊息跟著變 —— `vi.mock('@/forms/limits')`；模組層 `LIMITS.seatIndex.max` 換 5 → `FORM_LIMITS.seatCount.max` 是 6，放 `tests/form-limits.test.ts` 或同檔）、
      `S04`（空白送出：兩個錯誤、焦點在標題；打字後只剩內容的）、`S05`（在 `page=1`；body 逐字相等；GET 卡 pending 時 `aria-busy` 且沒有樂觀項目；GET 回「（伺服器版）」後第一筆是它；恰好一次 `GET ?page=0`；`onShownPage(0)`；焦點在列表）、
      `S06`（500 留值＋alert＋沒有 GET；重送 201 關閉重取；網路 reject 同樣、不自動重送）、`S11`（POST pending 連按兩次＋Enter 只一個 POST）、
      `S07`（Escape → 問 → 繼續編輯 → 殼關閉鈕 → 問 → 丟棄；取消 dirty 問；乾淨直接關且面板還在；送出中三種都關不掉）；**先 commit 紅** —— `92178d2`（沒有「發案」）
- [x] 4.3 `src/forms/limits.ts`：`seatCount` —— 移到 3.2
- [x] 4.4 `src/projects/projectRules.ts` —— 移到 3.3
- [x] 4.5 `src/projects/CreateProjectForm.tsx`：`useForm`＋`SubmitError`；四欄；`onCreated(created)`／`onDismiss()`；`closeIntentRef`／`askDiscard` 跟 `ProfileForm` 同一個形狀；**送出前不改寫欄位**（S06 原樣）；dirty 用 `getValues` 不訂閱輸入
- [x] 4.6 `src/list-panel/paging.ts` 加 `reload` 事件（＝ `opened(kind, 0)`）＋ `useListPage` 回 `reload`；`ListPanel` 的 `overlay` 接受 render-prop `({ reload }) => node`（design D2 選了這邊）、新 `toolbar` 插槽放列表上方
- [x] 4.7 `src/list-panel/BoardPanel.tsx`（`ProjectBoard`）：signed-in 才渲染「發案」；overlay 兩態（無／表單容器）；確認層疊在容器裡、表單留在 DOM 標 `inert`（不是換掉 overlay，design D5）；`onClose` 顯式分支 `if (requestClose) requestClose(); else closePanel()`（**不得用 `?.() ??`**，design D5；dirty 與送出中的判斷在表單的 `requestClose`）；成功 → 關表單、`reload()`、焦點回列表
- [x] 4.8 突變（先 commit `19bd4eb`；12 條各紅、一條存活：表單多送一鍵被 `operations.createProject` 的 `ProjectCreate.parse` 剝掉、body 仍四鍵 —— `toPayload` 多鍵在 `--rules` 是紅的）：「發案」不看 identity → `S01` 紅；`seatCount.max` 寫死 8 → `S03` 紅；payload 多送一個鍵 → `S05` 紅；
      成功後不 `reload`／樂觀插入 → `S05` 紅；失敗也 `reload` → `S06` 紅；拿掉送出 guard → `S11` 紅；dirty 不問 → `S07` 紅；送出中可關 → `S07` 紅；
      `onClose` 改成 `?.() ??` → `S07` 紅；殼關閉鈕不走 `closeIntentRef` → `S07` 紅；紀錄貼 PR
- [x] 4.9 效能：`/world` 首屏 JS（next start＋playwright 加總 script 回應）main 16 檔 raw 3895.7 KB／gz 1249.1 KB → 本片 raw 3900.8／gz 1250.2：**+5.1 KB raw／+1.1 KB gz**，不用 `next/dynamic`
- [ ] 4.10 eslint／tsc／`pnpm test`／pr-size

## 5. `--e2e`：真瀏覽器（`S08`）

- [ ] 5.1 `tests/e2e/create-project.mjs`：`next start`＋本機 `internal`；兩個 context 各建身分（沿用 `identity-flow.mjs` 的 signUp）；
      第一人走到看板按 E（沿用 `lib/world.mjs`／`board-panel.mjs` 的走位）→ 發案 → 第一筆；`page.route` 旁觀 POST body 恰好四鍵；reload 後仍在；第二人看到且有「發案」
- [ ] 5.2 實跑結束碼 0；截圖存 scratchpad；紀錄貼 PR。突變：e2e 的第二人改成不登入 → 紅（沒有列表）
- [ ] 5.3 `vercel deploy --prod` 之後對閘道人工走一次（只走不壓）；記在 PR

## 6. 收尾

- [ ] 6.1 `archive/fe-j01-create-project`：`openspec validate --archived --strict` 與 `--all --strict`（全勾之後才會綠）
- [ ] 6.2 Sheet `FE-J01` 進度更新
