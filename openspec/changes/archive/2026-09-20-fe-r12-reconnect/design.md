## Context

`RemoteWorld` 的一個 effect 實例＝一個（scene, token, generation, allowed⋯）的組合；它建一條 `RealtimeClient`、把 `onMessage`／`onStateChange`／`onClosed` 接到
名單容器、聊天的 `link`、狀態的 `statusLink`、`PositionSync` 的 `clientRef`。`RealtimeClient` 一條連線只活一次（`connect()` 只准從 `idle`），
換 scene 用 `closeAndEnter()`（等舊 close 事件 ≤1 秒再建）。`ConnectionClosed` 只有 `opened`（握手成功過沒有），沒有原因分類（量過：四種失敗長得一樣）。
`SceneProvider.reportConnection` 只在 `transition !== null` 時處理事件；`ready` 之後的 `closed` 直接被忽略。
後端 `join` 是新的 `Player`（`st=""`、位置出生點），`snapshot` 整份重建（`applyMessage` 已是 `roster` 換新 Map、`motion.clear()`）。

## Decisions

### D1｜重連迴圈住在 `RemoteWorld` 的 effect 裡，退避與排程是一個沒有 React、沒有 client 的純模組

`src/realtime/reconnect.ts`：`createReconnectSchedule({ baseMs, capMs, random, setTimeout, clearTimeout })` → `{ schedule(run), reset(), cancel(), attempt }`
—— 純函式 `backoffDelay(attempt, base, cap, random)` = `random() × min(cap, base × 2^attempt)`（full jitter）。
`RemoteWorld` 把「建 client ＋ 接線」抽成一個 `open()`；`onClosed` 且 `!cancelled` 且這個 effect 實例**曾經 ready** → 清容器、通知、`schedule(open)`；`ready` → `reset()`；cleanup → `cancel()`。
不讓 `RealtimeClient` 自己重連：它的契約是「一條連線一次」而且下游靠 **client 物件的身分**當 session generation（`PositionSync` 的重置就是比對它）——
每次重連換一個 client 物件，這件事免費得到。代價：`RemoteWorld` 的 effect 多一層 `open()` 包裝（實作時看 diff 上界，必要時先 `chore/` 把接線抽成 hook）。

⚠️ **舊 client 的事件今天不會自己安靜**（兩個外部審查者都指出）：`RealtimeClient.#handleClose`（意外斷線那條路）只把 `#socket = null`，**沒有 removeEventListener**；
之後再對它 `close()` 也沒有 socket 可拆。舊 socket 遲到的 `message` 會走舊 client 的 `onMessage` → `applyMessage` 寫進**同一個共用的 `state`** → 污染新名單。
所以兩道防禦都要：(1) `#handleClose` 把三個 listener 拆掉（`client.ts` 小改，跟 `#close` 同一組 reference）；(2) `open()` 建的每一組 callback 都比對 `client === current`，不是目前的 client 一律丟。
S05 直接對舊替身 emit 事件驗這件事 —— 它不是恆真。

### D2｜斷線當下就清，不等新 snapshot

`onClosed`（意外）當下 `resetRemotePlayers`、`setRoster(EMPTY)`、`onRosterChange(EMPTY)`、`onOnlineCountChange(null)`（`onlineCountOf` 在 `ready=false` 時本來就回 `null`）。
不留鬼影到 snapshot 才換：重連可能要等 30 秒，這段時間畫面上定住的角色會被當成「還在」。代價：重連很快（<1 秒）時別人會閃一下 —— 接受（跟換場景一樣）。

### D3｜只有「這個 effect 實例曾經 `ready`」的斷線才重連；沒 ready 過的失敗交給過場

過場中握手被拒 → `SceneProvider.fail()` 改 `desired` 回大廳 → `scene` prop 變 → effect 重跑。如果 `RemoteWorld` 對同一個 `closed` 也排重連，
jitter 可能給 0 毫秒 → 在 React 還沒把 scene 換掉之前又對房間連一次 —— 兩套機制對同一次失敗動手，`world-scenes` 的「任何時刻至多一條未 close 的連線」就靠運氣。
所以邊界是 `everReady`（**是 `ready`，不是 `opened`**：open 過但沒收到 `hello` 就斷的也不歸迴圈）：ready 過 → 之後的失敗（含重連時握手再被拒）全歸迴圈；沒 ready 過 → 一律不歸迴圈。
代價：打開 `/world` 時後端不在（第一次就連不上）不會自動重試 —— Non-goal 明寫；demo 前後端已在。

**`everReady` 只證明歷史，不證明這個 effect 現在還是權威**（兩個外部審查者都指出）：使用者按門 → `setDesired` → React 重新 render、換 `scene` prop → 舊 effect 的 cleanup 跑 `cancel()`。
非 discrete 事件的 passive effect 走 Scheduler，setState 到 cleanup 之間有一段 macrotask 的窗；斷線的 close 事件＋一個 0 ms 的 jitter 排程可以擠進那扇窗，對舊場景再連一條 —— 兩條連線並存。
所以排程執行的那一刻要再問一次：`RemoteWorld` 多一個身分穩定的 prop `canReconnect?: (wsScene: string) => boolean`，`SceneProvider` 給的是
`(ws) => latest.current.transition === null && sceneOf(latest.current.scene).wsScene === ws`（讀 ref，不進依賴）；回 false 就放棄這一次、不建、不再排（新的 effect 會接手）。
沒給 prop 的（既有測試、沒 provider 的地方）視為永遠 true。S10 驗這條。

### D4｜通知走 `SceneProvider` 既有的事件通道，不新開 context

`ConnectionEvent` 多一種 `{ kind: 'recovering' }`：**只有 `RemoteWorld` 真的排下重連時才發**（`everReady` 且沒被取消），不讓 provider 從 `closed.opened` 去推 ——
推的話「open 過沒 ready 的第一次失敗」會顯示一則永遠不消失的通知（外部審查指出）。
provider 記的是 `recovering: string | null`（哪個 `wsScene` 在恢復），**顯示與否是推導的**：`recovering !== null && recovering === sceneOf(resolved.scene).wsScene && transition === null` ——
按門開始過場、場景換了，通知自然不顯示，不需要「清除事件」；那個場景的 `ready` 把它設回 `null`。
`SceneValue` 多一個 `recovering: boolean`（推導後的）；`SceneNotices` 多一則 `role="status"`（不是 `alert`：這不是使用者做錯什麼，而且會自己消失）。
不用新的 context：`RemoteWorld` 在 `<Canvas>` 裡，資料往外只有 callback 一條路，而 `onConnection` 已經是那條路。
代價：`reportConnection` 的分支多一段；`recovering` 是 provider 的 state，每次斷線／恢復各一次重繪（低頻）。失去分頁資格時沒有事件：那時 `multi-tab` 的覆蓋層在上面，
拿回資格後新 effect 的 `ready` 會清掉它 —— 可接受。

### D5｜退避常數：基數 1 秒、上限 30 秒、full jitter、無次數上限

AWS 的 full jitter：`sleep = random(0, min(cap, base × 2^attempt))`。後端重啟量到約 30～60 秒；上限 30 秒讓迴圈在它回來後 ≤30 秒內接上，
而不會在它沒回來時每秒敲。無次數上限：房間的票失效時會一直失敗（握手被拒），迴圈以 ≤30 秒一次敲下去 —— demo 範圍接受；
待答問題記著「失敗 N 次改成回大廳＋通知」。常數寫進 Requirement（`config.yaml` 的規則：逾時與頻率要進規格）。

### D6｜效能

零新請求（沒斷線時）；斷線期間每次嘗試一條 WS 握手；不加計時器到正常路徑（`FE-R01-S08` 的「沒有保活計時器」仍成立 —— 排程只在斷線後存在，ready 就清）。
world chunk 預期 +1 KB gz 以內，量前後差貼 PR。

## 待答問題

- 連續失敗 N 次（或超過 M 分鐘）要不要改成「回大廳＋通知」而不是無限敲：demo 排演看。
- 「立刻重試」按鈕：demo 排演時 30 秒上限如果讓人等得難受再加（design D5 的常數會變成 Requirement 的修訂 → 重開 spec PR）。
- 「後端回來後 ≤30 秒接上」只對前景分頁的下一次排程成立（外部審查）：背景節流與握手時間另計；demo 時分頁在前景。
- 通知放哪裡（`SceneNotices` 的位置、還是在線人數旁邊）：實作前問 `ui-ux-pro-max`，截圖貼 PR。

## Risks

- 舊 socket 的 close 與新連線的 open 交錯：見 D1 的警告 —— `#closeEmitted` 只擋重複的 close，**不擋 message／open**；要拆 listener＋身分比對兩道。判準直接對舊替身 emit 事件證明（S05、S06）。
- 分頁在背景時計時器被節流（Chrome：隱藏分頁 ≥1 秒、久了 ≥1 分鐘一次）：迴圈變慢，不變錯；回前景第一個計時器就會跑。`FE-R04` 已定背景不斷線。
- `generation`／`scene`／`token` 變了會 cleanup 舊 effect（`cancel()`）再建新的 —— 迴圈跟著 effect 生死，不會有兩條。
