## Applicability

權限：**不適用** —— 這一列只翻譯「權限不足」這件事，不做任何授權判斷
併發：**不適用** —— 純函式，沒有任何共享狀態
持久資料相容性：**不適用** —— 不讀寫持久資料
失敗路徑：**適用，而且整份就是失敗路徑** —— 輸入本身就是失敗；這裡要問的是「翻譯自己會不會失敗」

測試連到什麼：**不適用 —— 測試不連任何外部服務。**
輸入是直接建構的錯誤物件（`HttpError`、`ContractDriftError`、`TypeError`⋯⋯），
不需要任何 server。

## ADDED Requirements

### Requirement: 每一個失敗都有一個封閉種類，而且翻譯永遠不拋

系統 SHALL 提供一個純函式，把資料層丟出的**任何**值翻譯成一個 `UiError`；
`UiError.kind` SHALL 是一個封閉的聯集，每一個輸入 SHALL 恰好落在其中一種。

翻譯 SHALL NOT 拋出例外 —— 包括輸入不是 `Error`、是 `null`、
是一個不認得的物件的情況。認不得的一律 SHALL 落在「預期之外」那一種。

⚠️ **這一條的反面是「錯誤處理自己出錯」**：一個在 catch 裡拋錯的翻譯器，
會把「拿不到清單」升級成「整個面板炸掉」，而使用者看到的是白畫面。

#### Scenario: [FE-X03-S01] 401 是「要登入」

- **WHEN** 輸入是 status 401 的 `HttpError`
- **THEN** `kind` SHALL 是「要登入」那一種

#### Scenario: [FE-X03-S02] 403 是「沒有權限」，跟 401 不是同一種

- **WHEN** 輸入是 status 403 的 `HttpError`
- **THEN** `kind` SHALL 是「沒有權限」那一種
- **AND** 它 SHALL 與 401 的種類不同，`message` 也 SHALL 不同

> ⚠️ **`S01` 與 `S02` 要成對。** 只有 `S01` 的話，「所有 4xx 都算要登入」全綠 ——
> 而登入了也沒用的人會被一直叫去登入。

#### Scenario: [FE-X03-S03] 404 是「找不到」

- **WHEN** 輸入是 status 404 的 `HttpError`
- **THEN** `kind` SHALL 是「找不到」那一種

#### Scenario: [FE-X03-S04] 409 是「衝突」

- **WHEN** 輸入是 status 409 的 `HttpError`
- **THEN** `kind` SHALL 是「衝突」那一種

#### Scenario: [FE-X03-S05] 422 與 400 是「輸入不合要求」

- **WHEN** 輸入是 status 422 或 400 的 `HttpError`
- **THEN** `kind` SHALL 是「輸入不合要求」那一種

#### Scenario: [FE-X03-S06] 5xx 是「伺服器出了問題」，不分原因

- **WHEN** 輸入依序是 status 500 到 599 每一個值的 `HttpError`，`detail` 是 `null`
- **THEN** 每一個的 `kind` SHALL 都是「伺服器出了問題」那一種

> 資料庫錯誤實測是 `500 text/plain`，到這一層時 `detail` 已經是 `null` ——
> 跟任何其他沒有 body 的 500 分不開。這裡刻意**不**編一種「資料庫錯誤」。

#### Scenario: [FE-X03-S07] 其他 4xx 是「請求沒有被接受」

- **WHEN** 輸入依序是 status 400 到 499 之中、**扣掉** 400／401／403／404／409／422 的每一個值的 `HttpError`
- **THEN** 每一個的 `kind` SHALL 都是「請求沒有被接受」那一種

> 只測 418 與 429 的話，一個把那兩個數字寫死、其餘全落到「預期之外」的實作照樣綠。

#### Scenario: [FE-X03-S08] 連線層的失敗是「連不上」

- **WHEN** 輸入是 `fetch` 在拿到回應之前的 rejection（一個 `TypeError`）
- **THEN** `kind` SHALL 是「連不上」那一種

#### Scenario: [FE-X03-S09] 契約漂移是「收到的資料不對」

- **WHEN** 輸入是 `ContractDriftError`
- **THEN** `kind` SHALL 是「收到的資料不對」那一種

#### Scenario: [FE-X03-S17] 被中止的請求是「已取消」，不是錯誤

- **WHEN** 輸入是 `name` 為 `AbortError` 的 `DOMException`
- **THEN** `kind` SHALL 是「已取消」那一種

> 中止是呼叫端自己做的事（換頁、卸載）。落到「預期之外」的話，
> 每一次正常的取消都會在畫面上變成一個錯誤。

#### Scenario: [FE-X03-S10] 認不得的東西不會讓翻譯器拋錯

- **WHEN** 輸入依序是 `null`、`undefined`、一個數字、一個純字串、
  一個長得像 `{ status: 401 }` 的純物件、一個沒有 `status` 的 `Error`、
  `AdapterNotImplementedError`、以及一個**每個屬性的 getter 都會拋錯**的物件
- **THEN** 每一次翻譯 SHALL 正常回傳
- **AND** `kind` SHALL 是「預期之外」那一種

> 純物件 `{ status: 401 }` **不是** 401：形狀像不代表是 `HttpError`。
> 依鴨子型別分類的話，任何帶 `status` 的東西都會被說成 HTTP 錯誤。

### Requirement: 使用者看到的那一句話來自唯一一份語彙表，而且是安全的

`UiError.message` SHALL 來自語彙表；語彙表 SHALL 對**每一種** `kind` 都有一句話，
SHALL NOT 多也 SHALL NOT 少。

後端非 JSON 回應的 body、後端的內部錯誤訊息、契約驗證的 issue 內容、
以及原始例外的 `message`，SHALL NOT 出現在 `UiError.message` 裡。

⚠️ **這一條守的不是「訊息好看」，是「不把後端的內臟給使用者看」。**
`Internal Server Error`、Zod 的 `Expected string, received number`、
`fetch failed` —— 這些出現在畫面上的那一天，使用者會拿它去搜尋，而不會去做對的事。

#### Scenario: [FE-X03-S11] 語彙表不多不少

- **WHEN** 列出語彙表的鍵
- **THEN** 它們 SHALL 恰好等於 `kind` 聯集的所有成員

#### Scenario: [FE-X03-S12] 帶哨兵的內臟不會漏進 `message`

- **WHEN** 輸入是一個 `message` 含哨兵字串的 `Error`、
  一個 issue 含哨兵字串的 `ContractDriftError`、
  以及一個 `detail` 含哨兵字串的 status 500 `HttpError`
- **THEN** 三個翻譯結果的 `message` SHALL 都不含那個哨兵字串

#### Scenario: [FE-X03-S13] 每一種的 `message` 互不相同

- **WHEN** 對每一種 `kind` 取 `message`
- **THEN** 任兩種 SHALL 不同

> 兩種寫成同一句話，就是把兩種情況合併了 —— 而 `S02` 只守 401／403 那一對。

### Requirement: 結構化的細節保留給要用它的人

後端帶回的欄位級驗證錯誤（`ValidationError[]`）SHALL 原樣保留在 `UiError` 的
結構化欄位裡，**不論 status 是多少**，SHALL NOT 只壓平成一句話。
後端寫的字串 `detail` SHALL 保留在另一個欄位，**作為未經信任的資料**：
它 SHALL NOT 取代 `message`，消費者 SHALL NOT 未經自己的規則就把它放上畫面。

#### Scenario: [FE-X03-S14] 欄位錯誤原樣可取得

- **WHEN** 輸入是 status 422、`detail` 是兩筆 `ValidationError` 的 `HttpError`，
  以及一個 status 400、`detail` 同樣是兩筆 `ValidationError` 的 `HttpError`
- **THEN** 兩者的 `UiError` 結構化欄位 SHALL 都含那兩筆，`loc`／`msg`／`type` 原樣

#### Scenario: [FE-X03-S15] 後端的中文 `detail` 拿得到，但不是 `message`

- **WHEN** 輸入是 status 409、`detail` 是「這個座位已經有人了」的 `HttpError`，
  以及一個 status 422、`detail` 是「未知欄位」字串的 `HttpError`
- **THEN** 兩者的 `UiError` SHALL 各自保留那個字串
- **AND** `UiError.message` SHALL 是語彙表裡對應種類的那一句，不是後端的那一句

### Requirement: 翻譯入口只有一個

`HttpError` SHALL 只被兩種地方引用：建立它的 `src/api/`，與翻譯它的這個模組。
`src/` 裡其他任何地方要知道「這個失敗是哪一種」，SHALL 透過 `UiError.kind`，
SHALL NOT 自己讀 `HttpError.status`。

⚠️ **「唯一一份」是這一列存在的理由。** 第二份出現的那天，
同一個 401 在兩個面板上會是兩句不一樣的話。
今天唯一一個自己讀 status 的地方是 `src/identity/session.ts`（401 = 訪客、
404 = 金鑰指向的名片不存在）—— 那是控制流不是文案，行為不變，但要改成看 `kind`。

`internal` adapter（`FE-O03`）今天還不存在；它做出來的那天，它丟出的錯誤
一樣只能經由 `send()` 變成 `HttpError`，於是自動落在同一個入口底下。

#### Scenario: [FE-X03-S16] `HttpError` 的引用邊界

- **WHEN** 掃描 `src/` 每一個檔案的 import
- **THEN** 引用 `HttpError` 的檔案 SHALL 只在 `src/api/` 與這個模組底下

#### Scenario: [FE-X03-S18] 身分層依 `kind` 分辨訪客與失效的金鑰，行為不變

- **WHEN** 解析身分時後端回 401
- **THEN** 身分 SHALL 是訪客（`FE-A01` 既有的判準照樣成立）
- **AND** `src/identity/session.ts` 的原始碼（剝掉註解）SHALL NOT 含 `.status`
