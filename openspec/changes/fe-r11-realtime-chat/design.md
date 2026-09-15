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

## D4｜清空看 committed 的 `wsScene` 有沒有變；訊息的歸屬看連線

`FE-V01`：`transition = resolved.scene ≠ committed`；握手失敗會回到原場景，**而且系統會自動建一條新的大廳連線**。
過場開始就清 → 失敗回來的人大廳訊息沒了；用「連線換了」當清空條件 → 退回大廳那條新連線 `ready` 時也會把大廳清掉（審查者抓到的）。
所以清空條件只有一個：committed 的 `wsScene` 改變。同場景的重連（退回、`FE-R12`）不清。
訊息的歸屬另外看連線：`RemoteWorld` 每次建 client 時把「這條連線」的身分帶進 `onMessage`，不是目前那條的不收 ——
這是 `world-scenes`「舊連線遲到的任何訊息不得影響新場景」落到 chat 這個消費者，不是新語意。
名詞不混用：`RealtimeGenerationProvider.generation` 是「要求重連」的代數（`FE-R06` 多分頁用），不是場景代號、不是連線身分。
代價：過場覆蓋層底下舊訊息還在 —— 覆蓋層已遮住畫面，而且 `FE-K04` 的 UI 在過場期間本來就鎖著。

## D5｜chat 長度：如實記錄後端「什麼都沒驗」，前端不發明上限、也不在傳輸層擋

`protocol.py` 的 `ChatIn.body: str` 沒有驗證 —— 空字串、全空白、10 MB 都是合法的。`limits.ts` 的慣例是「後端完全沒有上限的欄位記成 `UNBOUNDED`，不是省略」
（`projectTitle`／`projectBody` 同樣處理）。所以 `LIMITS.chatBody = { min: 0, max: UNBOUNDED }`：第一版寫 `min: 1` 是把 UI 的規則偽裝成後端事實，
而且 `min: 1` 也推不出「全空白不送」（一個空格長度就是 1）—— 審查者指出的；「trim 後至少一個 code point」是 `FE-K04` 的送出規則。
**巨大訊息的風險明文接受**：100 筆 × 無上限＝理論上可以撐爆前端記憶體。不在前端擋：擋了就是在掩蓋後端沒有 rate limit／大小上限的缺口（`BE-G16`），
也會讓 `realtime-protocol`「合法訊息一律交付」變假 —— 要擋得先改協定（那是 MODIFIED `realtime-protocol` 的事，不是偷塞進 R11）。`FE-O07` 銜接清單列它。

## 待答問題

- 100 筆在真的旁觀場景夠不夠回看：先用 100；要改是重開 spec PR，不是就地調。
- `send` port 在 `ready` 之前呼叫：沿用 `client.send()` 拋 `RealtimeError` 的語意（明確失敗，不排隊）；UI 怎麼呈現歸 `FE-K04`。
