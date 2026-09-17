# tasks：`fe-a06-login-entry`

一個 `feat/fe-a06-login-entry--<slice>` PR 做完（產品碼 ≤250、手寫 ≤800）；e2e 若塞不下另開 `--e2e`。
先寫判準（紅）→ commit → 實作（綠）→ 突變（拔掉防禦要紅）→ 真瀏覽器。

## 1. 規格

- [x] 1.1 規格已在 PR 上談定（`spec/fe-a06-login-entry` 合併進 `main`）。
      驗證：`pnpm exec openspec validate fe-a06-login-entry --strict` 通過且 PR 已合併（#478 合併 `d7ce9ee`）

## 2. 判準先紅（`S13`／`S14`／`S15`／`S17`）

- [x] 2.1 `tests/login-entry.test.tsx`：`S13` 暱稱路建立身分後有金鑰、「進入世界」disabled、**按之前** `localStorage` 沒有 `guildhub.first-entry-done`；
      剪貼簿替身（`clipboard` prop）回報成功後 enabled 且有「已經複製」；按下去 `router.replace('/world')` 且 `localStorage` 有 `guildhub.first-entry-done=1`；
      填回尾碼 6 碼填對也 enabled
- [x] 2.2 同檔：`S14` 金鑰路成功後 `router.replace('/world')`（`push` 沒被叫）、DOM 上沒有 `recovery-key`、沒有金鑰文字
- [x] 2.3 同檔：`S15` 剪貼簿替身 reject → 沒有「已經複製」、按鈕仍 disabled、`replace` 沒被叫、有手動保存的說明與填回入口；
      `S17`（另一個全新 render）尾碼填錯 → alert「對不上」、仍 disabled、`replace` 沒被叫
- [x] 2.4 **commit 紅的判準**（`a9af06d`，5 條全紅；#479）

## 3. 正式碼（`feat/fe-a06-login-entry--handoff`）

- [x] 3.1 動 tsx 之前過 `ui-ux-pro-max`（`--domain` 表單／CTA；輸出不進版控）
- [x] 3.2 `src/first-entry/KeyHandoff.tsx`：從 `FirstEntryFlow` 抽出「帶走鑰匙」那一半（`PROOF_LENGTH`、`Taken`、`copy()` 一起搬）；
      `FirstEntryFlow` 改成渲染它。`tests/first-entry-flow.test.tsx` **一個字不改**、仍全綠
- [x] 3.3 `src/app/login/LoginForm.tsx`：刪 `RecoveryKeyPanel`；開 `clipboard?: ClipboardPort` prop 往下傳；暱稱路 `signed-in` → `KeyHandoff`
      （`onDone`：`markFirstEntryDone()`＋`router.replace('/world')`；**渲染時不得先記**）；金鑰路 `onSubmit` 成功 → `router.replace('/world')`
- [x] 3.4 `tests/login-form.test.tsx` 的 `[FE-A01-S09]`／`[FE-A01-S17]` 若斷言到 `RecoveryKeyPanel` 的字或金鑰路的 `recovery-key`，
      改成斷言 `KeyHandoff` 的字／`replace('/world')` —— **Scenario ID 不動、義務不動**；`S17` 的「同一張名片（id）」證據**不得刪**，
      只能換掉「登入後重新顯示金鑰」這個實作細節（design D3）
- [x] 3.5 突變（先 commit）：`KeyHandoff` 的 `disabled={!done}` 拿掉 → `S13` 紅；渲染時就 `markFirstEntryDone()` → `S13` 紅；
      金鑰路改回顯示金鑰畫面 → `S14` 紅；金鑰路改 `push` → `S14` 紅；`copy()` 的 `setTaken` 搬到 `await` 前 → `S15` 紅；
      尾碼比對改「有填就放行」→ `S17` 紅；紀錄貼 PR（七條全部紅，M5 第一次 `S15` 沒紅 → 判準改用卡在 pending 的剪貼簿後才紅；紀錄在 #479 留言）
- [x] 3.6 `pnpm exec eslint --ignore-pattern '.claude/worktrees/**' .`、`pnpm exec tsc --noEmit`、`pnpm test`；`bash .github/scripts/pr-size.sh`

## 4. 真瀏覽器（`S16`；同一個 PR 或 `--e2e`）

- [x] 4.1 `tests/e2e/identity-flow.mjs`：第一條路建立身分後讀 `/api/me` 存 `idA`；4.4c 改成等 `/world`＋`/api/me` 的 `idB === idA`＋badge＋`goBack()` 不回 `/login`
      （design D3，同一張名片的證據不降級、不拿金鑰當 id 比）；新增三條路各到 `/world`＋badge、剪貼簿讀回
      （`context.grantPermissions(['clipboard-read','clipboard-write'])`，沿用 `first-entry.mjs`）
- [x] 4.2 對 `next start`＋本機 internal 後端實跑，結束碼 0；截圖存 scratchpad；紀錄貼 PR（34/34 綠；E1 突變只有 `/api/me` 的 id 那條紅）
- [x] 4.3 效能影響：`/login` 多載入 `KeyHandoff`（本來就在 `/` 的 chunk 裡）；量 `/login` 首屏 JS 前後差，貼 PR（237.9 → 238.6 KB gz，+0.7 KB；`/world` 不變）

## 5. 收尾

- [x] 5.1 `archive/fe-a06-login-entry`：`openspec validate --archived --strict` 與 `--all --strict`
      （本機先把目錄搬進 `archive/2026-09-17-…` 跑過：全勾之後 `--archived --strict` 57/57、`--all --strict` 51/51 都綠；正式搬檔在 `archive/fe-a06-login-entry`）
- [x] 5.2 Sheet `FE-A06` 進度更新；`fe-a06-first-entry` 的 5.1b 標「由 `fe-a06-login-entry` 處理」（那個 change 的 tasks 由它自己的 `--tasks` PR 勾）
      （Sheet 已更到 On-going 90；5.1b 的勾就在這個 PR 一起打 —— `feat/` 可以動任何 change 的 tasks.md，不必再開一個）
