## Applicability

權限：不適用 —— 身分走 session cookie，這一層只負責把它帶上；
授權判斷在後端，錯誤的處置在 `FE-X03`
併發：不適用 —— 每個操作是獨立的一次請求，這一層不做去重也不做快取
持久資料相容性：**適用** —— 後端**新增**欄位不得讓前端掛掉；
後端**移除或改型別**必須在 API 邊界立刻被看見
失敗路徑：**適用** —— 設定值無法辨識、adapter 尚未實作、
送出去的東西不合契約、回來的東西不合契約、HTTP 錯誤

測試會連到什麼：**測試自己在 `127.0.0.1` 起一個微型 HTTP server**，
當次建立當次銷毀，只服務這一組測試。**MUST NOT 連任何團隊共用位址**，
也 MUST NOT 依賴開發者自己起的那份後端 —— CI 上沒有任何服務可用。

## ADDED Requirements

### Requirement: 元件不知道自己連的是誰

資料存取 SHALL 走 domain operations；呼叫端 MUST NOT 知道背後是哪一個 adapter。

adapter 由 `NEXT_PUBLIC_DATA_ADAPTER` 決定，值是 `guildhub`（真後端）
或 `internal`（我們自己的 Route Handlers）。

> ⚠️ **刻意不叫 `local`。** `NEXT_PUBLIC_APP_ENV` 已經有一個 `local`，
> 意思是「跑在開發者的機器上，連 localhost:8000 的**真後端**」——
> 跟 adapter 的 `local`（連我們自己的後端）是**相反的資料來源**。

**設定值無法辨識時 MUST 明顯失敗，MUST NOT 退回任何預設值。**
退回去的話，一個打錯字的正式站會安靜地連到錯的資料來源。

#### Scenario: [FE-O02-S01] 設定選 guildhub 時，請求打到後端的位址

- **WHEN** `NEXT_PUBLIC_DATA_ADAPTER` 是 `guildhub`
- **AND** 呼叫任何一個 domain operation
- **THEN** 請求送到 `restBase()` 給的位址
- **AND** 送出的請求 MUST 以 `credentials: 'include'` 建構

> ⚠️ **這一條刻意不寫成「請求帶上 session cookie」。** 那件事在
> 單元測試的環境裡**驗不了**：實測 `document.cookie` 設得進去，
> 但 `fetch(url, { credentials: 'include' })` 之後測試 server 收到的
> `req.headers.cookie` 是 `null` —— jsdom 的 cookie jar 跟 Node 的 fetch
> 沒有連通。
>
> 驗得到的是 `Request` 物件上的 `credentials`，而它的**預設值是
> `same-origin` 不是 `include`** —— 所以「有沒有寫那一行」是量得出來的。
>
> **端到端的 cookie 只有瀏覽器驗得到**（`FE-O08` 切換演練，W5）。

#### Scenario: [FE-O02-S02] 設定選 internal 時，每個操作明顯失敗

- **WHEN** `NEXT_PUBLIC_DATA_ADAPTER` 是 `internal`
- **AND** 呼叫任何一個 domain operation
- **THEN** 它 MUST 拋錯，而且**不得送出任何網路請求**
- **AND** 錯誤訊息 MUST 指出是哪一個操作、哪一個 adapter，以及哪一個工作項目會補上它

> `internal` 的後端是 `FE-O03`（W2）。**這個選項今天就要存在** ——
> 沒有第二條路的話，切換邏輯是一段永遠只走一邊的程式碼。

#### Scenario: [FE-O02-S03] 設定值無法辨識時，明顯失敗

- **WHEN** `NEXT_PUBLIC_DATA_ADAPTER` 的值不是 `guildhub` 也不是 `internal`
- **THEN** MUST 拋錯並列出合法的值
- **AND** MUST NOT 退回任何一個 adapter

### Requirement: 送出去之前先對照契約

domain operation 的輸入 SHALL 在送出之前用 `src/api/contract/` 的 schema 驗。

**不合契約的東西不得送出去。** 後端對不合協定的請求的行為是
「422 帶結構化 detail」或者更糟的 500（`rest.ts` 記著 `POST /api/login`
超長暱稱會是資料庫錯誤）—— 在送出之前失敗，錯誤才指得到呼叫點。

#### Scenario: [FE-O02-S04] 輸入不合契約時，在送出之前就失敗

- **WHEN** 呼叫端給的輸入不符合該操作的契約（例如超過長度上限）
- **THEN** 操作 MUST 拋錯
- **AND** **MUST NOT 送出任何網路請求**

### Requirement: 回來的東西在 API 邊界驗，漂掉就在邊界炸

回應 SHALL 用該操作的契約 schema 解析。

**未知的欄位要通過。** 後端新增欄位是相容的變更，讓它掛掉的話，
後端每加一個欄位就得等前端跟上。

**缺少必填欄位或型別漂掉要立刻失敗。** 讓它流下去的話，症狀會是深層元件裡的
`undefined is not an object`，而那跟真正的原因隔了很遠。

#### Scenario: [FE-O02-S05] 回應少一個必填欄位時，在邊界失敗

- **WHEN** 後端的回應缺少契約要求的欄位
- **THEN** 操作 MUST 拋出一個可辨識的契約漂移錯誤
- **AND** 錯誤訊息 MUST 指出是哪一個操作、哪一個欄位

#### Scenario: [FE-O02-S06] 回應多一個未知欄位時，照常通過

- **WHEN** 後端的回應多了契約沒有描述的欄位
- **THEN** 操作 MUST 正常回傳
- **AND** 回傳值裡 MUST NOT 包含那個未知欄位

> 兩條合起來才是完整的。只驗前者的話，一個「什麼都接受」的實作也會通過；
> 只驗後者的話，一個「什麼都不驗」的實作也會通過。

#### Scenario: [FE-O02-S07] HTTP 錯誤 MUST NOT 被當成成功

- **WHEN** 後端回 4xx 或 5xx
- **THEN** 操作 MUST 拋錯
- **AND** 錯誤 MUST 帶著 HTTP status
- **AND** 回應的 body 若符合錯誤 envelope，其內容 MUST 保留在錯誤上

> 這裡**不**決定「401 要導向登入」之類的處置 —— 那是 `FE-X03` 的語彙（W2）。
> 這一條只保證失敗不會被當成成功。

### Requirement: 位址與憑證只有一個來源

domain operation MUST NOT 自己組後端位址，也 MUST NOT 自己決定憑證模式。
兩者都從 `src/config/env.ts` 來。

`env.ts` 是整個 `src/` 底下唯一准許讀 `process.env` 的檔案，
而它對「部署出去卻沒設位址」的處置是拋錯而不是退回 `localhost`。
在操作裡寫死位址會繞過那道防線。

#### Scenario: [FE-O02-S08] 操作裡不得出現寫死的後端位址

- **WHEN** 檢查 `src/api/` 底下的操作與 adapter
- **THEN** 除了 `src/config/env.ts` 之外，MUST NOT 出現任何 `http://` 或 `ws://` 開頭的後端位址字面值

### Requirement: 後端沒有的 domain 不得出現在這一層

Role／Application／Invitation／Offer 四個 domain 後端今天沒有（`BE-G10`），
契約層 `rest.ts` 也刻意不涵蓋它們。

這一層 MUST NOT 為它們定義操作。**憑空想的介面等到後端真的開出來
幾乎一定不合**，而那時候要先改介面才能接 —— 比留白貴。

#### Scenario: [FE-O02-S09] 有人替沒有契約的 domain 加操作時，檢查失敗

- **WHEN** `src/api/` 底下出現 Role／Application／Invitation／Offer 的操作
- **AND** 契約層仍然沒有對應的 schema
- **THEN** 檢查 MUST 失敗
- **AND** 失敗訊息 MUST 指出那個 domain 卡在哪一個後端缺口

#### Scenario: [FE-O02-S10] 後端補上契約之後，這條檢查要跟著放行

- **WHEN** 契約層加入了某個 domain 的 schema
- **THEN** 這條檢查 MUST NOT 再擋它

> 兩個方向都要顧。只擋不放的話，後端補上之後這條規則會變成純粹的阻礙，
> 而下一個人的選擇是把它整條刪掉。
