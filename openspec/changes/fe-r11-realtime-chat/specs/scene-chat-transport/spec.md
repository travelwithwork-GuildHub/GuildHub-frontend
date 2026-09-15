# scene-chat-transport Specification

## Purpose

場景聊天的傳輸層：把通過 WebSocket 契約驗證的 `chat` 訊息交給目前場景的記憶體，並提供符合 `ChatIn` 契約的送出入口。
它只保留目前頁面、目前 committed 場景的近期訊息（最多 100 筆），自己的話只在伺服器回聲後出現，
不建立後端不存在的歷史、跨場景快取或本地成功的假象。看得見的部分是 `FE-K04`。

## Applicability

權限：不適用 —— 大廳可匿名連線；房間的權限由既有握手處理。
併發：適用 —— 訊息可能在場景切換前後晚到。
持久資料相容性：不適用 —— 不讀寫 DB、REST、`localStorage`、`sessionStorage`。
失敗路徑：適用 —— 沒 `ready` 就送、舊場景訊息晚到、過場失敗。
測試連線：單元與 jsdom 不連任何服務；e2e 只打 `next start` 的 loopback，WebSocket 用 `routeWebSocket` 偽造，MUST NOT 連任何團隊共用位址。

## ADDED Requirements

### Requirement: chat 只收驗證過的伺服器訊息；送出只走注入的窄介面

系統 SHALL 只把 `realtime-protocol` 驗證成功且 `t === 'chat'` 的 `ChatOut` 交給場景聊天記憶體；chat 模組 MUST NOT 重新解析 raw string、
MUST NOT 重新定義 chat 欄位、MUST NOT import `RealtimeClient` 的值。送出 SHALL 組成 `src/api/contract/ws.ts` 的 `ChatIn`
交給 `RemoteWorld` 注入的 send port；連線不是 `ready` 時 SHALL 明確失敗（拋錯），MUST NOT 排隊、MUST NOT 靜默丟棄、MUST NOT 加進列表。

> 拔掉什麼會紅：分派器把 `status` 也餵給 chat → S01；chat 模組自己 `JSON.parse` → S01 的「沒有再次解析」（用 spy 在 validator 之後）；
> 沒 ready 時排隊 → S02。

#### Scenario: [FE-R11-S01] 合法的 chat 進記憶體，其他訊息不進

- **WHEN** 分派器依序收到驗證成功的 `status`、`chat`、`pos`、`presence`
- **THEN** 記憶體 SHALL 只新增那一則 `chat`，`id`／`name`／`body` SHALL 等於 `ChatOut` 的值
- **AND** chat 模組 SHALL 沒有收到 raw string
- → 驗於：單元

#### Scenario: [FE-R11-S02] 沒 ready 就送：明確失敗、不排隊、不進列表

- **WHEN** 連線在 `connecting` 或 `open`（還沒 `ready`）時送出 chat
- **THEN** 送出 SHALL 拋錯；send port SHALL 沒有收到 payload；記憶體 SHALL 不變
- **AND WHEN** 之後變成 `ready`
- **THEN** 那則 MUST NOT 被補送
- → 驗於：單元

### Requirement: 自己的話只在伺服器回聲後出現一次

送出 `ChatIn` 時系統 MUST NOT 把訊息加進記憶體；只有收到伺服器的 `ChatOut` 才 SHALL 加入，包括 `ChatOut.id` 等於自己的 id 的那一則
（後端廣播含自己）。

> 拔掉什麼會紅：送出時 append → S03 回聲前列表就有；`id === selfId` 略過 → S03 回聲後沒有。

#### Scenario: [FE-R11-S03] 送出不先顯示；回聲後恰好一筆

- **GIVEN** 連線 `ready`，自己的 id 是 `me`
- **WHEN** 送出 body「哈囉」
- **THEN** send port SHALL 收到 `{"t":"chat","body":"哈囉"}`；記憶體 SHALL 沒有「哈囉」
- **AND WHEN** 收到 `{"t":"chat","id":"me","name":"我","body":"哈囉"}`
- **THEN** 記憶體 SHALL 恰好一筆「哈囉」
- → 驗於：單元

### Requirement: 目前場景最多留 100 筆，不落任何 storage

記憶體 SHALL 最多保留 **100 筆**、依接收順序；第 101 筆進來時 SHALL 移除最舊的一筆。
系統 MUST NOT 把訊息寫進 DB、REST、`localStorage`、`sessionStorage`；重新整理後 SHALL 是空的。

> 拔掉什麼會紅：拿掉截斷 → S04 有 101 筆；寫進 storage → S05。

#### Scenario: [FE-R11-S04] 第 101 筆淘汰最舊的

- **WHEN** 依序收到編號 1～101 的合法 chat
- **THEN** 記憶體 SHALL 恰好 100 筆；第一筆是 2、最後一筆是 101
- → 驗於：單元

#### Scenario: [FE-R11-S05] 重新整理後沒有歷史

- **GIVEN** 這一頁已收到數筆 chat（偽造的伺服器送的）
- **WHEN** 重新載入頁面、重新連線，偽造的伺服器還沒送任何新的 `ChatOut`
- **THEN** 記憶體 SHALL 是空的；`localStorage` 與 `sessionStorage` 裡 MUST NOT 有任何一則的 body
- → 驗於：e2e（隨 `FE-K04` 的 UI 一起跑；記憶體的可觀察形式是列表）

### Requirement: 新場景 committed 才清空；舊 generation 的晚到不污染新場景

記憶體 SHALL 綁定 committed 場景與它的 generation：新場景 committed 時 SHALL 清空舊訊息；過場尚未成功時 MUST NOT 先清。
過期 generation 晚到的 `ChatOut` MUST NOT 加進目前場景。

> 拔掉什麼會紅：過場開始就清 → S07 失敗回來訊息沒了；不看 generation → S08 大廳的話出現在房間。

#### Scenario: [FE-R11-S06] 換場景成功才清

- **GIVEN** 大廳記憶體有一則訊息
- **WHEN** 進入房間的過場開始、新 socket 還沒 `ready`
- **THEN** 大廳的那則 SHALL 還在
- **AND WHEN** 房間收到 `hello`、成為 committed 場景
- **THEN** 記憶體 SHALL 清空；之後收到的房間 chat SHALL 是唯一內容
- → 驗於：jsdom

#### Scenario: [FE-R11-S07] 過場失敗，原場景的訊息不清

- **GIVEN** 大廳記憶體有一則訊息
- **WHEN** 進房的握手被拒、回到大廳（`FE-V01-S07`）
- **THEN** 那則 SHALL 還在
- → 驗於：jsdom

#### Scenario: [FE-R11-S08] 舊大廳的訊息晚到不進房間

- **GIVEN** 已從大廳 committed 到房間
- **WHEN** 舊 generation 的 callback 晚到一則合法的 `ChatOut`
- **THEN** 房間的記憶體 SHALL 不變
- → 驗於：單元

### Requirement: `LIMITS` 記錄 chat body 沒有後端上限；前端不發明上限

`src/api/contract/limits.ts` SHALL 有 `chatBody: { min: 1, max: UNBOUNDED }`，`LIMIT_SOURCES` 指向 `app/realtime/protocol.py::ChatIn.body`。
`ChatIn` schema MUST NOT 套用 Inbox（`messageBody`）的上限；一段超過 2000 code point 的字串 SHALL 通過 `ChatIn`。

> 拔掉什麼會紅：`max` 改成 2000 → S09；`ChatIn` 加 `.max()` → S09 那段長字串。

#### Scenario: [FE-R11-S09] chat 無上限不是遺漏，也不是 Inbox 的上限

- **WHEN** 檢查 `LIMITS.chatBody` 與 `LIMIT_SOURCES.chatBody`
- **THEN** `min` SHALL 是 1、`max` SHALL 是 `UNBOUNDED`；來源 SHALL 指向 `protocol.py::ChatIn.body`
- **AND** 2001 個 code point 的 body SHALL 通過 `ChatIn.safeParse`
- → 驗於：單元
