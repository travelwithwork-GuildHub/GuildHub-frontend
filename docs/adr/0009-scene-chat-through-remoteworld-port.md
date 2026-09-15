# 0009. 場景聊天只走 `RemoteWorld` 注入的窄介面：chat 模組不 import client 的值、不解析 raw frame、不碰驗證器

- **Status**: Accepted
- **Date**: 2026-09-15
- **Deciders**: 實作 `FE-R11` 的那個 session；兩位外部審查（規格 PR）
- **邊界狀態**: 已強制
- **證據**: eslint.config.mjs:265、tests/scene-chat-transport.test.tsx:133、src/realtime/sceneChatStore.ts:45、src/world/RemoteWorld.tsx:162

> `邊界狀態` 與 `證據` 兩欄由 `bash .github/scripts/arch-view.sh` 讀。
> 三種狀態的意思見 `docs/adr/README.md`。

## 背景

WebSocket 契約早就有 `chat`（`ChatIn`／`ChatOut`），後端照 scene 廣播（含自己）。前端唯一持有 `RealtimeClient` 的地方是
`RemoteWorld`（ADR 0006：即時訊息只有一條路 —— `RemoteWorld` → `realtime-protocol` 驗證 → 下游）。驗證成功的 `chat` 之前沒有人接。
`FE-K04` 要做聊天 UI；沒有這一層，UI 最直接的寫法是自己拿 client、自己 parse raw frame、自己做本地回聲 —— 三件事各破一條既有邊界。

## 選項

### A. chat 模組自己開一條連線（或直接 import `RealtimeClient`）
- 好：獨立、好測。
- 壞：第二個 client 入口（ADR 0006 擋的就是它）；兩條連線在後端是兩個人；驗證器要再養一份。

### B. chat 只走 `RemoteWorld` 注入的窄介面（port）
- 好：連線、驗證、`ready` 語意都只有一份；chat 模組不知道 socket 存在，測試注入 transport 即可；
  「不是目前連線的訊息不收」靠 port 的 attach／detach 就有（連線身分綁在 `receive` 的閉包裡）。
- 壞：chat 不能獨立連線；`RemoteWorld` 多一個 prop（它在 `<Canvas>` 裡，context 不跨 R3F 邊界 —— 跟 `av`／`generation` 同一個理由）。

## 決定

選 B。`src/realtime/sceneChat*`：
- **只收** `realtime-protocol` 驗證產出的 `ChatOut` 物件（`link.receive(message: ChatOut)`；型別層不收字串，fixture 有負向對照）；
- **不** import `RealtimeClient` 的值（型別可以）、不 import 驗證器、不 `JSON.parse`；
- 送出只透過 `RemoteWorld` 注入的 `sendRaw`（底下是 `client.send()`：沒 `ready` 拋 `RealtimeError`），這裡不 catch、不排隊、不補送、不 append。

## 邊界

- `src/**` 對 `realtime/client` 的值 import 由 `no-restricted-imports`（`CLIENT_IMPORT_PATTERNS`，`allowTypeImports`）擋；`RemoteWorld.tsx` 是唯一例外區塊。
- `sceneChat*` 的 import 圖與原始碼：`tests/scene-chat-transport.test.tsx` 的 `[FE-R11-S01] 靜態邊界` 走遞迴 import 圖，
  值 import client、`createMessageValidator`、`JSON.parse` 任一出現就紅；`tests/scene-chat-memory.test.ts` 的 `[FE-R11-S05]` 擋 REST／storage。
- 型別：`tests/type-fixtures/scene-chat-{sink,link}-string.ts` 各恰好一則 TS2345。
- 分流只在 `RemoteWorld` 的 `onMessage`（`t === 'chat'` 才交、交的是同一個物件）；`[FE-R11-S01]` 的 sink spy 用 `toBe` 守同一性。

突變紀錄（2026-09-15）：送出時 append → S03 紅；`id === selfId` 略過 → S03 紅；`status` 也餵 sink → S01 紅；sink 裡 trim → S10 紅；
驗證失敗也餵 → S10 紅；送出 catch 後 setTimeout 補送 → S02 兩條紅；交複本不交原物件 → S01 紅。

## 代價

- 網路慢時自己的話晚一拍才出現（回聲是唯一來源，design D2）—— `FE-K04` 要能表達「送出去了、還沒回來」。
- 沒有連線時 `send` 拋的是一般 `Error`（不是 `RealtimeError`：那個類別在 `client.ts`，這裡不 import 它的值）；UI 只需要知道「沒送出去」。

## 什麼情況下要重新考慮

- 需要離線佇列或斷線補送（`FE-R12`）—— 那時「不排隊」要重談，而且要談的是 client 層不是 chat 層。
- 出現第二種即時訊息消費者（例如 seat 事件）—— 若三個以上都要「連線專屬 receive」，把 attach／detach 抽成 `RemoteWorld` 的通用 port。
