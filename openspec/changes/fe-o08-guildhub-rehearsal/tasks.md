# tasks：`fe-o08-guildhub-rehearsal`

## 1. 規格

- [ ] 1.1 規格已在 PR 上談定（`spec/fe-o08-guildhub-rehearsal` 合併進 `main`）。
      驗證：`pnpm exec openspec validate fe-o08-guildhub-rehearsal --strict` 通過且 PR 已合併

## 2. slice 一：`feat/fe-o08-guildhub-rehearsal--report`（不連網）

design D6 的 `--wrapper` 一個 slice 實作出來量到 633 行（判準 358＋其他 275），超過 500；照 D6「超過就再拆」
拆成兩個：報告（這一節，319 行）先，wrapper（第 2b 節，314 行）後 —— wrapper 的 `main()` 要 import `finishRehearsal`。

- [ ] 2.1 判準先紅：`tests/rehearsal-report.test.ts` —— `S07` 渲染（`passed`／`failed`／`blocked`、dirty 首行）；`S08` 四種不產、有失敗照樣產且回 1、撞名不覆寫、dirty 落 `dirtyDir` 而 `outDir` 沒新檔
- [ ] 2.2 **commit 紅的判準**
- [ ] 2.3 `scripts/rehearsal-report.mjs`：`renderReport()`、`finishRehearsal({ jsonPath, exitCode, signal, shas, dirty, outDir, dirtyDir, now, random })`（fs 只在 `outDir`／`dirtyDir` 底下）；`.gitignore` 加 `/.local/rehearsal/`（現在只有 `archive-review` 與 `llm-team` 兩條，`.local/` 整個沒有被排除）
- [ ] 2.4 突變（先 commit）：`finishRehearsal()` sha 空字串照寫 → `S08` 紅；撞名覆寫 → `S08` 紅；dirty 寫進 `outDir` → `S08` 紅；紀錄貼 PR
- [ ] 2.5 `bash .github/scripts/pr-size.sh` 手寫 ≤ 500（design D6）

## 2b. slice 二：`feat/fe-o08-guildhub-rehearsal--wrapper`（不連網）

- [ ] 2b.1 判準先紅：`tests/rehearsal-wrapper.test.ts` —— `S01` 文法（兩種寫法、缺席、`--` 之後、重複、缺值、非法值、rehearsal 配 `--config`／`--reporter`／`--outputFile`）；
      `S02` 用注入的 `deps` 呼叫 `run()`，四條各自回非零、訊息說明哪一條、`reset` 與 `spawn` 呼叫次數 0
- [ ] 2b.2 **commit 紅的判準**
- [ ] 2b.3 `scripts/contract-guildhub.mjs`：`main()` 拆成 `run({ argv, env, deps })`（export，回傳結束碼）；`parseSuite()` export；`--suite rehearsal` 走 `vitest.rehearsal.mts`＋`--reporter=json --outputFile=<唯一暫存檔>`；跑完交 `deps.finish`；暫存檔 finally 清；後端 SHA 用 `git -C <backendDir> rev-parse HEAD`、前端 SHA 與 dirty 用 `git rev-parse HEAD`／`git status --porcelain`
- [ ] 2b.4 突變（先 commit）：`parseSuite` 重複 `--suite` 取最後一個 → `S01` 紅；`run()` 在 preflight 失敗後仍呼叫 `reset` → `S02` 紅；紀錄貼 PR
- [ ] 2b.5 `bash .github/scripts/pr-size.sh` 手寫 ≤ 500（design D6）；`--suite contract` 那一輪對本機自起的真後端實跑一次（重構不能把既有的那一輪弄壞）；這個 slice 合併後 `--suite rehearsal` 會因缺 `vitest.rehearsal.mts` 失敗（預期）

## 3. slice 三：`feat/fe-o08-guildhub-rehearsal--ledger`（不連網）

- [ ] 3.1 判準先紅：`tests/rehearsal-expectations.test.ts` —— `S06` 形狀（`kind`／`report`／`owner`／`anomaly ⇒ report`／`key` 不重複）；`S03` 的 step 集合恰好十三個；`S09` 三節各自跟期望表 `(key, owner)` 集合相等
- [ ] 3.2 **commit 紅的判準**
- [ ] 3.3 `tests/rehearsal/expectations.ts`：十三步 ＋ 十條基線（`kind`／`report`／`owner`）
- [ ] 3.4 `docs/evidence/fe-o08/README.md`：〈前端要相容的契約〉〈送回後端裁定的異常〉〈送回後端〉〈量到但不在基線裡〉（1012）、交接表與「anomaly 不進替身」（design D4）、跑的頻率
- [ ] 3.5 突變（先 commit）：README 〈契約〉少一條 → `S09` 紅；某條 `owner` 改成別的 ID → `S09` 紅；〈送回後端〉少一條 `report: true` → `S09` 紅；期望表某條 anomaly 的 `report` 改 false → `S06` 紅；紀錄貼 PR
- [ ] 3.6 `pr-size.sh` 手寫 ≤ 400

## 4. slice 四：`feat/fe-o08-guildhub-rehearsal--flow`

- [ ] 4.1 `vitest.rehearsal.mts`：include `tests/rehearsal/**/*.rehearsal.ts`，globalSetup 沿用 `tests/contract/harness.ts`
- [ ] 4.2 `tests/rehearsal/closure.rehearsal.ts`：`S03` 十三步各一個 `it`（共用狀態接力、前置失敗丟 `blocked: <key>`）、`S05` 十條各一個 `it`（各自建專案）；斷言的數字全部從期望表讀；標題帶 `key` 與 Scenario ID
- [ ] 4.3 `package.json`：`test:rehearsal:guildhub` 腳本
- [ ] 4.4 演練實跑：先 commit 4.1–4.3 讓工作樹乾淨、`node scripts/contract-guildhub.mjs --suite rehearsal` 對 `c6f3928` 結束碼 0；報告落在 `docs/evidence/fe-o08/`，commit 進同一個 PR
- [ ] 4.5 突變（先 commit）：期望表 `form-team` 改 201 → 實跑 `S04` 紅、第 7～13 步（11 除外）`blocked`、報告分三種；紀錄貼 PR（dirty 那一份在 `.local/`，不進版控）
- [ ] 4.6 `pr-size.sh` 手寫 ≤ 600

## 5. 封存

- [ ] 5.1 `archive/fe-o08-guildhub-rehearsal`：`openspec validate --archived --strict` 與 `--all --strict`
