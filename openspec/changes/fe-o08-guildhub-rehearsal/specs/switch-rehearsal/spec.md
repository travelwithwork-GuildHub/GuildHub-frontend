## Purpose

真後端上線之後，前端對它的每一個假設都要有一條會變紅的東西守著。這份 capability 定義「切換演練」：
一個只在本機、只對自起的真後端跑的套件，走一次完整的案件閉環，把量到的後端行為釘成期望，
並把每次演練的結果落成不可變的證據。它補的是契約套件涵蓋不到的那一塊 —— `internal` 沒有的操作。

## Applicability

權限：不適用 —— 演練用兩張名片走流程，不判斷授權規則本身（那是各功能的規格）
併發：不適用 —— 演練循序執行，一次一個請求
持久資料相容性：不適用 —— 演練寫進的是可拋棄庫，跑前重設
失敗路徑：適用 —— 期望不符、後端起不來、port 被占、報告產不出來
測試連到什麼：演練套件連**本機自起的可拋棄真後端**（`127.0.0.1`，由 wrapper 起、跑完關；庫是 `INTERNAL_TEST_DATABASE_URL`，跑前重設）；
單元測試（`suiteConfig`、`renderReport`、期望表比對）不連任何外部服務

## ADDED Requirements

### Requirement: 演練只對自起的、loopback 的真後端跑

演練 SHALL 經由 `scripts/contract-guildhub.mjs --suite rehearsal` 執行，沿用契約套件 `guildhub`
那一輪的 preflight 與起停：後端 repo 不在、port 已有人在聽、庫不是 loopback 或跟開發庫是同一個，
任一條不過 SHALL 什麼都不起、結束碼非零並說明是哪一條。演練 MUST NOT 接受任何既有的後端位址。
`--suite` 缺席時 SHALL 跑契約套件（既有行為不變）；`--suite` 的值不是 `contract` 或 `rehearsal` 時 SHALL 拒絕，不是退回預設。

#### Scenario: [FE-O08-S01] 套件選擇與拒絕

- **WHEN** wrapper 收到 `--suite rehearsal`
- **THEN** 選到的 vitest 設定是 `vitest.rehearsal.mts`，且傳給 vitest 的參數不再含 `--suite` 那一對
- **WHEN** 沒有 `--suite`
- **THEN** 選到的是 `vitest.contract.mts`
- **WHEN** `--suite` 是別的值或沒有值
- **THEN** 拋錯，訊息列出兩個合法值

#### Scenario: [FE-O08-S02] preflight 不過就什麼都不起

- **WHEN** port 已有程序在聽，或 `INTERNAL_TEST_DATABASE_URL` 不是 loopback
- **THEN** 結束碼非零、訊息指出是哪一條，沒有任何子程序被啟動（跟 `FE-O05` 的 S04／S05 同一條路）

### Requirement: 閉環的每一步都對照期望表

演練 SHALL 用兩張名片（發案者、隊員）循序走：登入 → 建案 → 列表含它、詳情 → 成軍 → 門（`/api/rooms`）含它 →
隊員進房 → 座位列表與認領 → 私訊發案者 → 結案 → 門不含它。每一步的狀態碼與回應形狀 SHALL 對照
`tests/rehearsal/expectations.ts` 的一條期望；任何一步不符 SHALL 讓該步失敗、套件結束碼非零，
且失敗訊息含期望值與實測值。期望表是唯一來源：測試 MUST NOT 在斷言裡另寫數字。

#### Scenario: [FE-O08-S03] 閉環走完

- **WHEN** 對 c6f3928 跑演練
- **THEN** 十一步全部通過，回應形狀通過 `src/api/contract/rest.ts` 對應的 schema（`ProjectOut`／`EnterOut`／`SeatOut`／`MessageOut`／`RoomDoorOut`）

#### Scenario: [FE-O08-S04] 期望不符就紅

- **WHEN** 期望表裡「成軍」那一條的狀態碼被改成 201
- **THEN** 成軍那一步失敗，訊息含 `201` 與實測的 `200`，套件結束碼非零

### Requirement: 已知行為釘成期望，後端改了要紅

期望表 SHALL 至少釘住下列已量到的行為（2026-09-17，後端 `c6f3928`）；後端改變任一條，演練 SHALL 紅：

| key | 行為 |
|---|---|
| `create-unvalidated` | `POST /api/projects` 空 `title`、`seat_count` 0 與 9 都 201 |
| `list-default-recruiting` | `GET /api/projects` 不帶 `status` 只回 `recruiting`；`?status=active` 才回成軍的 |
| `form-team-repeat` | 成軍後再成軍 200，舊密碼 `enter` 403、新密碼 200 |
| `form-team-after-close` | `closed` 之後成軍 200 且狀態回到 `active`、`/api/rooms` 再含它 |
| `seat-409-detail` | 同一人再坐 409 `你已經在這個房間有座位了`；坐別人的位 409 `這個座位已經有人了` |
| `seat-out-of-range` | `seat_index` ≥ `seat_count` 是 400，訊息含座位數 |
| `close-idempotent` | 重複結案 200 |
| `close-keeps-token` | 結案後隊員用舊 token 列座位 200、認領 201 |
| `owner-needs-enter` | 發案者沒 `enter` 也看不到座位（403） |

每一條 SHALL 有 `report`（是否送回後端）與 `owner`（前端哪一個工作項目接手）。

#### Scenario: [FE-O08-S05] 九條已知行為

- **WHEN** 對 c6f3928 跑演練
- **THEN** 上表九條全部通過；每一條的失敗訊息含 `key`，讓報告指得出是哪一條變了

#### Scenario: [FE-O08-S06] 期望表的每一條都有歸屬

- **WHEN** 讀期望表
- **THEN** 每一條都有 `report` 布林與非空的 `owner`（`FE-` 開頭的工作項目 ID）；缺一個就是單元測試失敗

### Requirement: 每次演練產一份不可變的報告

wrapper 在 `--suite rehearsal` 跑完後 SHALL 把 vitest 的 JSON 結果與後端的 commit SHA 渲染成
`docs/evidence/fe-o08/<YYYY-MM-DD>-<sha 前 7 碼>.md`，內容 SHALL 含：後端 commit、前端 commit、
每一步／每一條期望的通過與否、失敗步驟的訊息、〈送回後端〉節（期望表裡 `report: true` 的條目）。
JSON 讀不到、解析失敗、或後端 SHA 拿不到時 MUST NOT 產出檔案，結束碼 SHALL 非零。
報告 MUST NOT 複製期望表的說明全文，只引用 `key`。

#### Scenario: [FE-O08-S07] 報告渲染

- **WHEN** 給 `renderReport()` 一份含通過與失敗的 JSON、兩個 SHA、日期
- **THEN** 輸出含後端與前端 SHA、每個標題一行且標示通過／失敗、失敗那行含錯誤訊息、〈送回後端〉列出 `report: true` 的 `key`

#### Scenario: [FE-O08-S08] 半份報告不產

- **WHEN** JSON 缺席、或不是合法 JSON、或後端 SHA 是空字串
- **THEN** `renderReport()` 拋錯，wrapper 不寫任何檔案，結束碼非零

### Requirement: README 的差異清單跟期望表一致

`docs/evidence/fe-o08/README.md` SHALL 列出送回後端的每一條與前端各自接手的工作項目。
它 MUST 跟期望表對得上：README 提到的每個 `key` 存在於期望表；期望表 `report: true` 的每個 `key` 出現在 README。
任一邊多或少，單元測試 SHALL 失敗。

#### Scenario: [FE-O08-S09] 兩邊一致

- **WHEN** README 少列一條 `report: true` 的 `key`，或多寫一個期望表沒有的 `key`
- **THEN** 比對測試失敗，訊息含那個 `key`
