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
wrapper 加一個 `--suite rehearsal` 旗標決定 config（純函式 `parseSuite(argv)`，可單測）；
preflight、起停、環境變數**沿用既有的函式與語意**，但 `main()` 的流程為了可測性重構成
`run({ argv, env, deps })`（第 3 輪審查指出第一版寫「一行不改」跟這件事矛盾）。

**argv 的邊界**（審查抓到：現在 wrapper 是 `process.argv.slice(2)` 原封轉傳給 vitest）：`parseSuite` 只認
`--suite <v>` 與 `--suite=<v>`，只拿掉那一或兩個 token；`--` 之後不看；重複、缺值、非法值都拒絕；wrapper 的 `main()` 拆成 `run({ argv, env, deps })`
回傳結束碼（`deps` 注入 `preflight`／`reset`／`spawn`／`finish`），S02 才驗得到「四條各自擋在 `reset`／`spawn` 之前」——
第二輪兩個審查者都指出只單測 `preflight()` 證明不了那件事；
`rehearsal` 時 `--config`／`--reporter`／`--outputFile` 由 wrapper 擁有，使用者傳了就拒絕 —— 不然報告的
JSON 會被覆蓋成別的 reporter，`finishRehearsal` 讀到的不是它要的東西。

**不放進 `vitest.contract.mts`**：契約套件對兩個目標各跑一次、測試檔禁目標分支
（`FE-O05-S02`），而 `internal` 沒有這六個操作 —— 放進去 CI 就紅，
放進去又用 skip 就是在做目標分支。

## D2｜期望表是資料，不是散在斷言裡的數字

`tests/rehearsal/expectations.ts` 是一張表：每一條有 `key`、人讀的說明、期望的
狀態碼與 `detail`、`report`（要不要送回後端）、`owner`（前端哪一份規格接手）。
演練的斷言從表讀；報告的〈送回後端〉從表的 `report: true` 產；`README.md` 分三節
（契約全部、異常全部、送回後端全部），每一節由測試比對成「跟期望表的對應集合相等」——
不是只驗 `report: true`（第 2 輪審查：那樣 `report: false` 的契約漏掉也綠）。三份講同一件事，只有一份是來源。

## D3｜報告從 vitest 的 JSON 產，落在 `docs/evidence/fe-o08/`

vitest `--reporter=json --outputFile=<唯一暫存檔>`；wrapper 跑完（**不論結束碼**）交給 `finishRehearsal()`：
JSON 完整就渲染（`renderReport()` 純函式）到 `docs/evidence/fe-o08/<YYYY-MM-DD>-<後端 sha7>-<前端 sha7>.md`，
結束碼沿用 vitest 的 —— **有失敗的那一次正是最需要報告的那一次**（審查抓到第一版寫反了）。
被訊號終止、JSON 缺席或不合法、後端 sha 空 → 不產、非零。檔名帶 UTC 秒＋6 位隨機（`<YYYYMMDD>T<HHMMSS>Z-<be7>-<fe7>-<rand>.md`，`now`／`random` 都注入），
「每次都留證據」與「不可變」才不打架；已存在仍不覆寫，但那是保險不是預期路徑（第 3 輪審查：「同一秒不會跑兩次」是假設不是機制）。
前端工作樹不乾淨 → 落 `.local/rehearsal/`（gitignore），證據目錄裡永遠只有乾淨工作樹的報告 ——
第二版寫「單元測試掃目錄擋 `-dirty`」，兩個審查者都指出那會讓本機留一份 dirty 報告之後 `pnpm test` 一直紅。
暫存檔在 finally 清掉。

**結果模型**（第二輪審查抓到）：vitest 的 JSON 只有葉節點。十三步與十條基線每一條都是自己的 `it()`，
步驟之間用檔案層級的共用狀態接力；前置步驟失敗時後面的步驟丟 `blocked: <key>`，報告分 `passed`／`failed`／`blocked` 三種。
十條基線各自建自己的專案，互不依賴。

commit 進 main 的報告就是 `FE-O11` 那種「不可變、離線取得回」的證據。

## D4｜`internal` 這六個操作誰補

- **不在這個 change 補。** O08 是 4 點的演練；補六個 Route Handler 加契約測試是
  `FE-J01`／`FE-J04`／`FE-J13` 各自的事（`FE-O03` 常態列早就這樣寫：「產品操作隨各能力
  追加，點數算在那些項目裡」）。
- 代價寫明：在那三個 change 落地之前，這六個操作的行為只有本機的演練釘著，CI 看不到。
  演練跑的頻率因此寫進 README：**每個案件相關的 change 開 spec 之前跑一次**，
  以及後端換 commit 時跑一次。
- **交接表**（README 也要有同一份）：

  | 操作 | 誰補 internal ＋ 雙目標契約測試 | 補完後契約套件的哪些 todo 轉正 |
  |---|---|---|
  | `POST /api/projects`、`GET /api/projects`（`status` 篩選）、`GET /api/projects/{id}` | `FE-J01`（列表／詳情的畫面在 `FE-B02`／`FE-B03`，但 Route Handler 跟著建案走） | `title`／`body`／`needed_skills`／`seat_count` 的邊界 todo |
  | `form-team`、`close` | `FE-J04`：成軍與結案的 API、`form-team-repeat`、`close-idempotent`、`close-clears-seats`（結案清席是 J04 的契約）；`closed` 不給成軍入口（`form-team-after-close` 的前端側） | — |
  | `GET`／`POST …/seats` | `FE-J13`：座位的 API、`seat-409-detail`、`seat-out-of-range`、`owner-needs-enter`；結案後的座位入口與舊 token（`close-keeps-token` 的前端側：`closed` 不給坐位入口） | `seat_index` 的邊界 todo |

  **`anomaly` 不進替身。** 三條 anomaly 在後端裁定之前只留在演練裡；`FE-J01`／`J04`／`J13` 補 internal 時
  MUST NOT 把它們實作成替身的「正確行為」（替身接受空 title、復活 closed、結案後還能坐 —— 那是把缺陷複製進來）。
  替身對這三件事的行為由那三個 change 各自寫進規格（預期是拒絕），契約測試只對 `contract` 那七條做雙目標。

  完成條件：那個 change 封存時，對應的基線條目在契約套件裡有雙目標的測試，演練那一條可以留著（多一層不衝突）。

## D5｜`anomaly` 的處置（規格層有 Requirement，這裡記理由）

- `close` 之後舊 room token 仍能坐位：是 bug 還是「結案只是不再招募」由後端裁定；
  前端的義務只是「`closed` 的房間不給坐位入口」（`FE-J13`）。
- `form-team` 復活 `closed` 專案：同上；前端「`closed` 不給成軍入口」（`FE-J04`）。
- 建案不驗欄位：前端自己訂上限（`FE-X05` 已有規則：後端沒上限的欄位由前端訂並寫進規格），`FE-J01` 寫。

## 驗證方式

- 單元（不連網）：`parseSuite()`、`run()` 的 preflight 四條（注入 deps）、`renderReport()`、`finishRehearsal()`（暫存目錄：dirty 只寫 `dirtyDir`、`outDir` 沒新檔；撞名不覆寫）、期望表形狀、期望表 ↔ README 三節集合相等、`.gitignore` 含 `/.local/rehearsal/`。
- 演練（本機、自起後端、loopback）：`GUILDHUB_BACKEND_DIR=… INTERNAL_TEST_DATABASE_URL=… node scripts/contract-guildhub.mjs --suite rehearsal`；
  結束碼 0 且 `docs/evidence/fe-o08/` 多一份報告。
- 突變：把後端行為「改掉」做不到（不動別人的 repo），改成把期望表 `form-team` 改成 201 → 演練那一步紅；
  把 README 少列一條 `report: true` → 比對測試紅；讓 `finishRehearsal()` 在 sha 空字串時照寫 → S08 紅；
  讓它撞名時覆寫 → S08 紅。

## D6｜切成三個 feat slice，各有行數上限

第一版一個 slice、第二版兩個，審查都估會超過手寫 800 行。拆三個，每個 slice 開 PR 前跑 `pr-size.sh`，
預算寫在 tasks；超過就再拆，不在實作完之後才回切：

| slice | 內容 | 預算（手寫） |
|---|---|---|
| `--wrapper` | `parseSuite`、`run()`、`finishRehearsal`、`renderReport` ＋ 單元測試 | ≤ 500 |
| `--ledger` | 期望表、README、期望表形狀與 README 比對的測試 | ≤ 400 |
| `--flow` | `vitest.rehearsal.mts`、閉環與基線的演練測試、package script、第一份報告 | ≤ 600 |

前兩個合併後 `--suite rehearsal` 仍因缺設定檔失敗 —— 預期的中間狀態。
