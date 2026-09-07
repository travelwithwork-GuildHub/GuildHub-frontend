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
- **VERIFY-BY** `manual-browser`｜PR #37 的 V1 驗證紀錄｜jsdom 沒有 WebGL2，canvas 的實際像素尺寸永遠是 0；測得到的只有「有沒有掛上 canvas 元素」，那不是這條在講的事

#### Scenario: [FE-W01-S02] 容器尺寸改變

- **WHEN** 視窗尺寸改變
- **THEN** canvas 的顯示尺寸跟著容器改變
- **AND** 有效裝置像素比 MUST NOT 超過 `2`
- **VERIFY-BY** `manual-browser`｜PR #37 的 V2 驗證紀錄｜有效 DPR 是 renderer 實際套用的值，jsdom 裡 WebGLRenderer 不會真的設定它

### Requirement: 燈光與陰影

場景 SHALL 設定至少一個會投射陰影的方向性光源，以及一個環境光。

場景 SHALL 包含一個接收陰影的平面與一個投射陰影的物件，
**其唯一目的是讓上述設定可被驗證**。這兩個物件是臨時的，由 `FE-W10` 移除。

#### Scenario: [FE-W01-S03] 陰影出現在畫面上

- **WHEN** 世界渲染完成
- **THEN** 投射陰影的物件在接收陰影的平面上留下可見的陰影
- **VERIFY-BY** `manual-browser`｜PR #37 的 V3 驗證紀錄｜陰影是 GPU 算出來的畫面內容；程式能檢查的只有「有沒有設定陰影參數」，而參數設對了畫面上仍然可能沒有陰影
