## Why

世界連線今天**斷了就停在那裡**：`RealtimeClient` 一條連線只活一次（`FE-R01`：`close` 之後不再連），
`RemoteWorld` 收到 `closed` 事件只在過場期間才處理（`FE-V01`：進不去就回大廳）—— **進入 `ready` 之後的斷線沒有任何一行程式碼在管**。
結果是：名單留著（別人的角色定在原地，成了鬼影）、在線人數停在舊值、位置不再送出、狀態文字與聊天送出時拋錯或回 offline，
而使用者看到的是一個「還在動、但沒有人回應」的世界，**沒有任何提示**。要恢復只能重新整理。

不做會怎樣：**後端每次重新部署 WS 全斷**（`docs/WBS.md` `FE-R12` 那一列的警告；`FE-O08` 量到 SIGTERM 時關閉碼 `1012`），
demo 期間也可能發生 —— 那一刻兩個瀏覽器互見的畫面全部凍住，只能請大家重新整理。手機切換網路、筆電闔上再打開也是同一種斷法。

後端事實（`app/main.py`、`app/realtime/manager.py`、`presence.py`）：**沒有 resume**——每一條新連線就是一次新的 `join`、新的 `Player`
（狀態文字清空、位置回出生點），`snapshot` 是整份重建；presence 以 `user_id` 為鍵，舊連線的 `disconnect()` 只查同 scene 的兄弟連線。
所以「重連」在協定上就是「再連一次、再握手一次、拿一份新的 snapshot」——沒有 session 可以續，也不需要。

## What Changes

- 新 capability **`connection-recovery`**：
  - **進入 `ready` 之後意外斷線 SHALL 自動重連**（不論關閉碼：`1012`、`1006`、`1001`⋯⋯客戶端分不出原因，`realtime-client` 那條量過）：
    同一個 scene、同一張票，**單一重連迴圈**，等待時間**指數退避＋full jitter**（基數 1 秒、上限 30 秒；成功後歸零）；沒有次數上限（demo 期間後端重啟 30～60 秒，迴圈以 ≤30 秒的間隔敲到它回來為止）。
  - **斷線當下先清鬼影**：名單清空、人數變成「未知」（不是 0）、遠端動態容器清空 —— 新 snapshot 到了才重建；舊 socket 遲到的事件不影響新連線。
  - **重連之後的重新握手**走既有的每條連線一次的路：`hello` → `ready` → 狀態文字重送（`FE-K05-S04` 已定）、聊天記憶體不清（`FE-R11-S06`）、位置同步重置後立刻再送一次（`FE-R03` 的 session generation）。
  - **使用者看得到**：斷線到重新 `ready` 之間 DOM 上有一則 `role="status"` 的通知（「連線中斷，正在重新連線」這一類），重新 `ready` 就消失；期間送狀態文字得到既有的 offline 回饋（`FE-K05-S03`）。
  - **會停的條件**：卸載、換場景、失去分頁資格（`FE-R06`）—— 等待中的重連 SHALL 取消；含 React Strict Mode 的雙重 effect。
  - **不搶過場的活**：從來沒有 `ready` 過的連線失敗（第一次進場、過場中握手被拒、open 了沒收到 hello）**不歸這條管** —— 那是 `world-scenes` 的過場失敗（回大廳、通知），兩套機制不可以同時對同一次失敗動手；過場進行中原場景斷線也不對原場景重連（任何時刻至多一條連線）。
  - 真瀏覽器：A、B 在大廳互見；伺服器關掉 A 的 socket → A 看到通知、B 的牌子從 A 的畫面消失；A 自動重連 → 通知消失、B 的牌子回來、A 的狀態文字在 B 那邊仍看得到。
- **不改契約**：協定沒有任何新訊息；`realtime-client` 的「一條連線只活一次」「沒有 heartbeat」（`FE-R01-S08`）都不動 —— 重連是**上一層**建新的 client，不是讓 client 自己復活。
  `client.ts` 只補一件今天就該做的事：意外 close 之後把 listener 拆掉（舊 socket 遲到的事件不再打進來）—— 不是新義務，是 `world-scenes`「遲到的事件不影響新場景」在這條路上的落實。

## Non-goals

- **不做 session 續接**（後端沒有；每次重連就是新的 `join`）：位置回出生點再由位置同步拉回、狀態文字靠重送。別人會短暫看到這個人離開再進來 —— 跟 `FE-A05-S05` 換外觀重連的代價同一種，接受。
- **不做心跳／不主動偵測「連線還在但沒回應」**：協定沒有 heartbeat（`FE-R01-S08` 明文禁止保活計時器）；只處理瀏覽器真的發出 `close` 事件的斷線。
- **第一次就連不上**（打開 `/world` 時後端不在）不在這裡重試 —— 那條路今天怎麼呈現就怎麼呈現；理由見上面「不搶過場的活」與 design D3。
- 不做「離線模式」、不緩存斷線期間想送的訊息（狀態文字有 pending 機制、聊天送出時 offline 就是 offline）。
- 不改在線人數元件（`src/world/OnlineCount.tsx` 是別人負責的；它已接受 `null`）。
- 不把協定違規（`FE-R02`）做成使用者看得到的呈現 —— 那是 `RemoteWorld` 註解裡掛在 `FE-R12` 名下的舊債，demo 範圍外，留 console。
- 不做退避的使用者設定、不做「立刻重試」按鈕（design 待答：demo 排演時若 30 秒上限太長再談）。

## Capabilities

### New Capabilities
- `connection-recovery`：`ready` 之後的意外斷線 → 清鬼影、通知、單一退避迴圈重連、重新握手後恢復；會停的條件；跟過場失敗的分工；真瀏覽器互見的恢復。

### Modified Capabilities
- （無）—— `realtime-client`（一條連線一次、沒 heartbeat）、`remote-players`（snapshot 整份重建）、`world-scenes`（過場失敗）、`player-status`（每條連線重送）、`scene-chat-transport`（同場景重連不清）的既有 Requirement 都不變；這條建在它們上面。
