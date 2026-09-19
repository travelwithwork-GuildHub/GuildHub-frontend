# 0013. 重連迴圈住在 `RemoteWorld` 之上、不在 `RealtimeClient` 裡：一條連線仍然只活一次，退避排程是沒有 React、沒有 client 的純模組

- **Status**: Proposed
- **Date**: 2026-09-20
- **Deciders**: 寫 `fe-r12-reconnect` 規格的那個 session；兩位外部審查（規格草稿）
- **邊界狀態**: 僅約定
- **證據**: openspec/changes/fe-r12-reconnect/design.md、src/realtime/client.ts:158、src/world/RemoteWorld.tsx:184

> `邊界狀態` 與 `證據` 兩欄由 `bash .github/scripts/arch-view.sh` 讀。
> 三種狀態的意思見 `docs/adr/README.md`。實作合併後改成 `已強制`，證據換成 `tests/remote-world-reconnect.test.tsx` 與 `tests/reconnect-schedule.test.ts` 的行。

## 背景

`RealtimeClient` 的契約是「一條連線只活一次」：`connect()` 只准從 `idle`，換 scene 是 `closeAndEnter()`（關掉再建）。
下游有兩處靠 **client 物件的身分**當 session generation：`PositionSync` 比對 `clientRef.current` 換了就重置節流、
`scene-chat-transport` 每一則帶著它來自哪一條連線。`ready` 之後意外斷線今天沒有人管（`SceneProvider` 只在過場期間看 `closed`）。
`FE-R12` 要補自動重連；問題是這個迴圈住在哪一層。

## 選項

### A. `RealtimeClient` 自己重連（`close` 之後排一次 `connect()`）
- 好：呼叫端不用改；一個地方管全部。
- 壞：破壞「一條連線一次」的契約 —— 同一個 client 物件先後代表兩條連線，`PositionSync` 的重置與聊天的「哪一條連線」都失效，要另外發明 generation 欄位；
  client 也不知道「這個場景還是不是目前的」（過場、分頁資格），只能靠上層再加旗標；`FE-R01-S08`「沒有任何為了保活而設的計時器」在 client 裡變得難以分辨。

### B. `RemoteWorld` 的 effect 在 `onClosed` 時建一個**新的** client；退避與排程抽成 `src/realtime/reconnect.ts`（純函式＋可注入計時器／亂數）
- 好：client 契約不變；每次重連換物件 → 下游的 session generation 免費成立；迴圈跟 effect 生死 → 卸載、換場景、`generation`、分頁資格四件事都靠既有的 cleanup；
  退避是純函式，區間、歸零、單一排程都能不掛 React 直接測。
- 壞：`RemoteWorld` 的 effect 多一層 `open()` 包裝（本來就 100 行）；舊 client 的事件要靜音（`#handleClose` 今天不拆 listener，要補）；
  「這個 effect 還是不是權威」要從 `SceneProvider` 借一個謂詞（`canReconnect`），因為 effect 自己看不到過場。

### C. 在 `SceneProvider` 裡做（把 `ready` 之後的 `closed` 當成一次「自己回自己」的過場）
- 好：通知、過場逾時、回大廳的機制都在那裡。
- 壞：過場的語意是「換 committed 場景」，同場景重連會逼 committed 短暫變成別的東西（聊天記憶體會被清、覆蓋層會蓋上）；
  退避變成過場的一部分，`transitionSeq` 的代號比對要再背一層；跟 `world-scenes` 的 Requirement 互相打架。

## 決定

選 **B**。

**理由**：契約不動、下游的 generation 免費、生命週期借既有的 cleanup。A 要重新定義 client 是什麼；C 要重新定義過場是什麼。B 只多一層包裝，
而它的代價（舊事件靜音、權威謂詞）兩位外部審查都獨立指出，已寫進規格的 S05／S10 當判準。

## 代價

- `RemoteWorld` 的 effect 再長一段；diff 上界不夠就先 `chore/` 把接線抽成 hook。
- `client.ts` 要補一件本來就該做的事：意外 `close` 後拆 listener。
- `RemoteWorld` 多一個 prop（`canReconnect`）—— 在 `<Canvas>` 裡，context 進不來，只能 prop。

## 什麼情況下要重新考慮

- 後端有了 session 續接（resume token、重連不重建 `Player`）：那時「重連」不再等於「新連線」，client 內部續接才說得通。
- 需要離線期間的訊息佇列：那時迴圈要知道訊息語意，就不該只住在 `RemoteWorld`。
