## MODIFIED Requirements

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
