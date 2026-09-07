# app-shell Specification

## Purpose
AppShell 是這個前端唯一的進入點與外殼：它決定使用者從哪個網址進來、
World 這個只能在瀏覽器端執行的區域掛在哪個邊界上、全域 Provider 從哪裡組合，
以及所有 DOM 介面共用的視覺 token（色票、字級間距、堆疊層級）從哪一份定義取得。
它同時把「資料存取只有一條路」這條專案硬規則變成一個會失敗的靜態檢查，
讓後續每一個功能都建立在同一組邊界上，而不是各自發明一套。

## Requirements

### Requirement: 根路徑導向世界

系統 SHALL 在使用者請求根路徑 `/` 時，以 HTTP `307` 暫時轉址導向 `/world`。

系統 MUST NOT 使用 `301` 或 `308` 等永久轉址狀態碼。根路徑之後會改為
其他入口，永久轉址會被瀏覽器快取且使用者無法自行清除，屆時他們會被
持續送往 `/world`。

#### Scenario: [FE-X01-S01] 從根路徑進入

- **WHEN** 使用者請求 `/`
- **THEN** 系統回應狀態碼 `307`，且 `Location` 標頭為 `/world`

#### Scenario: [FE-X01-S02] 不存在的路徑不被吞掉

- **WHEN** 使用者請求一個系統未定義的路徑
- **THEN** 系統回應 `404` 並顯示可辨識的找不到頁面
- **AND** 系統 MUST NOT 將該請求轉址到 `/world`

### Requirement: World 區域的 client 邊界

系統 SHALL 提供 `/world` 路由，回應狀態碼 `200`，並在頁面中渲染一個
**只在瀏覽器端執行**的 World 區域。

該 World 區域 SHALL 是一個可被後續工作項目替換內容的邊界。
其內容由 `world-canvas` 這個 capability 提供。

該邊界 SHALL 在其內容載入失敗時顯示可辨識的錯誤訊息並提供重試操作，
而不是留下空白畫面。

#### Scenario: [FE-X01-S03] 進入世界頁面

- **WHEN** 使用者請求 `/world`
- **THEN** 系統回應 `200`
- **AND** 頁面渲染出全域 Layout 與 World 區域的內容

#### Scenario: [FE-X01-S04] World 區域載入失敗

- **WHEN** World 區域的 client 端內容取得失敗
- **THEN** 邊界顯示可辨識的錯誤訊息，並提供一個重試操作
- **AND** 頁面的其餘部分仍然可用，MUST NOT 整頁空白

### Requirement: 全域 Provider 的單一組合位置

系統 SHALL 提供**唯一一個** Provider 組合位置，所有全域 Provider 日後
都從該處掛載。

該組合位置 SHALL 對其 children 透明：不改變 children 的內容，也不改變
它們的渲染順序。

本 change MUST NOT 在該組合位置掛載任何資料擷取或狀態管理的 Provider。

#### Scenario: [FE-X01-S05] 組合位置對內容透明

- **WHEN** 任意內容被放進 Provider 組合位置
- **THEN** 該內容被完整渲染，且順序與未經組合位置時相同

#### Scenario: [FE-X01-S13] 組合位置不得改變 DOM 結構

- **WHEN** 一段已知的 DOM 結構被放進 Provider 組合位置
- **THEN** 渲染結果的 DOM 結構與未經該組合位置時完全相同
- **AND** 組合位置 MUST NOT 額外包一層元素 —— 多包一層會讓依賴
  父子關係的版面規則靜默失效

### Requirement: DOM design token 的單一事實來源

系統 SHALL 為每一類 DOM design token —— 色票、字級與間距刻度、堆疊層級 ——
各提供**單一事實來源**。同一個 token 的值 MUST NOT 在兩個地方定義。

「每一類各有單一來源」不等於「全部寫在同一個檔案」：不同類的 token 有不同的
失敗模式，取用方式也不同（見 `design.md` 的 D5）。這條要防的是**同一個值
被複製到第二處**，那是它開始漂的那一刻。

堆疊層級 SHALL 定義為 **5 個具名層**，由下而上固定為
`canvas` → `hud` → `panel` → `modal` → `toast`，且相鄰層的數值 SHALL 嚴格遞增。

取用一個未定義的層名時，系統 SHALL 使該次取用失敗，MUST NOT 回傳一個
未定義值 —— 未定義值會被當成 `0` 而讓元件靜默沉到最底層。

#### Scenario: [FE-X01-S06] 堆疊層級順序固定

- **WHEN** 依序取用 `canvas`、`hud`、`panel`、`modal`、`toast` 的堆疊值
- **THEN** 取得 5 個數值，且後一個嚴格大於前一個

#### Scenario: [FE-X01-S07] 未定義的層名

- **WHEN** 一份取用了未定義層名的原始碼被送進型別檢查
- **THEN** 型別檢查以非零狀態結束，並指出該檔案與行
- **AND** 該取用 MUST NOT 回傳未定義值或 `0`

#### Scenario: [FE-X01-S14] 堆疊層級不在樣式層重複定義

- **WHEN** 檢查色票／字級／間距的樣式 token 來源
- **THEN** 其中不包含任何堆疊層級的定義
- **AND** 堆疊層級只存在於型別受限的那一份來源

### Requirement: 資料存取只有一條路

專案的 lint 檢查 SHALL 在 `src/api/**` 與 `src/app/api/**` 以外的任何原始碼檔案
使用 `fetch` 時失敗。

這兩個路徑之內使用 `fetch` SHALL 通過檢查。

#### Scenario: [FE-X01-S08] 元件裡出現資料存取

- **WHEN** `src/api/**` 與 `src/app/api/**` 以外的檔案使用 `fetch`
- **THEN** lint 檢查以非零狀態結束，並指出違規的檔案與行

#### Scenario: [FE-X01-S09] 允許的路徑裡使用資料存取

- **WHEN** `src/api/**` 之下的檔案使用 `fetch`
- **THEN** lint 檢查通過

### Requirement: 工程品質指令可執行且誠實

`lint`、`typecheck`、`test`、`build` 四個指令 SHALL 各自實際執行對應的檢查，
並以檢查結果決定退出狀態碼。

`test` 指令 SHALL 回報實際執行的測試數量；當可執行的測試數為 **0** 時，
該指令 SHALL 以非零狀態結束。零個測試而回報成功等同於沒有驗證。

專案 SHALL 將 Node.js 主版本釘在 **24**，與持續整合環境使用的版本一致。

#### Scenario: [FE-X01-S10] 四個指令都真的跑

- **WHEN** 在一份健康的工作區依序執行 `lint`、`typecheck`、`test`、`build`
- **THEN** 四個指令都以狀態碼 `0` 結束
- **AND** `test` 的輸出包含大於 `0` 的測試數量

#### Scenario: [FE-X01-S11] 型別錯誤不被放過

- **WHEN** 原始碼中存在一個型別錯誤而執行 `typecheck`
- **THEN** 該指令以非零狀態結束，並指出錯誤的檔案與行

#### Scenario: [FE-X01-S12] 沒有測試不算通過

- **WHEN** 可執行的測試數為 `0` 而執行 `test`
- **THEN** 該指令以非零狀態結束
