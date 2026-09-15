# `FE-R11` RealtimeChat —— 設計

事實來源：後端 `app/main.py` 的 WS 主迴圈（`chat` → `relay_chat` → `broadcast` 含自己；`ProtocolError` → `continue`）、
`app/realtime/protocol.py`（`ChatIn.body: str` 沒有長度驗證）、本地替身 `scripts/realtime-stub.ts`（同樣廣播含自己）、
前端 `src/world/RemoteWorld.tsx`（唯一持有 `RealtimeClient`；`onMessage` → `validate` → `applyMessage`）、
`src/realtime/client.ts`（`send()` 只在 `ready` 才准，否則拋 `RealtimeError`）、`src/realtime/RealtimeGenerationProvider.tsx`。

## D1｜chat 走 `RemoteWorld` 注入的窄介面，不開第二個 client 入口

`RemoteWorld` 維持唯一能拿到 `RealtimeClient` 值的地方（`realtime-client` 的 import 邊界）。它把驗證成功的 `ChatOut`
交給 chat 的記憶體，並注入一個只收 `ChatIn` 的 `send` port。chat 模組不 import `RealtimeClient` 的值、不解析 raw string、
不知道 socket 的存在。代價：chat 不能獨立連線，測試要注入 transport —— 這正好擋住「UI 繞過 `ready` 與驗證器」。
**系統邊界的決定，要補 ADR**（誰能 import 誰、訊息只能走哪條路）。

## D2｜伺服器回聲是唯一的顯示來源

後端 `broadcast` 明寫「送給自己也一起送」（`broadcaster.py:97`），替身一樣。所以送出不 append；收到自己的 `ChatOut` 照 append、
不因 `id === selfId` 略過。協定沒有訊息 id，做本地回聲就得做去重，而去重做不對的症狀是「自己的話出現兩次」或「別人的話被吃掉」。
代價：網路慢的時候自己的話會晚一拍才出現 —— UI（`FE-K04`）要能讓人知道「送出去了、還沒回來」，但不能假裝已廣播。

## D3｜只留目前 committed 場景的最新 100 筆

100 是產品決定（旁觀「最近在聊什麼」，不是歷史），寫進 Requirement。順序＝通過驗證的接收順序（沒有時間戳、沒有 id，
不發明排序）。淘汰從最舊端。不進任何 storage。

## D4｜清空由 committed 場景驅動，過場開始不先清

`FE-V01`：`transition = resolved.scene ≠ committed`；握手失敗會回到原場景。過場開始就清的話，失敗回來的人大廳訊息沒了。
所以綁 `committed` 與 generation：新場景 committed 時一次清空；每個 `onMessage` 捕捉自己的 generation，過期的不提交。
代價：過場覆蓋層底下舊訊息還在 —— 覆蓋層已遮住畫面，而且 `FE-K04` 的 UI 在過場期間本來就鎖著。

## D5｜chat 長度：記錄後端沒有上限，前端不發明一個

`protocol.py` 的 `ChatIn.body: str` 沒有驗證；`limits.ts` 的慣例是「後端完全沒有上限的欄位記成 `UNBOUNDED`，不是省略」
（`projectTitle`／`projectBody` 同樣處理）。`LIMITS.chatBody = { min: 1, max: UNBOUNDED }`，來源指向 `protocol.py::ChatIn.body`。
`min: 1` 是「全空白不送」的依據（`FE-K04` 用）。要上限先改後端，不在 UI 造一個看似安全的數字（`BE-G16`）。

## 待答問題

- 100 筆在真的旁觀場景夠不夠回看：先用 100；要改是重開 spec PR，不是就地調。
- `send` port 在 `ready` 之前呼叫：沿用 `client.send()` 拋 `RealtimeError` 的語意（明確失敗，不排隊）；UI 怎麼呈現歸 `FE-K04`。
