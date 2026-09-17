## Context

`scripts/contract-guildhub.mjs` 已經會自起真後端（preflight：後端 repo 在、port 沒人、
庫是 loopback 且不是開發庫；起 `run.sh`；等 `/api/me` 401；跑完連 process group 一起關）。
`tests/contract/client.ts` 已經有帶 cookie jar 的 raw client。演練要的是「走一條流程、
對照期望」，不是新的基礎設施 —— **重用，不重寫**。

## D1｜演練是 vitest 套件，不是 shell 腳本

**選項 A：一支 `.mjs` 用 fetch 逐步打、自己印表。** 不用框架，但要自己做斷言、
計數、報表，而且 Scenario ID 對不回測試標題（`check-scenario-coverage.sh` 看的是
vitest 的 JSON）。

**選項 B（採用）：`tests/rehearsal/*.rehearsal.ts` ＋ `vitest.rehearsal.mts`。**
斷言、逾時、JSON reporter 都是現成的；標題帶 `[FE-O08-Sxx]` 就進覆蓋報告。
wrapper 加一個 `--suite rehearsal` 旗標決定 config（純函式 `suiteConfig()`，可單測），
其餘（preflight、起停、環境變數）一行不改。

**不放進 `vitest.contract.mts`**：契約套件對兩個目標各跑一次、測試檔禁目標分支
（`FE-O05-S02`），而 `internal` 沒有這六個操作 —— 放進去 CI 就紅，
放進去又用 skip 就是在做目標分支。

## D2｜期望表是資料，不是散在斷言裡的數字

`tests/rehearsal/expectations.ts` 是一張表：每一條有 `key`、人讀的說明、期望的
狀態碼與 `detail`、`report`（要不要送回後端）、`owner`（前端哪一份規格接手）。
演練的斷言從表讀；報告的〈送回後端〉從表的 `report: true` 產；`README.md` 的清單
由測試比對「README 提到的每個 `key` 都在表裡、表裡 `report: true` 的每個 `key`
README 都提到」。三份講同一件事，只有一份是來源。

## D3｜報告從 vitest 的 JSON 產，落在 `docs/evidence/fe-o08/`

vitest `--reporter=json --outputFile=<tmp>`；wrapper 跑完把 JSON ＋ 後端 `git rev-parse HEAD`
渲染成 `docs/evidence/fe-o08/<YYYY-MM-DD>-<sha 前 7 碼>.md`（純函式 `renderReport()`，
可單測）。**JSON 拿不到或 sha 拿不到 → 不產報告、結束碼非零** —— 半份報告比沒有報告
更糟（它看起來像跑過）。報告只放結果與差異，不複製期望表的全文（會漂）。

commit 進 main 的報告就是 `FE-O11` 那種「不可變、離線取得回」的證據。

## D4｜`internal` 這六個操作誰補

- **不在這個 change 補。** O08 是 4 點的演練；補六個 Route Handler 加契約測試是
  `FE-J01`／`FE-J04`／`FE-J13` 各自的事（`FE-O03` 常態列早就這樣寫：「產品操作隨各能力
  追加，點數算在那些項目裡」）。
- 代價寫明：在那三個 change 落地之前，這六個操作的行為只有本機的演練釘著，CI 看不到。
  演練跑的頻率因此寫進 README：**每個案件相關的 change 開 spec 之前跑一次**，
  以及後端換 commit 時跑一次。

## D5｜量到但這一份不做判定的事

- `close` 之後舊 room token 仍能坐位：是 bug 還是「結案只是不再招募」由後端裁定；
  前端的義務只是「`closed` 的房間不給坐位入口」（`FE-J13`）。
- `form-team` 復活 `closed` 專案：同上；前端「`closed` 不給成軍入口」（`FE-J04`）。
- 建案不驗欄位：前端自己訂上限（`FE-X05` 已有規則：後端沒上限的欄位由前端訂並寫進規格），`FE-J01` 寫。

## 驗證方式

- 單元（不連網）：`suiteConfig()`、`renderReport()`、期望表 ↔ README 比對。
- 演練（本機、自起後端、loopback）：`GUILDHUB_BACKEND_DIR=… INTERNAL_TEST_DATABASE_URL=… node scripts/contract-guildhub.mjs --suite rehearsal`；
  結束碼 0 且 `docs/evidence/fe-o08/` 多一份報告。
- 突變：把後端行為「改掉」做不到（不動別人的 repo），改成把期望表某一條改成錯的值 → 演練那一步紅；
  把 README 少列一條 `report: true` → 比對測試紅；讓 `renderReport()` 在 sha 缺席時照產 → 那條紅。
