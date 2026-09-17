# tasks：`fe-o08-guildhub-rehearsal`

## 1. 規格

- [ ] 1.1 規格已在 PR 上談定（`spec/fe-o08-guildhub-rehearsal` 合併進 `main`）。
      驗證：`pnpm exec openspec validate fe-o08-guildhub-rehearsal --strict` 通過且 PR 已合併

## 2. 判準先紅（不連網的那些）

- [ ] 2.1 `tests/contract-harness.test.ts`（或新檔 `tests/rehearsal-wrapper.test.ts`）：`S01` 套件選擇三種情形
- [ ] 2.2 `tests/rehearsal-report.test.ts`：`S07` 渲染、`S08` 三種缺席都拋
- [ ] 2.3 `tests/rehearsal-expectations.test.ts`：`S06` 每一條有 `report` 與 `owner`；`S09` README ↔ 期望表雙向比對
- [ ] 2.4 **commit 紅的判準**，再開始 3

## 3. 正式碼（`feat/fe-o08-guildhub-rehearsal--suite`）

- [ ] 3.1 `scripts/contract-guildhub.mjs`：`suiteConfig()`（純函式、export）、`--suite rehearsal` 走 `vitest.rehearsal.mts`＋JSON reporter、跑完 `renderReport()` 寫檔；後端 SHA 用 `git -C <backendDir> rev-parse HEAD`
- [ ] 3.2 `scripts/rehearsal-report.mjs`：`renderReport()`
- [ ] 3.3 `vitest.rehearsal.mts`：include `tests/rehearsal/**/*.rehearsal.ts`，globalSetup 沿用 `tests/contract/harness.ts`
- [ ] 3.4 `tests/rehearsal/expectations.ts`：期望表（九條已知行為＋閉環各步）
- [ ] 3.5 `tests/rehearsal/closure.rehearsal.ts`：`S03` 閉環十一步、`S05` 九條；斷言的數字全部從期望表讀
- [ ] 3.6 `docs/evidence/fe-o08/README.md`：差異清單、送回後端、各功能接手、跑的頻率（design D4）
- [ ] 3.7 `package.json`：`test:rehearsal:guildhub` 腳本

## 4. 演練實跑（本機、自起後端）

- [ ] 4.1 `node scripts/contract-guildhub.mjs --suite rehearsal` 對 c6f3928 結束碼 0，`docs/evidence/fe-o08/` 多一份報告，commit 進 feat PR

## 5. 負向驗證（突變前先 commit）

- [ ] 5.1 期望表「成軍」改 201 → `S04` 那一步紅
- [ ] 5.2 README 少列一條 `report: true` → `S09` 紅
- [ ] 5.3 `renderReport()` 在 sha 空字串時照產 → `S08` 紅
- [ ] 5.4 執行紀錄貼在 PR 留言

## 6. 封存

- [ ] 6.1 `archive/fe-o08-guildhub-rehearsal`：`openspec validate --archived --strict` 與 `--all --strict`
