## ADDED Requirements

### Requirement: 分頁隱藏時不主動關閉連線

分頁切到背景、失去焦點、或被放進 bfcache 時，系統 MUST NOT 主動關閉連線，
也 MUST NOT 因此建立新的連線。

理由是**身分**：匿名連線的身分是每條連線一個新的 `uuid4`
（後端 `_identify()`：沒有 session 就 `str(uuid.uuid4())`）。
斷線重連等於**換成另一個人** —— 別人會看到你離開又進來，
而你的名單、狀態文字、房間位置全部重來。

這一條與「不做應用層保活」（`FE-R01-S08`）方向一致：
這一層**不主動製造連線事件**。連線真的因為作業系統凍結、
或伺服器的 ping/pong 逾時而斷掉時，走既有的關閉語意，
由上層決定要不要重連 —— 但那是**被動的**，不是我們發起的。

#### Scenario: [FE-R04-S01] 生命週期事件不得關閉連線，也不得換身分

- **WHEN** 連線已經 `ready`，而且 `hello` 已經給了一個 `selfId`
- **AND** 依序發生 `blur`、`visibilitychange`（`hidden`）、`pagehide`
- **THEN** 連線狀態仍然是 `ready`
- **AND** socket 的 `close` **一次都沒有被呼叫**
- **AND** `selfId` 沒有改變 —— **這一條是重點**：斷線重連的真正代價是換身分，
  只斷言「沒有呼叫 close」的話，一個「關掉再立刻開一條」的實作照樣是綠的
