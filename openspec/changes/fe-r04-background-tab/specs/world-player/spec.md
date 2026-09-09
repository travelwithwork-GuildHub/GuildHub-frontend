## ADDED Requirements

### Requirement: 失去焦點或分頁隱藏時清掉按鍵狀態

按著方向鍵切到別的分頁時，**`keyup` 不會回到這一頁**。不清掉的話，
`pressed` 集合裡那個鍵會一直在，回到前景時角色**自己一直走**，
而且一直把位置送出去。使用者要再按一次同一個鍵才能停下來。

系統 SHALL 在下列**每一個**事件發生時清空按鍵狀態：

| 事件 | 它涵蓋、而別人涵蓋不到的情況 |
|---|---|
| `blur`（window） | 切到別的應用程式、點到 devtools |
| `visibilitychange` → `hidden` | **切到同一個視窗的別的分頁**、視窗最小化 |
| `pagehide` | 頁面被放進 bfcache、導航離開 |

三個都要，**不是挑一個**：`blur` 在「分頁隱藏但視窗仍有焦點」時不一定觸發，
而 `visibilitychange` 在「整個視窗失去焦點但分頁仍是可見的那一個」時不觸發。

> ⚠️ **這條 Requirement 同時把既有的 `blur` 行為補進規格。**
> 它一直都在程式碼裡，但從來沒有被寫下來 —— 也就是說在此之前，
> 任何人把它刪掉都不會有任何東西變紅。

#### Scenario: [FE-R04-S03] 分頁隱藏時角色停下來

- **WHEN** 角色正按著方向鍵移動
- **AND** `document.visibilityState` 變成 `hidden` 並觸發 `visibilitychange`
- **THEN** 再推進數十幀，角色的位置**完全沒有再改變**
- **AND** 這期間**沒有**收到那個鍵的 `keyup`

#### Scenario: [FE-R04-S04] pagehide 與 blur 也要清

- **WHEN** 角色正按著方向鍵移動，而後發生 `pagehide`
- **THEN** 角色停下來
- **AND WHEN** 換成 `blur`（重新按鍵之後）
- **THEN** 角色也停下來
