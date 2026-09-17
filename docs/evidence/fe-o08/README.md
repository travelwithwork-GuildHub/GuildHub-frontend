# FE-O08 切換演練：證據與差異清單

這個目錄放**切換演練**每一次的報告：對本機自起的真後端（loopback、可拋棄庫）走一次案件閉環，
把量到的後端行為對照期望表。規格在 `openspec/changes/fe-o08-guildhub-rehearsal/`（封存後在 `openspec/specs/switch-rehearsal/`）。

- 怎麼跑：`GUILDHUB_BACKEND_DIR=<後端 clone> INTERNAL_TEST_DATABASE_URL=<loopback 可拋棄庫> node scripts/contract-guildhub.mjs --suite rehearsal`
  （`pnpm test:rehearsal:guildhub`）。**只對自起的後端跑**；wrapper 不接受任何既有的後端位址。
- 報告檔名 `<YYYYMMDD>T<HHMMSS>Z-<後端 SHA 前 7>-<前端 SHA 前 7>-<隨機 6>.md`，一次一份、不覆寫。
  前端工作樹不乾淨時報告落在 `.local/rehearsal/`（gitignore）—— 這裡永遠只有乾淨工作樹產的。
- 期望表是唯一來源：`tests/rehearsal/expectations.ts`。下面三節的 `(key, owner)` 由 `tests/rehearsal-expectations.test.ts`
  比對成跟期望表**集合相等**（多、少、錯置、owner 寫錯都紅）。**改這裡要連期望表一起改**。
- 基線是 2026-09-17 對後端 `c6f3928` 量到的。演練變紅的意思是「觀測值變了、要重新分類與更新規格」，不是後端 regression。

## 前端要相容的契約

`kind: contract` —— 後端就是這樣，前端的規格要對著它寫。

| key | owner | 行為 |
|---|---|---|
| `list-default-recruiting` | FE-J01 | `GET /api/projects` 不帶 `status` 只回 `recruiting`；`?status=active` 才回成軍的 |
| `form-team-repeat` | FE-J04 | 成軍後再成軍 200 換密碼：舊密碼 `enter` 403、新密碼 200 |
| `seat-409-detail` | FE-J13 | 同一人再坐 409「你已經在這個房間有座位了」；坐別人的位 409「這個座位已經有人了」—— 只靠文字分 |
| `seat-out-of-range` | FE-J13 | `seat_index` ≥ `seat_count` 是 400，訊息含座位數 |
| `owner-needs-enter` | FE-J13 | 發案者沒 `enter` 也看不到座位（403） |
| `close-idempotent` | FE-J04 | 重複結案 200 |
| `close-clears-seats` | FE-J04 | 結案後 `GET …/seats`（持有效 token）是 `[]` |

## 送回後端裁定的異常

`kind: anomaly` —— 觀測到、疑似後端缺陷；是 bug 還是設計由後端裁定（design D5）。
裁定之前，`owner` 的規格 **MUST NOT** 把它當成可以開放給使用者的行為，而且**不進 `internal` 替身**（見下面的交接表）。

| key | owner | 行為 | 前端在裁定前的義務 |
|---|---|---|---|
| `create-unvalidated` | FE-J01 | `POST /api/projects` 空 `title`、`seat_count` 0 與 9 都 201 | 前端自己訂上限並寫進規格（`FE-X05` 的規則） |
| `form-team-after-close` | FE-J04 | `closed` 之後成軍 200、狀態回到 `active`、`/api/rooms` 再含它 | `closed` 的案子不給成軍入口 |
| `close-keeps-token` | FE-J13 | 結案後隊員用舊 token 仍能 `POST …/seats` 201 | `closed` 的房間不給坐位入口 |

## 送回後端

`report: true` 的全部（跨兩種 kind）。報告的〈送回後端〉從期望表的 `report: true` 產，這一節只是同一個集合的人讀版；由後端決定改不改。

| key | owner | 要請後端裁定的事 |
|---|---|---|
| `create-unvalidated` | FE-J01 | 建案要不要驗欄位（空 `title`、`seat_count` 範圍） |
| `form-team-after-close` | FE-J04 | `closed` 能不能再成軍（復活） |
| `close-keeps-token` | FE-J13 | 結案後舊 room token 要不要失效 |

## 量到但不在基線裡

演練是 REST 閉環，這些量到了但不釘（各歸各的規格）：

- **WebSocket 關閉碼**：後端收 SIGTERM 優雅關閉時，客戶端收 close `1012`、`wasClean: true`。歸 `FE-R12` 斷線復原。
- `enter` 成功會更新 session cookie（token 也在 cookie 裡），8 小時。
- `form-team` 短密碼（3 字）也 200；成軍密碼的最短長度由前端訂。
- `nickname` 超過 20 字回 500（歸 `FE-A08`）。

## 交接表：`internal` 這六個操作誰補（design D4）

O08 不補 `internal` 的替身。在下面三個 change 落地之前，這六個操作的行為只有本機的演練釘著，CI 看不到。

| 操作 | 誰補 internal ＋ 雙目標契約測試 | 補完後契約套件的哪些 todo 轉正 |
|---|---|---|
| `POST /api/projects`、`GET /api/projects`（`status` 篩選）、`GET /api/projects/{id}` | `FE-J01`（列表／詳情的畫面在 `FE-B02`／`FE-B03`，但 Route Handler 跟著建案走） | `title`／`body`／`needed_skills`／`seat_count` 的邊界 todo |
| `form-team`、`close` | `FE-J04`：成軍與結案的 API、`form-team-repeat`、`close-idempotent`、`close-clears-seats`；`closed` 不給成軍入口（`form-team-after-close` 的前端側） | — |
| `GET`／`POST …/seats` | `FE-J13`：座位的 API、`seat-409-detail`、`seat-out-of-range`、`owner-needs-enter`；`closed` 不給坐位入口（`close-keeps-token` 的前端側） | `seat_index` 的邊界 todo |

**`anomaly` 不進替身。** 三條 anomaly 在後端裁定之前只留在演練裡；`FE-J01`／`J04`／`J13` 補 `internal` 時 MUST NOT
把它們實作成替身的「正確行為」（替身接受空 title、復活 closed、結案後還能坐 —— 那是把缺陷複製進來）。
替身對這三件事的行為由那三個 change 各自寫進規格（預期是拒絕），契約測試只對七條 `contract` 做雙目標。

完成條件：那個 change 封存時，對應的基線條目在契約套件裡有雙目標的測試；演練那一條可以留著（多一層不衝突）。

## 跑的頻率

- 每個案件相關的 change 開 `spec/` 之前跑一次：交接表的 `FE-J01`／`J04`／`J13`，以及吃這些行為的畫面 `FE-B02`／`B03`（列表、詳情）與 `FE-J03`（我的案件靠 `list-default-recruiting` 的 `status` 篩選翻頁）。
- 後端換 commit 時跑一次；紅的條目就是漂移，報告會標出後端 SHA。
- 不在 CI 跑（要自起後端）；報告 commit 進這個目錄就是 `FE-O11` 那種離線取得回的證據。
