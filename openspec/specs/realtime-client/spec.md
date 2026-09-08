# realtime-client Specification

## Purpose
與後端即時層之間那條連線的生命週期：建立、握手、狀態、進出 scene、關閉與清理。
它不決定任何訊息的意義 —— 那是 `FE-R02` 之後的事 —— 但它決定**什麼時候我們
知道自己是誰**，而下游每一項都建在那個答案上。

它也決定**客戶端對失敗原因能說什麼、不能說什麼**。這一點特別重要，因為
規劃文件寫的失敗語意（`close 1008`）在客戶端根本觀察不到，照著寫會產生死碼。

## Requirements

### Requirement: 連線狀態機，而且只有 ready 才准送訊息

系統 SHALL 維護一個連線狀態：`idle`、`connecting`、`open`、`ready`、`closed`。

- `connecting`：已經建立 WebSocket，還沒收到 open。
- `open`：WebSocket 的 open 事件已觸發。**只代表傳輸層成功** ——
  握手被後端拒絕時 open 根本不會觸發，所以 open 就是「握手過了」。
- `ready`：已經收到並接受 `hello`，**自己的 id 可用了**。
- `closed`：終態。

系統 MUST NOT 在 `ready` 以外的狀態送出任何訊息。
在其他狀態呼叫送出 SHALL 明確失敗，MUST NOT 靜默丟棄 ——
靜默丟棄會讓「訊息沒送出去」跟「後端把不合法訊息丟掉」（後端的行為）
變成同一個症狀，而那是查不出來的。

`open` 與 `ready` **MUST NOT 合併**：中間那段是「連上了但還不知道自己是誰」，
下游在那段期間動作會拿不到 id。

#### Scenario: [FE-R01-S01] 狀態依序推進，ready 之後才拿得到自己的 id

- **WHEN** 建立連線
- **THEN** 狀態是 `connecting`，且此時取用自己的 id 會得到「還不知道」
- **AND WHEN** 傳輸層連上
- **THEN** 狀態是 `open`，且此時取用自己的 id 仍然是「還不知道」
- **AND WHEN** 收到 `hello`
- **THEN** 狀態是 `ready`，且自己的 id 等於 `hello` 裡的 `you`

#### Scenario: [FE-R01-S02] 還沒 ready 就送訊息會明確失敗

- **WHEN** 在 `connecting` 狀態呼叫送出
- **THEN** 明確失敗
- **AND WHEN** 在 `open` 狀態呼叫送出
- **THEN** 明確失敗
- **AND WHEN** 在 `ready` 狀態呼叫送出
- **THEN** 訊息真的交給了 WebSocket

### Requirement: 監聽器要在任何訊息可能到達之前就掛好

系統 SHALL 在建立 WebSocket 之後、**下一個事件迴圈之前**完成訊息監聽器的安裝。
建立與安裝之間 MUST NOT 有任何非同步步驟。

理由是實測到的時序：握手成功後 **`hello` 與 `snapshot` 相隔不到 1 毫秒**
一起送達。監聽器晚一步掛上去就會漏掉 `hello`，而 `snapshot` **裡面包含自己** ——
少了自己的 id，`FE-R07` 會替使用者建一個自己的遠端分身，
而畫面上那是一個站著不動、跟著你走的第二個角色。

#### Scenario: [FE-R01-S03] hello 與 snapshot 同一批到達時，兩則都收得到

- **WHEN** 連線建立後，`hello` 與 `snapshot` 在同一個事件迴圈裡連續送達
- **THEN** 狀態變成 `ready`，自己的 id 來自那則 `hello`
- **AND** 那則 `snapshot` 有被交出去，沒有被吞掉

### Requirement: 一條連線只屬於一個 scene

系統 SHALL 在建立連線時指定 scene，並把它放進連線位址的查詢參數。
未指定時 SHALL 用 `lobby`。進入受密碼保護的房間時 SHALL 一併帶上 room token。

**協定沒有切換 scene 的訊息。** 換 scene SHALL 是「關掉舊連線、開一條新的」，
MUST NOT 在同一條連線上嘗試切換。

換 scene 時 SHALL 先把舊連線關閉並清理完成，再建立新的 ——
兩條連線同時存在的話，後端會把它們當成**兩個人**，位置會互相覆寫
（那個行為未定義，是 `FE-R06` 的題目）。

#### Scenario: [FE-R01-S04] scene 與 token 進到位址，預設是 lobby

- **WHEN** 不指定 scene 建立連線
- **THEN** 連線位址帶著 `scene=lobby`
- **AND WHEN** 指定 scene 與 room token
- **THEN** 兩者都出現在連線位址的查詢參數裡
- **AND** 位址的其餘部分來自設定模組，MUST NOT 寫死

#### Scenario: [FE-R01-S05] 換 scene 是關掉重開，而且舊的先關乾淨

- **WHEN** 在 `ready` 狀態換到另一個 scene
- **THEN** 舊的 WebSocket 被關閉
- **AND** 新的 WebSocket 帶著新的 scene 建立
- **AND** 舊連線的監聽器已經移除 —— 它之後不得再影響狀態

### Requirement: 關閉只說觀察得到的事實，不說原因

關閉時系統 SHALL 交出 `code`、`reason`、`wasClean`，以及 **`opened`**
（這條連線的 WebSocket open 事件有沒有觸發過）。

系統 MUST NOT 提供失敗原因的分類，也 MUST NOT 讓呼叫端以為分類得出來。

理由是實測：握手被拒時客戶端看到的是 `code=1006`、`reason=""`、`wasClean=false`，
而且**「不合法 scene」「room 沒帶 token」「路徑根本不存在」三種的事件序列
完全一樣**。規劃文件寫的 `close 1008` 是**後端 accept 之前**的動作，
在客戶端表現成握手失敗，**看不到那個碼** —— 照文件寫的
`if (code === 1008)` 是一段永遠不會執行的死碼。

`opened` 是客戶端**真的**分辨得出來的唯一一件事：握手成功過（之後才斷），
還是從來沒成功。

關閉 SHALL 是幂等的：重複關閉不得拋錯，也不得重複發出關閉事件。
關閉後 SHALL 移除所有監聽器。

#### Scenario: [FE-R01-S06] 握手失敗與連線中斷交出的事實不同

- **WHEN** 連線在 open 事件觸發之前就關閉（握手被拒）
- **THEN** 關閉事實裡的 `opened` 是 `false`
- **AND WHEN** 連線在 `ready` 之後才關閉
- **THEN** 關閉事實裡的 `opened` 是 `true`
- **AND** 兩種情況交出的資料 MUST NOT 包含任何原因分類欄位

#### Scenario: [FE-R01-S07] 關閉是幂等的，而且會清乾淨

- **WHEN** 呼叫關閉兩次
- **THEN** 不拋錯，且關閉事件只發出一次
- **AND** 關閉之後，原本那個 WebSocket 再送任何訊息都不會改變狀態

### Requirement: 不做應用層保活

系統 MUST NOT 送出任何應用層的定時訊息來維持連線 ——
不得自訂 ping，也**不得拿 `pos` 當心跳**。

實測依據：靜止 35 秒後 `readyState` 仍是 OPEN，期間收到 **0 則**應用層訊息。
保活由 WebSocket 協定層處理（後端 uvicorn 起在
`--ws-ping-interval 20 --ws-ping-timeout 20`，瀏覽器自動回 pong）。

**協定裡沒有 heartbeat，而且靜止時整則 `pos` 不送 —— 拿它當心跳會在
「沒有人移動」的時候誤判成斷線。**

#### Scenario: [FE-R01-S08] 進入 ready 之後靜止很久，一則訊息都不送

- **WHEN** 進入 `ready` 之後不做任何事，讓時間推進超過 35 秒
- **THEN** 沒有任何訊息被送出
- **AND** 沒有任何為了保活而設的計時器
- **AND** 狀態仍然是 `ready`

> 這條是**否定契約**。有人之後加了一個 heartbeat，它會紅。
> 它證明不了「伺服器那邊的保活真的有效」—— 那需要真的後端，
> 由 `design.md` 的整合驗證負責，**不在 CI 上**。
