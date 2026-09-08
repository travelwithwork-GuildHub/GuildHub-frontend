# Tasks

實作分成兩個 `feat/` slice，各自一個 PR，都在 400 行上限內：

- `feat/fe-r01-realtime--client` —— 1、2、3 節
- `feat/fe-r01-realtime--verify` —— 4、5 節（整合驗證與收尾）

## 1. 前置

- [x] 1.1 規格已在 PR 上談定並合併進 `main` —— 用 `git log --oneline main -- openspec/changes/fe-r01-realtime/` 確認
- [x] 1.2 確認位址從 `runtime-config` 的 `wsUrl()` 來、訊息形狀從 `api-contract` 的 `ws.ts` 來，**兩者都不改**；驗證方式是 `git diff --stat` 的檔案清單不含那兩個目錄

## 2. 連線與狀態（Requirement：狀態機／監聽器時機／一條連線一個 scene）

- [x] 2.1 建立 `src/realtime/` 的 client：`connect(scene?, token?)`、狀態、`close()`；狀態機是 `idle → connecting → open → ready → closed`
- [x] 2.2 監聽器**在建立 WebSocket 的同一個同步區塊裡**掛好，中間不得有任何 `await`／`then`／`setTimeout`（design 的 D2）；驗證 `FE-R01-S03` 通過
- [x] 2.3 用 `api-contract` 的 server schema 認出 `hello`，取出 `you` 當自己的 id；**其餘訊息原樣交出去，不做未知 `t` 的政策**（那是 `FE-R02`）；驗證 `FE-R01-S01` 通過
- [x] 2.4 `ready` 以外送訊息要明確失敗，不得靜默丟棄；驗證 `FE-R01-S02` 三個狀態都涵蓋
- [x] 2.5 `scene` 預設 `lobby`，`scene`／`token` 進查詢參數，base 來自 `wsUrl()`；驗證 `FE-R01-S04` 通過
- [x] 2.6 換 scene 是關掉重開，舊連線的監聽器先移除；驗證 `FE-R01-S05` 通過
- [x] 2.7 **負向驗證**：把監聽器的安裝改成 `queueMicrotask(...)` 之後再掛，確認 `FE-R01-S03` 變紅；還原

## 3. 關閉與保活（Requirement：關閉只說事實／不做應用層保活）

- [x] 3.1 關閉事實只有 `code`／`reason`／`wasClean`／`opened`，**型別裡不得有原因分類欄位**（design 的 D3）；驗證 `FE-R01-S06` 通過
- [x] 3.2 `close()` 幂等，關閉事件只發一次，關閉後移除所有監聽器；驗證 `FE-R01-S07` 通過
- [x] 3.3 保活的否定契約：`ready` 之後用 fake timer 推進超過 35 秒，斷言 `send()` 一次都沒被呼叫、沒有為保活而設的計時器；驗證 `FE-R01-S08` 通過
- [x] 3.4 **負向驗證**：加一個每 15 秒送一次的 ping，確認 `FE-R01-S08` 變紅；還原。**這一條證明的是「我們沒有加 heartbeat」，不是「伺服器的保活有效」**
- [x] 3.5 在程式碼註解裡寫明 3.3 那條測試證明不了什麼（單元測試裡沒有真的 WebSocket）

## 4. 整合驗證（不進 CI）

**只准打自己 `bash run.sh` 起的後端**（`AGENTS.md`〈測試環境隔離〉）。
每一條都把實際輸出貼在 PR 上。

- [ ] 4.1 V1：起後端、連上、靜止 35 秒後看 `readyState`；貼輸出
- [ ] 4.2 V2：瀏覽器開 `/world` 連兩次，比對兩次的 `hello.you` 是否相同。**預期會失敗**（還沒有登入，`FE-A01` 在 W2）—— **照實貼失敗的結果**，並註明由 `FE-A01` 之後補驗
- [ ] 4.3 V3：用不合法的 scene 連一次，記下 `code`／`reason`／`wasClean`；貼輸出，確認仍然是 `1006`／空／`false`
- [ ] 4.4 換 scene 時「舊的先關乾淨」要不要等 `close` 事件：量一次兩種做法的延遲，把數字寫進 PR，然後在 design 的 Open Questions 上結案

## 5. 完成前的驗證

- [ ] 5.1 `openspec validate fe-r01-realtime --strict` 通過，貼輸出
- [ ] 5.2 `npm run lint && npm run typecheck && npm test && npm run build` 全綠，貼輸出（測試數量要看得到）
- [ ] 5.3 `bash .github/scripts/progress.sh --check` rc=0，貼輸出
- [ ] 5.4 跑缺口報告並對每一條缺口說出處置。**Scenario ID 寫在 `it` 標題上，而且那條 `it` 要把該 Scenario 的每一個 WHEN/THEN 子句都跑過**
- [ ] 5.5 確認這一刀**沒有**建立任何遠端玩家、沒有送任何位置、沒有重連邏輯 —— 用 `git diff --stat` 的檔案清單當證據
