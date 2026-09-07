## 1. 規格

- [x] 1.1 規格已在 PR 上談定：`spec/fe-o11-evidence` 合併進 `main`；驗證：`git log --oneline main -- openspec/changes/fe-o11-evidence/proposal.md` 有輸出

## 2. 換掉三條 manual-browser 的證據（MODIFIED Requirement）

- [x] 2.1 `FE-W01-S01`／`S02` 的證據換成 `d9cc115…`；驗證：`git merge-base --is-ancestor d9cc115b14a5e58df7a3dbe2554dfaaf730f07bb HEAD` rc=0
- [x] 2.2 `FE-W01-S03` 同上；驗證：同上

## 3. 完成前的驗收

- [x] 3.1 archive 之後 `openspec/specs/world-canvas/spec.md` 的三條 VERIFY-BY 都含 40 位 SHA；驗證：`grep -c '[0-9a-f]\{40\}' openspec/specs/world-canvas/spec.md` 為 3
- [x] 3.2 `bash .github/scripts/check-scenario-coverage.sh` rc=0
- [x] 3.3 `npx openspec validate fe-o11-evidence --strict` 通過，且本檔案沒有殘留的未完成項
