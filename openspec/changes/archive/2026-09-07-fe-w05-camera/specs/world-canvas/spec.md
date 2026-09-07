## MODIFIED Requirements

### Requirement: World 以 WebGL Canvas 渲染

`/world` 的 World 區域 SHALL 渲染一個 WebGL canvas，取代原本的 DOM 佔位內容。

該 canvas SHALL 填滿它的容器，並在容器尺寸改變時跟著改變。
裝置像素比 SHALL 被限制在 **1 到 2 之間** —— 不設上限的話，
高 DPR 螢幕會用四倍以上的像素去畫同一個畫面。

相機由 `world-camera` 提供。**`FE-W01` 當時設的 perspective 相機是暫時的**，
已被取代 —— `CONTEXT.md` 訂的是固定的 Orthographic Elevated 相機。

#### Scenario: [FE-W01-S01] 進入世界看到 3D 畫面

- **WHEN** 使用者在支援 WebGL2 的瀏覽器開啟 `/world`
- **THEN** 頁面渲染出一個 canvas 元素
- **AND** 該 canvas 的像素尺寸不為零

#### Scenario: [FE-W01-S02] 容器尺寸改變

- **WHEN** 視窗尺寸改變
- **THEN** canvas 的顯示尺寸跟著容器改變
- **AND** 有效裝置像素比 MUST NOT 超過 `2`
