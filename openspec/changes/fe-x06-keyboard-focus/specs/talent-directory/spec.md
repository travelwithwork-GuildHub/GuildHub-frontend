## MODIFIED Requirements

### Requirement: 詳情層的鍵盤不驅動世界，Escape 照今天的全域契約

詳情顯示中按下移動鍵，世界裡的角色 SHALL NOT 移動。
詳情顯示中按下 Escape，詳情 SHALL 不再顯示；面板 SHALL 仍然開啟、列表 SHALL 保留離開前的頁碼，
世界的移動輸入 SHALL 維持停用。今天的全域契約是 `FE-X06`「Escape 每次只關最上層」——
這條 Requirement 的名字留著「照今天的全域契約」，因為它確實是照著走的，只是契約換了。

#### Scenario: [FE-B04-S13] 詳情開著按方向鍵，人不動

- **WHEN** 詳情顯示中，使用者按下移動鍵
- **THEN** 世界裡的角色 SHALL NOT 移動

#### Scenario: [FE-B04-S14] 詳情開著按 Escape

- **WHEN** 詳情顯示中，使用者按下 Escape
- **THEN** 詳情 SHALL 不再顯示，面板 SHALL 仍然開啟
- **AND** 世界的移動輸入 SHALL 維持停用

> 原文是「詳情不再顯示，面板 SHALL 關閉，世界的移動輸入 SHALL 恢復作用」—— 那是照當時的
> `FE-B01-S16` 寫的，並明寫「`FE-X06` 改變的那天 `S14` 跟著改」。這就是那一天。ID 不變。
