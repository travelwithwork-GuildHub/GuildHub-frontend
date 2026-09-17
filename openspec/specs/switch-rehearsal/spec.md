# switch-rehearsal Specification

## Purpose
真後端上線之後，前端對它的每一個假設都要有一條會變紅的東西守著。這份 capability 定義「切換演練」：
一個只在本機、只對自起的真後端跑的套件，走一次完整的案件閉環，把量到的後端行為釘成**觀測基線**
（不是前端認可的長期契約），並把每次演練的結果落成不可變的證據。它補的是契約套件涵蓋不到的那一塊 ——
`internal` 沒有的操作。

## Requirements

### Requirement: 演練只對自起的、loopback 的真後端跑

演練 SHALL 經由 `scripts/contract-guildhub.mjs --suite rehearsal` 執行，沿用契約套件 `guildhub`
那一輪的 preflight 與起停。preflight 的四條 —— 後端 repo 不在、port 已有人在聽、`INTERNAL_TEST_DATABASE_URL`
缺席或不是 loopback、跟 `INTERNAL_DATABASE_URL` 是同一個庫 —— 任一條不過 SHALL 在 `reset()` 與 `spawn()`
之前失敗、結束碼非零並說明是哪一條。wrapper 的流程 SHALL 是一個可注入依賴的函式 `run({ argv, env, deps })`
（`deps` 至少含 `preflight`、`reset`、`spawn`、`finish`），回傳結束碼、不自己 `process.exit`；
`main()` 只負責把真的依賴餵進去。演練 MUST NOT 接受任何既有的後端位址。

`--suite` 的文法由純函式 `parseSuite(argv)` 決定：接受 `--suite rehearsal` 與 `--suite=rehearsal` 兩種寫法；
合法值只有 `contract`（預設）與 `rehearsal`；缺席時 SHALL 是 `contract`（既有行為不變）；出現兩次、缺值、
值不合法 SHALL 拒絕（不是退回預設）；`--` 之後的 token 不解析、原樣轉傳。回傳的 `rest` SHALL 只拿掉 `--suite`
那一或兩個 token，其餘一個都不動。`rehearsal` 時 wrapper 擁有 `--config`、`--reporter`、`--outputFile`：
使用者再傳任何一個 SHALL 拒絕。

#### Scenario: [FE-O08-S01] `--suite` 的文法

- **WHEN** argv 是 `['--suite', 'rehearsal', '-t', 'seat']`、或 `['--suite=rehearsal', '-t', 'seat']`
- **THEN** suite 是 `rehearsal`，`rest` 是 `['-t', 'seat']`
- **WHEN** argv 不含 `--suite`
- **THEN** suite 是 `contract`，`rest` 是原 argv
- **WHEN** argv 是 `['--', '--suite', 'rehearsal']`
- **THEN** suite 是 `contract`，`rest` 是原 argv（`--` 之後不解析）
- **WHEN** `--suite` 出現兩次、或缺值、或值是 `foo`、或 `rehearsal` 配上 `--config`／`--reporter`／`--outputFile` 任一個
- **THEN** 拋錯，訊息含兩個合法值或那個被拒的旗標名

#### Scenario: [FE-O08-S02] preflight 四條各自擋在起任何東西之前

- **WHEN** 用注入的依賴呼叫 `run()`，而後端目錄沒有 `run.sh`、或 port 已有人在聽、或 `INTERNAL_TEST_DATABASE_URL` 缺席或主機不是 loopback、或它跟 `INTERNAL_DATABASE_URL` 指到同一個庫
- **THEN** 四種情況各自：回傳的結束碼非零、錯誤訊息說明那一條、注入的 `reset` 與 `spawn` 呼叫次數都是 0

### Requirement: 閉環的每一步都對照期望表

演練 SHALL 用兩張名片（發案者 A、隊員 B）循序走下列十三步。每一步是期望表裡一條有穩定 `key` 的項目，
含請求、期望狀態碼、回應要通過的 schema（`src/api/contract/rest.ts`）。**每個 `key` SHALL 是 vitest 裡獨立的一個葉節點**
（標題含 `key` 與 Scenario ID），前一步的結果經共用狀態傳給下一步；任何一步不符 SHALL 讓該步失敗、
套件結束碼非零，失敗訊息含 `key`、期望值與實測值。**前置步驟失敗時，依賴它的步驟 SHALL 以 `blocked: <前置 key>`
開頭的訊息失敗**（不得假裝通過、也不得消失），報告把它們標成 `blocked` 而不是 `failed`。
期望表是唯一來源：測試 MUST NOT 在斷言裡另寫數字。

| # | key | 請求 | 期望 |
|---|---|---|---|
| 1 | `login-owner` | A `POST /api/login` 暱稱 | 200 `ProfileOut` |
| 2 | `login-member` | B `POST /api/login` 暱稱 | 200 `ProfileOut` |
| 3 | `create` | A `POST /api/projects`（`seat_count` 2） | 201 `ProjectOut`，`status` `recruiting`，`expires_at` 在建立時間後 7 天（±5 分鐘） |
| 4 | `list-contains` | B `GET /api/projects` | 200 `ProjectOut[]`，含第 3 步的 id |
| 5 | `get` | B `GET /api/projects/{id}` | 200 `ProjectOut`，同一個 id |
| 6 | `form-team` | A `POST …/form-team` 密碼 | 200 `ProjectOut`，`status` `active`，`room_template` 是整數 |
| 7 | `rooms-contains` | B `GET /api/rooms` | 200 `RoomDoorOut[]`，含它 |
| 8 | `enter` | B `POST …/enter` 正確密碼 | 200 `EnterOut` |
| 9 | `seats-empty` | B `GET …/seats` | 200 `[]` |
| 10 | `seat-claim` | B `POST …/seats` `seat_index` 0 | 201 `SeatOut`，`user_id` 是 B |
| 11 | `message` | B `POST /api/messages` 給 A | 201 `MessageOut` |
| 12 | `close` | A `POST …/close` | 200 `ProjectOut`，`status` `closed` |
| 13 | `rooms-excludes` | B `GET /api/rooms` | 200，不含它 |

#### Scenario: [FE-O08-S03] 閉環十三步

- **WHEN** 對基準後端 `c6f3928` 跑演練
- **THEN** 十三步全部通過；期望表裡標為 `step` 的 `key` 集合恰好是上表十三個，沒有重複、沒有缺

#### Scenario: [FE-O08-S04] 期望不符就紅

- **WHEN** 期望表裡 `form-team` 的狀態碼被改成 201
- **THEN** 第 6 步失敗，訊息含 `form-team`、`201` 與實測的 `200`；第 7、8、9、10、12、13 步以 `blocked: form-team` 失敗；套件結束碼非零；報告裡第 6 步是 `failed`、其餘是 `blocked`

### Requirement: 已知行為釘成觀測基線，並區分契約與異常

期望表 SHALL 另外釘住下列十條 2026-09-17 對 `c6f3928` 量到的行為。每一條 SHALL 有 `kind`：
`contract`（前端要相容的後端行為）或 `anomaly`（觀測到、疑似後端缺陷、**送回後端裁定**）；
`anomaly` 的 `report` MUST 是 `true`。每一條 SHALL 有 `owner`（前端哪一個工作項目接手，`FE-` 開頭）。
這些期望是**基線**：演練變紅的意思是「後端的觀測值變了，要重新分類與更新規格」，不是後端 regression。
`owner` 的規格 MUST NOT 把 `anomaly` 當成可以開放給使用者的行為（例如不得因為 `form-team-after-close` 是 200
就給 `closed` 的案子放成軍入口）。

| key | kind | 行為 |
|---|---|---|
| `create-unvalidated` | anomaly | `POST /api/projects` 空 `title`、`seat_count` 0 與 9 都 201 |
| `list-default-recruiting` | contract | `GET /api/projects` 不帶 `status` 只回 `recruiting`；`?status=active` 才回成軍的 |
| `form-team-repeat` | contract | 成軍後再成軍 200 換密碼：舊密碼 `enter` 403、新密碼 200 |
| `form-team-after-close` | anomaly | `closed` 之後成軍 200、狀態回到 `active`、`/api/rooms` 再含它 |
| `seat-409-detail` | contract | 同一人再坐 409 `你已經在這個房間有座位了`；坐別人的位 409 `這個座位已經有人了` |
| `seat-out-of-range` | contract | `seat_index` ≥ `seat_count` 是 400，訊息含座位數 |
| `owner-needs-enter` | contract | 發案者沒 `enter` 也看不到座位（403） |
| `close-idempotent` | contract | 重複結案 200 |
| `close-clears-seats` | contract | 結案後 `GET …/seats`（持有效 token）是 `[]` |
| `close-keeps-token` | anomaly | 結案後隊員用舊 token 仍能 `POST …/seats` 201 |

#### Scenario: [FE-O08-S05] 十條基線

- **WHEN** 對基準後端 `c6f3928` 跑演練
- **THEN** 十條各自是獨立葉節點且全部通過；每一條的失敗訊息含 `key`，讓報告指得出是哪一條變了；基線之間互不依賴（各自建自己的專案），一條紅不擋其他條

#### Scenario: [FE-O08-S06] 期望表的形狀

- **WHEN** 讀期望表
- **THEN** 每一條有 `kind`（`step`／`contract`／`anomaly`）、`report` 布林、非空且 `FE-` 開頭的 `owner`；所有 `anomaly` 的 `report` 都是 `true`；`key` 不重複。缺一個就是單元測試失敗

### Requirement: 每次演練產一份不可變的報告

`--suite rehearsal` 時 wrapper SHALL 以 `--reporter=json --outputFile=<唯一暫存檔>` 跑 vitest，跑完（不論結束碼）
由 `finishRehearsal()` 決定：
- vitest 是被訊號終止的、JSON 檔缺席、或不是合法的 vitest JSON → MUST NOT 寫任何檔案，結束碼非零；
- JSON 完整（含有失敗的情況）→ 渲染報告，檔名 `<YYYYMMDD>T<HHMMSS>Z-<後端 SHA 前 7 碼>-<前端 SHA 前 7 碼>-<6 位十六進位隨機>.md`
  （UTC 時間＋隨機後綴，由 `finishRehearsal` 的 `now` 與 `random` 注入；每一次執行都拿到自己的檔名），結束碼沿用 vitest 的；
- 前端工作樹乾淨 → 落在 `docs/evidence/fe-o08/`（進版控的證據）；不乾淨 → 落在 `.local/rehearsal/`（已 gitignore），
  報告首行寫明 dirty。**證據目錄裡永遠只有乾淨工作樹產的報告**，不靠掃描、不靠人記得刪；
- 目標檔已存在（注入的 `random` 撞了、時鐘倒退之類）→ MUST NOT 覆寫，結束碼非零、訊息含路徑 —— 這是最後一道保險，不是預期路徑。
暫存檔 SHALL 在 finally 清除。報告內容 SHALL 含：後端 SHA、前端 SHA、每一條 `key` 的 `passed`／`failed`／`blocked`、
失敗訊息、〈送回後端〉節（`report: true` 的 `key`）；MUST NOT 複製期望表的說明全文。後端 SHA 拿不到（空字串）視同 JSON 缺席。

#### Scenario: [FE-O08-S07] 報告渲染

- **WHEN** 給 `renderReport()` 一份含通過與失敗的 vitest JSON、兩個 SHA、日期、dirty 旗標
- **THEN** 輸出含兩個 SHA、每個 `key` 一行標示 `passed`／`failed`／`blocked`（訊息以 `blocked:` 開頭的算 blocked）、失敗那行含錯誤訊息、〈送回後端〉列出 `report: true` 的 `key`；dirty 時首行寫明

#### Scenario: [FE-O08-S08] 半份報告不產、撞名不覆寫、有失敗照樣產、dirty 不進證據目錄

- **WHEN** JSON 缺席、或不是合法 JSON、或後端 SHA 是空字串、或 vitest 被訊號終止
- **THEN** `finishRehearsal()` 不寫任何檔案、回傳非零結束碼
- **WHEN** JSON 完整但 vitest 結束碼是 1
- **THEN** 報告寫出、內含失敗的 `key`，回傳 1
- **WHEN** 目標檔已存在
- **THEN** 檔案內容不變、回傳非零、訊息含路徑
- **WHEN** dirty 旗標是 true
- **THEN** 報告寫到 `dirtyDir`（`.local/rehearsal/`），`outDir`（證據目錄）裡沒有新檔

### Requirement: README 的差異清單跟期望表一致

`docs/evidence/fe-o08/README.md` SHALL 分三節列：〈前端要相容的契約〉（`kind: contract` 的**全部**）、〈送回後端裁定的異常〉
（`kind: anomaly` 的**全部**）、〈送回後端〉（`report: true` 的全部，跨兩種 kind），每一條寫 `key` 與接手的工作項目（`owner`）。
三節各自 MUST 跟期望表的對應 **`(key, owner)` 集合相等**（不多、不少、不錯置、`owner` 不能寫錯）；任一節不相等，單元測試 SHALL 失敗並指出 `key` 與那一節。

#### Scenario: [FE-O08-S09] 兩邊一致

- **WHEN** README 的〈契約〉少列一條 `contract`、或〈異常〉多寫一個期望表沒有的 `key`、或把 `anomaly` 放進〈契約〉、或〈送回後端〉漏一條 `report: true`、或某一條的 `owner` 跟期望表不同（例如把 `seat-409-detail` 寫成 `FE-J04`）
- **THEN** 比對測試失敗，訊息含那個 `key` 與那一節的名字
