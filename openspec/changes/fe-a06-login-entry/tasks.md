# tasks：`fe-a06-login-entry`

一個 `feat/fe-a06-login-entry--<slice>` PR 做完（產品碼 ≤250、手寫 ≤800）；e2e 若塞不下另開 `--e2e`。
先寫判準（紅）→ commit → 實作（綠）→ 突變（拔掉防禦要紅）→ 真瀏覽器。

## 1. 規格

- [ ] 1.1 規格已在 PR 上談定（`spec/fe-a06-login-entry` 合併進 `main`）。
      驗證：`pnpm exec openspec validate fe-a06-login-entry --strict` 通過且 PR 已合併

## 2. 判準先紅（`S13`／`S14`／`S15`）

- [ ] 2.1 `tests/login-entry.test.tsx`：`S13` 暱稱路建立身分後有金鑰、「進入世界」disabled；
      剪貼簿替身回報成功後 enabled；按下去 `router.replace('/world')` 且 `localStorage` 有 `guildhub.first-entry-done=1`；
      填回尾碼 6 碼填對也 enabled
- [ ] 2.2 同檔：`S14` 金鑰路成功後 `router.replace('/world')`、DOM 上沒有 `recovery-key`、沒有金鑰文字
- [ ] 2.3 同檔：`S15` 剪貼簿替身 reject → 沒有「已經複製」、按鈕仍 disabled、`replace` 沒被叫；尾碼填錯 → alert「對不上」、仍 disabled
- [ ] 2.4 **commit 紅的判準**

## 3. 正式碼（`feat/fe-a06-login-entry--handoff`）

- [ ] 3.1 動 tsx 之前過 `ui-ux-pro-max`（`--domain` 表單／CTA；輸出不進版控）
- [ ] 3.2 `src/first-entry/KeyHandoff.tsx`：從 `FirstEntryFlow` 抽出「帶走鑰匙」那一半（`PROOF_LENGTH`、`Taken`、`copy()` 一起搬）；
      `FirstEntryFlow` 改成渲染它。`tests/first-entry-flow.test.tsx` **一個字不改**、仍全綠
- [ ] 3.3 `src/app/login/LoginForm.tsx`：刪 `RecoveryKeyPanel`；暱稱路 `signed-in` → `KeyHandoff`（`onDone`：`markFirstEntryDone()`＋`router.replace('/world')`）；
      金鑰路 `onSubmit` 成功 → `router.replace('/world')`
- [ ] 3.4 `tests/login-form.test.tsx` 的 `[FE-A01-S09]`／`[FE-A01-S17]` 若斷言到 `RecoveryKeyPanel` 的字或金鑰路的 `recovery-key`，
      改成斷言 `KeyHandoff` 的字／`replace('/world')` —— **Scenario ID 不動、義務不動**（design D3）
- [ ] 3.5 突變（先 commit）：`KeyHandoff` 的 `disabled={!done}` 拿掉 → `S13` 紅；金鑰路改回顯示金鑰畫面 → `S14` 紅；
      `copy()` 的 `setTaken` 搬到 `await` 前 → `S15` 紅；紀錄貼 PR
- [ ] 3.6 `pnpm exec eslint --ignore-pattern '.claude/worktrees/**' .`、`pnpm exec tsc --noEmit`、`pnpm test`；`bash .github/scripts/pr-size.sh`

## 4. 真瀏覽器（`S16`；同一個 PR 或 `--e2e`）

- [ ] 4.1 `tests/e2e/identity-flow.mjs`：4.4c 改成等 `/world`＋badge（design D3）；新增三條路各到 `/world`＋badge、剪貼簿讀回
      （`context.grantPermissions(['clipboard-read','clipboard-write'])`，沿用 `first-entry.mjs`）
- [ ] 4.2 對 `next start`＋本機 internal 後端實跑，結束碼 0；截圖存 scratchpad；紀錄貼 PR
- [ ] 4.3 效能影響：`/login` 多載入 `KeyHandoff`（本來就在 `/` 的 chunk 裡）；量 `/login` 首屏 JS 前後差，貼 PR

## 5. 收尾

- [ ] 5.1 `archive/fe-a06-login-entry`：`openspec validate --archived --strict` 與 `--all --strict`
- [ ] 5.2 Sheet `FE-A06` 進度更新；`fe-a06-first-entry` 的 5.1b 標「由 `fe-a06-login-entry` 處理」（那個 change 的 tasks 由它自己的 `--tasks` PR 勾）
