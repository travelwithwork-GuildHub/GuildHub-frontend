## Applicability

權限：不適用 —— 本 change 不做授權判斷
併發：不適用 —— 設定在建置時固定，執行期不變
持久資料相容性：不適用 —— 不讀寫持久資料
失敗路徑：適用 —— 缺設定、設定值無法辨識、刻意沒有即時後端、連線失敗

## ADDED Requirements

### Requirement: 即時層的資料來源是一個明確的選擇

系統 SHALL 提供一個環境變數來宣告即時層連到哪裡，值 SHALL 是
`guildhub`（連 WebSocket 位址指定的後端）或 `none`（這個部署沒有即時後端）。
缺席時 SHALL 視為 `guildhub`。無法辨識的值 SHALL 拋出錯誤，
且 **MUST NOT 退回任何預設值** —— 打錯字的部署要紅，不是安靜地換一個資料來源。

`none` SHALL 是**唯一**能讓部署合法地沒有 WebSocket 位址的方式。
系統 **MUST NOT 把「WebSocket 位址缺席」本身當成「沒有即時後端」** ——
那會讓一個忘了設位址的正式部署安靜地變成單人模式，
而症狀是「怎麼都看不到別人」，不是「設定漏了」。

值是 `none` 時，系統 SHALL 忽略 WebSocket 位址，**不論它有沒有被設定**。
**MUST NOT 要求那個變數不存在** —— 部署平台的環境變數會被 preview 繼承，
逼人去刪一個被忽略的值只會增加部署摩擦，而摩擦會讓人改用假值繞過。

#### Scenario: [FE-O14-S01] 三種值各自的結果

- **WHEN** 沒有設定即時層資料來源並讀取設定
- **THEN** 得到 `guildhub`
- **AND WHEN** 明確設成 `none`
- **THEN** 得到 `none`
- **AND WHEN** 設成一個未列舉的值（例如 `nome`）
- **THEN** 拋出錯誤，訊息指出那個值無法辨識
- **AND** MUST NOT 回傳 `guildhub` 或 `none`

#### Scenario: [FE-O14-S02] `none` 時殘留的 WebSocket 位址被忽略而不是被拒絕

- **WHEN** 即時層資料來源為 `none`、同時設定了一個合法的 WebSocket 位址
- **THEN** 讀取設定不拋錯
- **AND** 系統不使用那個位址建立任何連線
- **AND WHEN** 即時層資料來源為 `none`、設定了一個**協定錯誤**的 WebSocket 位址
  （例如 `http://`）
- **THEN** 讀取設定同樣不拋錯 —— 一個不會被讀取的值，它的格式不構成部署錯誤
