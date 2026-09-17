# tasks：`fe-o08-guildhub-rehearsal`

## 1. 規格

- [ ] 1.1 規格已在 PR 上談定（`spec/fe-o08-guildhub-rehearsal` 合併進 `main`）。
      驗證：`pnpm exec openspec validate fe-o08-guildhub-rehearsal --strict` 通過且 PR 已合併

## 2. slice 一：`feat/fe-o08-guildhub-rehearsal--wrapper`（不連網）

- [ ] 2.1 判準先紅：`tests/rehearsal-wrapper.test.ts` —— `S01` 文法（兩種寫法、缺席、`--` 之後、重複、缺值、非法值、rehearsal 配 `--config`／`--reporter`／`--outputFile`）；
      `S02` `preflight()` 四條各自拋且 `reset`／`spawn` 沒被叫（注入的 spy）
- [ ] 2.2 判準先紅：`tests/rehearsal-report.test.ts` —— `S07` 渲染（含 dirty 首行）；`S08` 四種不產、有失敗照樣產且回 1、撞名不覆寫；`docs/evidence/fe-o08/` 沒有 `-dirty` 檔
- [ ] 2.3 **commit 紅的判準**
- [ ] 2.4 `scripts/contract-guildhub.mjs`：`parseSuite()` export；`--suite rehearsal` 走 `vitest.rehearsal.mts`＋`--reporter=json --outputFile=<唯一暫存檔>`；跑完交 `finishRehearsal()`；暫存檔 finally 清；後端 SHA 用 `git -C <backendDir> rev-parse HEAD`、前端 SHA 與 dirty 用 `git rev-parse HEAD`／`git status --porcelain`
- [ ] 2.5 `scripts/rehearsal-report.mjs`：`renderReport()`、`finishRehearsal()`（fs 只在 `outDir` 底下）
- [ ] 2.6 突變（先 commit）：`finishRehearsal()` sha 空字串照寫 → `S08` 紅；撞名覆寫 → `S08` 紅；`parseSuite` 重複 `--suite` 取最後一個 → `S01` 紅；紀錄貼 PR
- [ ] 2.7 這個 slice 合併後 `--suite rehearsal` 會因缺 `vitest.rehearsal.mts` 失敗（預期；design D6）

## 3. slice 二：`feat/fe-o08-guildhub-rehearsal--flow`

- [ ] 3.1 判準先紅：`tests/rehearsal-expectations.test.ts` —— `S06` 形狀（`kind`／`report`／`owner`／`anomaly ⇒ report`／`key` 不重複）；`S03` 的 step 集合恰好十三個；`S09` README ↔ 期望表雙向且分節
- [ ] 3.2 **commit 紅的判準**
- [ ] 3.3 `vitest.rehearsal.mts`：include `tests/rehearsal/**/*.rehearsal.ts`，globalSetup 沿用 `tests/contract/harness.ts`
- [ ] 3.4 `tests/rehearsal/expectations.ts`：十三步 ＋ 十條基線（`kind`／`report`／`owner`）
- [ ] 3.5 `tests/rehearsal/closure.rehearsal.ts`：`S03` 十三步、`S05` 十條；斷言的數字全部從期望表讀；標題帶 Scenario ID
- [ ] 3.6 `docs/evidence/fe-o08/README.md`：〈前端要相容的契約〉〈送回後端裁定的異常〉〈量到但不在基線裡〉（1012）、交接表（design D4）、跑的頻率
- [ ] 3.7 `package.json`：`test:rehearsal:guildhub` 腳本
- [ ] 3.8 演練實跑：工作樹乾淨（先 commit 3.3–3.7）、`node scripts/contract-guildhub.mjs --suite rehearsal` 對 `c6f3928` 結束碼 0；報告 commit 進同一個 PR
- [ ] 3.9 突變（先 commit）：期望表 `form-team` 改 201 → `S04` 紅（實跑）；README 少列一條 `report: true` → `S09` 紅；紀錄貼 PR

## 4. 封存

- [ ] 4.1 `archive/fe-o08-guildhub-rehearsal`：`openspec validate --archived --strict` 與 `--all --strict`
