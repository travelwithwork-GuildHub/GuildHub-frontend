# scene-chat-transport Specification

## Purpose

場景聊天的傳輸層：把通過 WebSocket 契約驗證的 `chat` 訊息交給目前場景的記憶體，並提供符合 `ChatIn` 契約的送出入口。
它只保留目前頁面、目前 committed 場景的近期訊息（最多 100 筆），自己的話只在伺服器回聲後出現，
不建立後端不存在的歷史、跨場景快取或本地成功的假象。看得見的部分是 `FE-K04`。

## Applicability

權限：不適用 —— 大廳可匿名連線；房間的權限由既有握手處理。
併發：適用 —— 訊息可能在場景切換前後晚到；同場景的重連（過場失敗退回、之後的 `FE-R12`）不是換場景。
持久資料相容性：不適用 —— 不呼叫任何 REST、不用 Web Storage。
失敗路徑：適用 —— 沒 `ready` 就送、長得像 chat 但不合契約、舊連線的訊息晚到、過場失敗。
已接受的風險：後端對 `body` 只要求是字串、沒有大小上限（`BE-G16`），一則巨大的合法訊息會佔前端記憶體 —— **本能力不在前端擋**
（那會掩蓋後端的缺口，也會讓各客戶端各自發明上限）；記在 design D5，`FE-O07` 銜接清單列它。
名詞：本文的「換場景」指 committed 的 `wsScene` 改變；「連線」指 `RemoteWorld` 建立的一個 `RealtimeClient` 實例
（`RealtimeGenerationProvider.generation` 是「要求重連」的代數，**不是**場景代號，不拿它當清空條件）。
測試連線：單元與 jsdom 不連任何服務；e2e 只打 `next start` 的 loopback，WebSocket 用 `routeWebSocket` 偽造，MUST NOT 連任何團隊共用位址。

## ADDED Requirements

### Requirement: chat 只收驗證過的伺服器訊息、照原值收；送出只走注入的窄介面

系統 SHALL 只把 `realtime-protocol` 驗證成功且 `t === 'chat'` 的 `ChatOut` 交給場景聊天的接收端（sink），而且是**驗證產出的物件**，不是字串；
驗證失敗的（缺 `name`、`body` 不是字串…）MUST NOT 到達 sink。`name`／`body` 是空字串或全空白的 `ChatOut` 是合法的（後端不驗），
SHALL **照原值**收進記憶體，MUST NOT trim、清洗、轉成 markup 或丟棄 —— 怎麼呈現是 `FE-K04`（`output-safety` 的具名文字元件）的事。
chat 模組 MUST NOT import `RealtimeClient` 的值、MUST NOT import 驗證器（靜態邊界）。
送出 SHALL 組成 `src/api/contract/ws.ts` 的 `ChatIn`（型別層保證形狀，不另加 runtime 驗證），交給 `RemoteWorld` 注入的 sender；sender 底下是 `client.send()`，
連線不是 `ready` 時 SHALL 拋 `RealtimeError`（不吞、不靜默 return），底層 socket MUST NOT 收到 frame，MUST NOT 排隊、MUST NOT 靜默丟棄、MUST NOT 加進列表。

> 拔掉什麼會紅：分派器把 `status` 也餵給 sink → S01 的 sink 呼叫次數；sink 收到字串或 chat 模組 import 驗證器 → S01 的 spy／靜態邊界；
> 驗證失敗也餵 sink → S10；sink 對空字串 trim 或丟棄 → S10 的照原值那段；沒 ready 時排隊 → S02。

#### Scenario: [FE-R11-S01] 只有驗證器產出的那個 chat 物件到達 sink，其他訊息一次都不到

- **GIVEN** 從 `RemoteWorld` 的 raw `onMessage` 入口進，驗證器換成假的：對 `chat` frame 回一個**有唯一身分的** `ChatOut` 物件 M；chat 的 sink 是 spy
- **WHEN** 依序餵 raw frame：`status`、`chat`、`pos`、`presence`
- **THEN** sink SHALL 恰好被呼叫一次，參數 SHALL `toBe(M)`（同一個 reference，不是欄位相等的複本 —— 自己 parse 再建物件會紅）
- **AND** 記憶體 SHALL 只新增那一則
- **AND** `src/realtime/sceneChat*` 的靜態 import 圖 SHALL 不含 `RealtimeClient` 的值、`createMessageValidator`、`JSON.parse`（既有 `boundaries` lint 的寫法）
- → 驗於：單元

#### Scenario: [FE-R11-S02] 沒 ready 就送：拋錯、socket 沒收到、不補送

- **GIVEN** 假的 `RealtimeClient`，`state` 分別是 `idle`、`connecting`、`open`、`closed`（四個 case 各跑一次）
- **WHEN** 透過注入的 sender 送出 chat
- **THEN** sender SHALL `toThrow(RealtimeError)`（吞掉或靜默 return 都紅）；底層 socket 的 `send` SHALL 沒有被呼叫；記憶體 SHALL 不變
- **AND WHEN** 之後 `state` 變成 `ready`，再跑完所有排程中的計時器
- **THEN** socket 的 `send` SHALL 仍沒有被呼叫（那則沒有被補送）
- → 驗於：單元

#### Scenario: [FE-R11-S10] 長得像 chat 但不合契約：不到 sink；空字串與危險字串照原值收

- **GIVEN** 從 `RemoteWorld` 的 raw `onMessage` 入口進，用**正式的**驗證器與分派（不是直接呼叫 typed dispatcher）
- **WHEN** 餵 raw frame `{"t":"chat","id":"x","body":"hi"}`（缺 `name`）與 `{"t":"chat","id":"x","name":"n","body":7}`
- **THEN** sink SHALL 沒有被呼叫；記憶體 SHALL 不變；下一則合法的 chat frame SHALL 照常進來
- **AND WHEN** 餵 `name` 是 `""`、`body` 是 `""`、`body` 是 `"   "` 的三則合法 chat，以及 `name` 與 `body` 都是 `<img onerror=…>` 的一則
- **THEN** 記憶體 SHALL 各新增一則，`name` 與 `body` SHALL 與 frame 裡的**完全相同**（沒有 trim、沒有轉義、沒有丟棄）—— 安全呈現是 `FE-K04` 的具名文字元件
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

### Requirement: 目前場景最多留 100 筆，不用 Web Storage、不呼叫 REST

記憶體 SHALL 最多保留 **100 筆**、依接收順序；第 101 筆進來時 SHALL 移除最舊的一筆。
chat 的模組（`src/realtime/sceneChat*` 與 `FE-K04` 之後的 UI）MUST NOT import `src/api/operations`、`src/api/transport`、任何 storage helper，
MUST NOT 出現 `localStorage`／`sessionStorage`／`indexedDB`／`caches` 的存取（靜態邊界，`boundaries` lint 的寫法）；重新整理後 SHALL 是空的。

> 拔掉什麼會紅：拿掉截斷 → S04 有 101 筆；模組碰 storage／IndexedDB／operations → S05 的靜態邊界；refresh 後有東西 → S05 的列表。

#### Scenario: [FE-R11-S04] 第 101 筆淘汰最舊的

- **WHEN** 依序收到編號 1～101 的合法 chat
- **THEN** 記憶體 SHALL 恰好 100 筆；第一筆是 2、最後一筆是 101
- → 驗於：單元

#### Scenario: [FE-R11-S05] 重新整理後沒有歷史

- **GIVEN** 這一頁已收到數筆 chat（偽造的伺服器送的）
- **WHEN** 重新載入頁面、重新連線，偽造的伺服器還沒送任何新的 `ChatOut`
- **THEN** 列表 SHALL 是空的
- **AND** 靜態邊界：`src/realtime/sceneChat*` 的 import 圖與原始碼 SHALL 不含 `src/api/operations`、`src/api/transport`、`localStorage`、`sessionStorage`、`indexedDB`、`caches`
- **AND** 整段期間的請求清單（`page.on('request')`）SHALL 是既有 allowlist 的子集（`/api/me`、`/api/rooms`、`/api/profiles/*`、Next 的靜態資源、`/ws`）——
  多出任何一條就紅（不靠「跟 chat 有關」的語意判斷）
- → 驗於：單元（靜態邊界）、e2e（隨 `FE-K04` 的 UI 一起跑，K04 的 e2e 正式引用這個 ID；記憶體的可觀察形式是列表）

### Requirement: committed 的場景換了才清空；同場景重連不清；不是目前連線的訊息不收

記憶體 SHALL 綁定 committed 的 `wsScene`：committed 的 `wsScene` **改變**時 SHALL 清空舊訊息；過場尚未成功時 MUST NOT 先清；
**同一個 `wsScene` 的新連線**（過場失敗退回原場景時系統自動建的那條、`FE-R12` 的重連）MUST NOT 清。
每一則 `ChatOut` SHALL 帶著它來自哪一個連線；不是目前連線（`RemoteWorld` 目前持有的那個 client）的訊息 MUST NOT 加進記憶體。

> 拔掉什麼會紅：過場開始就清 → S07；用連線代替場景當清空條件 → S07 退回大廳那條連線 `ready` 時把大廳清了；不看連線身分 → S08 舊大廳的話出現在房間。

#### Scenario: [FE-R11-S06] 換場景成功才清

- **GIVEN** 大廳記憶體有一則訊息
- **WHEN** 進入房間的過場開始、新 socket 還沒 `ready`
- **THEN** 大廳的那則 SHALL 還在
- **AND WHEN** 房間收到 `hello`、成為 committed 場景
- **THEN** 記憶體 SHALL 清空；之後收到的房間 chat SHALL 是唯一內容
- → 驗於：jsdom

#### Scenario: [FE-R11-S07] 過場失敗退回大廳：新的大廳連線 ready 了，訊息還在

- **GIVEN** 大廳記憶體有一則訊息
- **WHEN** 進房的握手被拒、系統自動回大廳、那條新的大廳連線 `ready`（`FE-V01-S07` 的流程）
- **THEN** 那則 SHALL 還在（committed 的 `wsScene` 沒變）
- **AND WHEN** 新的大廳連線收到一則 chat
- **THEN** 記憶體 SHALL 是兩則
- → 驗於：jsdom

#### Scenario: [FE-R11-S08] 舊連線的訊息晚到不進房間

- **GIVEN** 先保存大廳那條連線的 `onMessage` callback 的引用，然後 committed 到房間
- **WHEN** **直接呼叫**保存的舊 callback，餵一則合法的 `ChatOut`（不是透過已關閉的假 socket 發事件）
- **THEN** 房間的記憶體 SHALL 不變
- → 驗於：單元（`FE-V01-S15` 的寫法）

### Requirement: `LIMITS` 如實記錄 chat body 沒有後端限制；前端不發明上限

`src/api/contract/limits.ts` SHALL 有 `chatBody: { min: 0, max: UNBOUNDED }`（後端的事實：空字串也收），`LIMIT_SOURCES` 指向 `app/realtime/protocol.py::ChatIn.body`。
「全空白不送」是 `FE-K04` 的送出規則（trim 後至少一個 code point），MUST NOT 偽裝成後端限制寫進 `LIMITS`。
`ChatIn` schema MUST NOT 套用 Inbox（`messageBody`）的上限；一段超過 2000 code point 的字串與空字串都 SHALL 通過 `ChatIn`。

> 拔掉什麼會紅：`max` 改成 2000 或 `min` 改成 1 → S09；`ChatIn` 加 `.max()`／`.min(1)` → S09 那兩段。

#### Scenario: [FE-R11-S09] chat 無上限不是遺漏，也不是 Inbox 的上限

- **WHEN** 檢查 `LIMITS.chatBody` 與 `LIMIT_SOURCES.chatBody`
- **THEN** `min` SHALL 是 0、`max` SHALL 是 `UNBOUNDED`；來源 SHALL 指向 `protocol.py::ChatIn.body`
- **AND** 2001 個 code point 的 body 與 `""` 都 SHALL 通過 `ChatIn.safeParse`
- → 驗於：單元
