## Why

`docs/WBS.md` 的 `FE-R11`：「RealtimeChat：Lobby / Room scene chat 送收；client memory 保留近期訊息，refresh 後清空」（W3）。

WebSocket 契約早就有 `chat`（`src/api/contract/ws.ts` 的 `ChatIn`／`ChatOut`），後端也照 scene 廣播（`app/main.py`：
`relay_chat` → `broadcast`，**含自己**；不落 DB、不 scrollback）。前端這邊 `RemoteWorld` 是唯一持有 `RealtimeClient` 的組裝點，
`createMessageValidator` 驗過的訊息只餵給 `applyMessage`（遠端玩家）——`chat` 通過驗證之後**沒有人接**。

**不做會怎樣**：`FE-K04` 的 chat UI 會被迫自己解析 raw socket、直接 import `RealtimeClient`、做本地回聲、把大廳與房間的訊息
放在同一份沒有清理時機的 state —— 同時破壞 `realtime-protocol` 的驗證邊界、`realtime-client` 的 import 邊界、`FE-V01` 的場景提交語意。
先把這一層談定，UI 才有可以依賴的語意：自己的話什麼時候出現、換場景什麼時候清、留幾筆、沒 ready 送出怎麼失敗。

## What Changes

- 新增 capability `scene-chat-transport`：
  - 只收 `realtime-protocol` 驗證成功的 `ChatOut`；送出只透過 `RemoteWorld` 注入的窄介面（`ChatIn`），不 import client 的值
  - 自己的話**只**在伺服器回聲後出現一次（後端廣播含自己，所以不做本地回聲、也不做去重）
  - 目前場景最多留 **100 筆**、依接收順序；第 101 筆淘汰最舊
  - 新場景 **committed** 才清空；過場失敗不清；舊 generation 晚到的訊息不進新場景
  - 不落任何 storage；refresh＝空
  - `LIMITS.chatBody = { min: 0, max: UNBOUNDED }` 如實記錄「後端什麼都沒驗」（`FE-O06` 的慣例），前端**不**發明上限；「全空白不送」是 `FE-K04` 的規則
  - 空字串、全空白、含 HTML 的 body 照原值收；怎麼呈現是 `FE-K04`（`FE-T06` 的具名文字元件）
- 不改 WebSocket schema、不改 `protocol.py`、不動 `realtime-client`／`realtime-protocol` 的既有 Scenario

## Non-goals

- 不做看得見的 UI（列表、輸入框、空狀態、捲動）：`FE-K04`。
- 不做節流：`FE-X11`。
- 不做斷線重連與補訊息：`FE-R12`。
- 不做本地回聲、樂觀顯示、訊息 id、去重、時間戳（協定沒有）。
- 不做歷史、REST、DB、storage。
- 不做 moderation、封鎖、檢舉、rate limit、訊息大小上限（`BE-G15`／`BE-G16`；巨大訊息的記憶體風險明文接受，見 design D5）。
- 不做私訊、Inbox（`FE-K01` 已封存，那是持久的）。
- 不做 `FE-R10`、`FE-J14`。
