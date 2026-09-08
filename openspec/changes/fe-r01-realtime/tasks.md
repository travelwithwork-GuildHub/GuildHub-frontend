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

- [x] 4.1 V1：起後端、連上、靜止 35 秒後看 `readyState`；貼輸出

  通過。**第一次跑是紅的，而紅的原因跟後端無關**：`connect()` 在收到 `hello`
  就 resolve，而 `snapshot` 緊接在後（實測 <1ms），所以立刻取基準線會把
  `snapshot` 算成「靜止期間收到的訊息」。改成先讓握手那一批沉澱 500ms
  再取基準線，並順手斷言握手就是兩則。
- [x] 4.2 V2：**做不了，而且阻塞比預期的更上游。**

  規格原本寫「預期會失敗（還沒有登入）」。實際量到的是**根本拿不到 session cookie**：

  ```
  $ curl -i -X POST http://localhost:8000/api/login -d '{"nickname":"驗證用"}'
  HTTP/1.1 500 Internal Server Error
  content-type: text/plain; charset=utf-8
  ```

  `/api/login` 要寫 `profiles` 表，而資料庫沒有連上。所以 V2 卡的不是
  「前端還沒有登入畫面」，是**後端連建立 session 的能力都還沒有**。
  可拋棄的資料庫是 `FE-O04`（W2），登入是 `FE-A01`（W2）。

  另外：這台機器的瀏覽器自動化起不來（Chrome 兩次都以 SIGTRAP 結束），
  但那不影響結論 —— 就算瀏覽器能跑，沒有 cookie 可帶。

  **處置：V2 移到 `FE-A01` 之後補驗。** 在那之前「cookie 有沒有送到」
  這件事**沒有人驗過**，而它的失敗是無聲的（後端會安靜地發一個新身分）。
- [x] 4.3 V3：通過，而且**抓到一個單元測試看不到的 bug**。

  `closed.code` 是 `undefined` —— 因為 `#emitClosed` 用 `{ ...info }` 展開，
  而真的 `CloseEvent` 的 `code`／`reason`／`wasClean` 是**原型上的 getter**，
  不是自有屬性。替身 emit 的是普通物件，所以單元測試全綠。

  改成逐欄取值；並把替身改成把欄位放在原型上，讓它下次在單元測試就紅
  （負向驗證：把修正改回展開運算子，`FE-R01-S06` 變紅）。

  修好之後 `code=1006`／`reason=""`／`wasClean=false`／`opened=false`，
  跟開工前量到的一致。
- [x] 4.4 換 scene 時要不要等 `close` 事件：**量到不用等。**

  量法比「量延遲」直接：換到同一個 scene，看新連線的 `snapshot` 裡有幾個人。
  重疊的話後端會把同一個人當成兩個。

  ```
  4.4 量到的：換 scene 之後新連線的 snapshot 有 1 個人
      {"t":"snapshot","players":[{"id":"70eea369-…","name":"訪客",…}]}
  ```

  **1 個 —— 沒有重疊。** 所以 `closeAndEnter` 不等 `close` 事件是安全的。

  ⚠️ **但這是對本機後端量的。** 保證它的機制不明顯（舊連線的關閉要比新連線的
  握手快），高延遲的線路上不一定成立。這條測試留在整合驗證裡，
  之後在別的環境跑到它變紅的話，那就是要改成等 `close` 的證據。
  design.md 的 Open Questions 不改 —— `feat/` 不得回改 design。

## 5. 完成前的驗證

- [ ] 5.1 `openspec validate fe-r01-realtime --strict` 通過，貼輸出
- [ ] 5.2 `npm run lint && npm run typecheck && npm test && npm run build` 全綠，貼輸出（測試數量要看得到）
- [ ] 5.3 `bash .github/scripts/progress.sh --check` rc=0，貼輸出
- [ ] 5.4 跑缺口報告並對每一條缺口說出處置。**Scenario ID 寫在 `it` 標題上，而且那條 `it` 要把該 Scenario 的每一個 WHEN/THEN 子句都跑過**
- [ ] 5.5 確認這一刀**沒有**建立任何遠端玩家、沒有送任何位置、沒有重連邏輯 —— 用 `git diff --stat` 的檔案清單當證據
