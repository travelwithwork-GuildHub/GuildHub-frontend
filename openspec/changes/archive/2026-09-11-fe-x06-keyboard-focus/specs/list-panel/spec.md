## MODIFIED Requirements

### Requirement: Escape 關閉面板，並把世界的輸入還回去

面板開啟且**沒有可關閉的子層**時按 Escape，面板 SHALL 關閉，
且世界的移動輸入 SHALL 恢復作用。有子層（例如詳情）時，Escape 由全域的層級規則處理
（`FE-X06`：每次只關最上層），面板本身 SHALL NOT 在同一次按鍵裡跟著關閉。

面板未開啟時按 Escape，SHALL NOT 產生任何與面板有關的副作用。

⚠️ **這一條寫的是可觀察的結果，不是實作手段。**
「移動輸入恢復作用」SHALL NOT 被寫成「呼叫 `canvas.focus()`」或
「呼叫 `stopPropagation()`」—— 移動監聽掛在哪裡是實作的事，
把手段寫進規格等於把測試鎖死在一種實作上。

#### Scenario: [FE-B01-S16] Escape 關閉面板

- **WHEN** 面板開啟中且沒有子層，使用者按下 Escape
- **THEN** 面板 SHALL 關閉

> 原文的 WHEN 是「面板開啟中，使用者按下 Escape」。`FE-X06` 把 Escape 定成「每次只關最上層」
> 之後，有子層時第一下不關面板 —— 所以 WHEN 收窄成「沒有子層」。ID 不變。

#### Scenario: [FE-B01-S17] 關閉之後，人走得動

- **WHEN** 面板剛被關閉
- **THEN** 移動輸入 SHALL 恢復作用

#### Scenario: [FE-B01-S18] 面板開著的時候，人 SHALL NOT 走動

- **WHEN** 面板開啟中，使用者按下移動鍵
- **THEN** 世界裡的角色 SHALL NOT 移動

> ⚠️ **`S17` 與 `S18` 要成對。** 只有 `S18` 的話，一個「開了面板就永遠鎖住輸入」
> 的實作會全綠 —— 而症狀是「關掉面板之後人走不動了，要用滑鼠點一下畫面」。
