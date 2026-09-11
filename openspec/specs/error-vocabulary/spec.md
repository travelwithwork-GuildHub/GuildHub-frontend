# error-vocabulary Specification

## Purpose
前端拿到一個失敗之後，說給使用者聽的那一句話 —— 而且**整個前端只有這一份**。

資料層丟出來的東西形狀很多：`HttpError`（401／403／404／409／422／400／5xx／其他 4xx）、
`send()` 對「`fetch` 在拿到回應之前失敗」的 `NetworkError`、契約驗證失敗的
`ContractDriftError`、被中止的 `AbortError`、以及任何認不得的東西。這份 capability
把它們全部翻譯成一個封閉的語意種類（`kind`）配一句前端自己寫的、安全的話，
**永遠不拋**，也**永遠不把後端的內臟給使用者看**。

它只交付翻譯與字典，不交付任何元件：清單的裝幀是 `FE-X04`，表單是 `FE-X05`。
`HttpError` 與 `NetworkError` 只能在 `src/api/`（建立）與 `src/errors/`（翻譯）出現，
lint 擋著 —— 第二張「status → 該怎麼說」的對照表就是從一行 `error.status === 401` 長出來的。

## Requirements

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

- **WHEN** 輸入是資料層對「`fetch` 在拿到回應之前失敗」的表示（`NetworkError`）
- **THEN** `kind` SHALL 是「連不上」那一種

> `fetch` 自己 reject 的是一個 `TypeError`，而**程式自己的 bug 也是 `TypeError`**
>（`Cannot read properties of undefined`）。用 `instanceof TypeError` 分的話，
> 每一個屬性讀取錯誤都會被說成「檢查一下網路」。所以資料層在**唯一呼叫 `fetch` 的地方**
> 把 rejection 包成一個專屬的型別，翻譯器只認那個型別（`S19` 守反面）。

#### Scenario: [FE-X03-S19] 程式自己的 `TypeError` 不是「連不上」

- **WHEN** 輸入是一個訊息為 `Cannot read properties of undefined` 的 `TypeError`
- **THEN** `kind` SHALL 是「預期之外」那一種

#### Scenario: [FE-X03-S09] 契約漂移是「收到的資料不對」

- **WHEN** 輸入是 `ContractDriftError`
- **THEN** `kind` SHALL 是「收到的資料不對」那一種

#### Scenario: [FE-X03-S17] 被中止的請求是「已取消」，不是錯誤

- **WHEN** 輸入是 `name` 為 `AbortError` 的 `DOMException`
- **THEN** `kind` SHALL 是「已取消」那一種
- **AND** 一個 `name` 為 `AbortError` 的**純物件** SHALL 是「預期之外」，不是「已取消」

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

#### Scenario: [FE-X03-S20] 不在 400–599 的 status 是「預期之外」

- **WHEN** 輸入是 status 為 200、399、600 或 `NaN` 的 `HttpError`
- **THEN** `kind` SHALL 是「預期之外」那一種

> 規格只定義 4xx 與 5xx。`>= 500` 這種寫法會把 600 與 `Infinity` 說成伺服器出了問題，
> `default` 分支會把 200 說成「請求沒有被接受」。

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

`HttpError` 與 `NetworkError` SHALL 只被兩種地方引用：建立它們的 `src/api/`，與翻譯它們的這個模組。
`src/` 裡其他任何地方要知道「這個失敗是哪一種」，SHALL 透過 `UiError.kind`，
SHALL NOT 自己讀 `HttpError.status`。

⚠️ **「唯一一份」是這一列存在的理由。** 第二份出現的那天，
同一個 401 在兩個面板上會是兩句不一樣的話。
今天唯一一個自己讀 status 的地方是 `src/identity/session.ts`（401 = 訪客、
404 = 金鑰指向的名片不存在）—— 那是控制流不是文案，行為不變，但要改成看 `kind`。

`internal` adapter（`FE-O03`）今天還不存在；它做出來的那天，它丟出的錯誤
一樣只能經由 `send()` 變成 `HttpError`，於是自動落在同一個入口底下。

#### Scenario: [FE-X03-S16] `HttpError` 的引用邊界

- **WHEN** `src/api/` 與這個模組以外的檔案從資料層 import `HttpError`（含改名、整個模組一起 import、再匯出）
- **THEN** lint SHALL 擋下它

> 字串掃描擋不住 `import { HttpError as H }` 與 `import * as t`，所以這一條是 lint 規則，
> 而 lint 規則自己要有負向測試（`tests/no-fetch-rule.test.ts` 的形狀）。

#### Scenario: [FE-X03-S18] 身分層依 `kind` 分辨訪客與失效的金鑰，行為不變

- **WHEN** 解析身分時後端回 401
- **THEN** 身分 SHALL 是訪客（`FE-A01` 既有的判準照樣成立）
- **AND** `src/identity/session.ts` 的原始碼（剝掉註解）SHALL NOT 含 `.status`
