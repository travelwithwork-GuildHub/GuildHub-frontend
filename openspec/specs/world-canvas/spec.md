# world-canvas Specification

## Purpose
World 的 3D 渲染面：`/world` 的 client 邊界裡那個真的在跑 WebGL 的東西。
它負責建立 Canvas 與 renderer、設定燈光與陰影、讓畫布尺寸跟著容器變、
在 3D 內容還沒好時給出可辨識的等待狀態、在這台機器跑不動 WebGL2 時
不要留下白畫面，以及在卸載時把資源還回去。
之後所有 3D 工作（玩家、物理、相機、互動、場景元件）都掛在這個 render loop 上。

## Requirements

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

### Requirement: 3D 內容載入中的呈現

World 區域 SHALL 在 3D 內容尚未可渲染時，顯示一個可辨識的等待狀態，
而不是空白。

該等待狀態 SHALL 是 DOM 元素，不是 3D 物件 —— WebGL 還沒起來的時候
畫不出 3D 的等待畫面。

#### Scenario: [FE-W01-S04] 內容尚未載入完成

- **WHEN** World 的 3D 內容還在載入
- **THEN** 使用者看到可辨識的等待狀態
- **AND** 該等待狀態可以被 DOM 查詢找到

#### Scenario: [FE-W01-S05] 載入完成後等待狀態消失

- **WHEN** 3D 內容變成可渲染
- **THEN** 等待狀態不再出現在畫面上

### Requirement: WebGL2 不可用時不留白畫面

系統 SHALL 在渲染 World 之前判斷這個瀏覽器能不能取得 WebGL2 context。

不能取得時，World 區域 SHALL 顯示可辨識的說明，指出這台裝置或瀏覽器
無法顯示 3D 世界。

該呈現 MUST NOT 提供重試操作 —— WebGL2 不可用不是暫時性失敗，
重試永遠不會成功，而一個永遠不會成功的按鈕比沒有按鈕更糟。

#### Scenario: [FE-W01-S06] 取不到 WebGL2 context

- **WHEN** 瀏覽器無法提供 WebGL2 context
- **THEN** World 區域顯示可辨識的說明
- **AND** 畫面上 MUST NOT 出現重試操作
- **AND** 頁面的其餘部分仍然可用

#### Scenario: [FE-W01-S07] 取得 WebGL2 context

- **WHEN** 瀏覽器可以提供 WebGL2 context
- **THEN** 不顯示上述說明，改為渲染 World

### Requirement: 卸載時釋放資源

World 區域被卸載時，系統 SHALL 釋放它建立的 WebGL 資源，
並移除它掛上的所有全域事件監聽。

卸載之後 MUST NOT 留下任何指向已卸載元件的監聽器 ——
那會讓整棵 3D 樹無法被回收。

#### Scenario: [FE-W01-S08] 卸載後沒有殘留的全域監聽

- **WHEN** World 區域被掛載之後再被卸載
- **THEN** 掛在 `window` 上的事件監聽數量回到掛載之前的水準
- **AND** 掛載期間的監聽數量必須**曾經高於**掛載之前 ——
  少了這一條，驗證是空的：什麼都沒掛起來的話「前後相等」恆真，
  而拿掉清理邏輯它也不會紅
