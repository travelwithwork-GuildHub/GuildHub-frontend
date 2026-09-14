## Applicability

權限：不適用。
併發：適用 —— 舊 socket 的 close 事件與新連線的建立之間有一段等待。
持久資料相容性：不適用。
失敗路徑：適用 —— 舊 socket 的 close 事件 1 秒內沒到。
測試連到什麼：不適用 —— 假 socket，不連任何服務。

## MODIFIED Requirements

### Requirement: 一條連線只屬於一個 scene

系統 SHALL 在建立連線時指定 scene，並把它放進連線位址的查詢參數。
未指定時 SHALL 用 `lobby`。進入受密碼保護的房間時 SHALL 一併帶上 room token。

**協定沒有切換 scene 的訊息。** 換 scene SHALL 是「關掉舊連線、開一條新的」，
MUST NOT 在同一條連線上嘗試切換。

換 scene 時 SHALL 先把舊連線關閉並清理完成，再建立新的。
「清理完成」SHALL 包含**等到舊 socket 的 `close` 事件送達**（上限 **1 秒**；沒等到就建，不永遠等）——
後端 `manager.disconnect()` 在處理舊連線的斷線時只查**同一個 scene** 裡有沒有同一個 `user_id` 的其他連線，
沒有就 `presence.clear(user_id)`；如果新連線已經在另一個 scene `join()` 了，被清掉的是**新的那個人**：
連線開著，但房間裡沒有人看得到他，他的移動也不會被記錄。
舊的 close 事件送達代表伺服器已經處理了 close 幀，這時再建新連線，`disconnect()` 幾乎必然排在 `join()` 之前。

> 這裡原本寫「兩條連線同時存在的話，後端會把它們當成兩個人」—— 那是錯的：後端的 presence 以 `user_id` 為鍵，
> 同一個人的兩條連線是**同一個** `Player` 互相覆蓋（`multi-tab` 那條的實測）。行為要求不變，理由改正。

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

#### Scenario: [FE-V01-S18] 新連線等舊 socket 的 close 事件，最多 1 秒

- **WHEN** 在 `ready` 狀態換 scene，舊的假 socket 在 `close()` 被呼叫後 200 ms 才發 `close` 事件（假時鐘）
- **THEN** 新 socket SHALL 在 200 ms 那一刻之後才建立，199 ms 時 SHALL 還沒有
- **AND WHEN** 舊的假 socket 永遠不發 `close` 事件
- **THEN** 新 socket SHALL 在 1 秒時建立
- **AND** 兩種情況下，舊 socket 的 `close` 事件都 MUST NOT 觸發 `onClosed`（那是自己關的，`close()` 當下已經發過一次）
