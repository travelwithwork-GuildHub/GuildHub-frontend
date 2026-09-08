# api-contract Specification

## Purpose
前端與後端之間每一個資料形狀的唯一定義：REST 的實體與操作、WebSocket 兩個方向
各自的訊息集合、長度與範圍限制、錯誤 envelope。它不發送任何請求 —— 它是那些請求
與回應**必須長成的樣子**，以及一個會在後端形狀改變時讓 typecheck 變紅的哨兵。

它之所以要單獨存在，是因為真後端的長度規則**只寫在資料庫**，應用層刻意不檢查，
所以超長欄位回的是 500 而不是 422。**擋不擋得住長度，只剩前端一個地方決定。**

## Requirements

### Requirement: 資料形狀只有一份定義

系統 SHALL 把後端每一個實體、每一個操作的輸入與輸出、以及 WebSocket 兩個方向的
訊息形狀，全部定義在 `src/api/contract/` 底下，並且 SHALL 以執行期可驗證的形式
（不只是 TypeScript 型別）表達。

任何其他位置 MUST NOT 再定義一次相同的形狀 —— 包含元件、Route Handler、測試檔。
需要那些形狀的地方 SHALL 從契約 import。

這一條的範圍是**真後端今天存在的 16 個 `/api/*` 端點與 WebSocket 協定 v1**。
Role / Application / Invitation / Offer 等尚不存在的操作 MUST NOT 出現在契約裡
（後端沒有它們 —— `BE-G10`）；它們由各自的工作項目在自己那一週加進來。

#### Scenario: [FE-O01-S01] 契約能驗一份真的後端回應

- **WHEN** 把一份符合 `ProfileOut` 形狀的資料交給契約驗證
- **THEN** 驗證通過，並回傳一個型別已知的值
- **AND WHEN** 把同一份資料的 `skills` 換成字串（而不是字串陣列）
- **THEN** 驗證失敗，並指出是 `skills` 這個欄位
- **AND** 失敗 MUST NOT 是拋出未捕捉的例外以外的靜默結果

#### Scenario: [FE-O01-S02] 缺必填欄位會被擋下

- **WHEN** 把一份少了 `display_name` 的資料交給 `ProfileOut` 驗證
- **THEN** 驗證失敗
- **AND WHEN** 把一份多了一個後端沒有的欄位的資料交給它驗證
- **THEN** 驗證通過，且結果 SHALL NOT 包含那個多餘欄位
  （後端新增欄位不該讓前端當掉；漂移由下面的哨兵那條負責讓人看到）

### Requirement: 長度與範圍限制有單一來源，且以 code point 計算

系統 SHALL 把所有長度與範圍限制集中在契約底下的**單一常數表**，
並且契約的驗證規則 SHALL 由那份常數表建立，而不是各自寫死。
那些數字 SHALL 可以被讀出來（供 `FE-O06` 之後接到 UI），不需要在別處再寫一次。

限制值如下，來源是 `sql/001_schema.sql` 與 `app/realtime/presence.py`：

| 欄位 | 限制 |
|---|---|
| `display_name` | 1–20 |
| `bio` | ≤ 300 |
| 站內信 `body` | 1–2000 |
| WS 狀態文字 | ≤ 12 |
| `seat_index` | 0–7 |

長度 SHALL 以 **Unicode code point** 計算，與後端的 Python `len()` 及
PostgreSQL `char_length()` 一致。**MUST NOT 使用 UTF-16 code unit 計數** ——
那會讓前端拒絕後端收得下的字串，而使用者只會看到「打不進去」。

`projects.title`、`projects.body`、`skills` 在後端**完全沒有上限**。
契約 SHALL 明確記錄「這一項沒有後端上限、前端上限尚未決定」，
而不是靜靜地不提 —— 前端自己的上限由 `FE-X05` 決定並填進來。

#### Scenario: [FE-O01-S03] 邊界成對驗，上下界都要

- **WHEN** 用剛好 20 個字元的 `display_name` 驗證
- **THEN** 通過
- **AND WHEN** 用 21 個字元驗證
- **THEN** 失敗
- **AND WHEN** 用 0 個字元（空字串）驗證
- **THEN** 失敗

> 只驗「超過上限會拒絕」是不夠的：把上限從 20 改成 10 之後，送 21 仍然被拒，
> 那種測試照樣是綠的。

#### Scenario: [FE-O01-S04] 長度單位是 code point，不是 UTF-16 code unit

- **WHEN** 用 12 個 BMP 外的字元（例如 `😀`，每個佔 2 個 UTF-16 code unit）
  作為 WS 狀態文字驗證
- **THEN** 通過 —— 因為後端的 `len()` 算出來是 12，會接受它
- **AND WHEN** 用 13 個相同字元驗證
- **THEN** 失敗

#### Scenario: [FE-O01-S05] 沒有後端上限的欄位，契約要說出來

- **WHEN** 讀取常數表裡 `projects.title` 的上限
- **THEN** 得到一個明確表示「未定」的值，而不是 `undefined` 或不存在的鍵
- **AND** 契約對該欄位 MUST NOT 施加一個憑空發明的數字上限

### Requirement: WebSocket 兩個方向是兩個獨立的訊息集合

系統 SHALL 分別定義 client→server 與 server→client 兩個訊息集合，
且兩者 MUST NOT 合併成單一個以 `t` 為判別鍵的集合。

理由是 `t` **不是全域唯一的**：`status` 與 `chat` 在兩個方向都存在，形狀不同
（client 送 `{t:"status",text}`，server 送 `{t:"status",id,text}`）。
合併會讓其中一個方向的驗證被另一個方向的形狀覆蓋。

client→server SHALL 涵蓋 `move`、`status`、`chat`。
server→client SHALL 涵蓋 `hello`、`snapshot`、`pos`、`presence`、`status`、`chat`、`err`。

`move` 的 `x` 與 `y` SHALL 是整數；非整數 MUST 被契約拒絕
（後端用 `StrictInt`，收到浮點會**整則訊息靜默丟棄**，前端拿不到任何錯誤）。
`move` 的 `f` SHALL 是 `0`–`3` 的整數（0 下、1 左、2 右、3 上）。

收到**未知的 `t`** 時，驗證 SHALL 明確失敗。MUST NOT 靜默忽略、
MUST NOT 回傳一個「除了 `t` 以外都是空的」物件。

#### Scenario: [FE-O01-S06] 同一個 `t` 在兩個方向有不同形狀

- **WHEN** 用 client→server 的集合驗證 `{"t":"status","text":"趕工中"}`
- **THEN** 通過
- **AND WHEN** 用 client→server 的集合驗證 `{"t":"status","id":"u1","text":"趕工中"}`
- **THEN** 通過，且結果 SHALL NOT 包含 `id`（那是伺服器才有的欄位）
- **AND WHEN** 用 server→client 的集合驗證 `{"t":"status","text":"趕工中"}`（少了 `id`）
- **THEN** 失敗

#### Scenario: [FE-O01-S07] 浮點座標與越界朝向都被擋下

- **WHEN** 驗證 `{"t":"move","x":120.5,"y":340,"f":2}`
- **THEN** 失敗 —— `x` 不是整數
- **AND WHEN** 驗證 `{"t":"move","x":120,"y":340,"f":4}`
- **THEN** 失敗 —— `f` 超出 `0`–`3`
- **AND WHEN** 驗證 `{"t":"move","x":-120,"y":-340,"f":0}`
- **THEN** 通過 —— 協定允許負座標

#### Scenario: [FE-O01-S08] 未知的訊息類型明顯失敗

- **WHEN** 用 server→client 的集合驗證 `{"t":"teleport","x":1}`
- **THEN** 驗證失敗，且失敗結果指出 `t` 不是已知的類型
- **AND** MUST NOT 回傳成功

### Requirement: 錯誤 envelope 只涵蓋 JSON 的錯誤回應

系統 SHALL 定義後端 **JSON** 錯誤回應的形狀為 `{ detail: <字串> | <驗證錯誤陣列> }`，
兩種形狀都要涵蓋 —— 後端自己丟的錯誤 `detail` 是可直接顯示的中文字串，
而框架自動產生的 422 的 `detail` 是結構化錯誤陣列。

**這個 envelope 對 500 不適用。** 後端未捕捉的例外（包含超長欄位觸發的資料庫錯誤）
回的是 `content-type: text/plain` 的 `Internal Server Error`，**根本不是 JSON**。
契約 SHALL 明確涵蓋這個情況：把非 JSON 的回應交給 envelope 驗證時要明顯失敗，
MUST NOT 產生一個看起來成功的結果。

契約 MUST NOT 定義任何處置（要不要導向登入、要不要重拉列表），
也 MUST NOT 列舉 status code 的集合 —— 兩者都是 `FE-X03` 的唯一一份錯誤語彙。
（後端 OpenAPI 只宣告 `200`/`201`/`422`，實際會丟的碼比那多，這件事記在
`design.md` 的現況表；本 change 不把它變成一份沒有任何 Scenario 證明的清單。）

#### Scenario: [FE-O01-S09] 兩種 detail 形狀都驗得過，其他形狀不行

- **WHEN** 驗證 `{"detail":"這個座位已經有人了"}`
- **THEN** 通過，且結果可辨識出 `detail` 是字串
- **AND WHEN** 驗證 `{"detail":[{"loc":["body","display_name"],"msg":"...","type":"..."}]}`
- **THEN** 通過，且結果可辨識出 `detail` 是結構化陣列
- **AND WHEN** 驗證 `{"error":"boom"}`
- **THEN** 失敗

#### Scenario: [FE-O01-S12] 500 的純文字回應不會被誤判成錯誤 envelope

- **WHEN** 把字串 `Internal Server Error`（後端 500 的實際 body，`text/plain`）
  交給錯誤 envelope 驗證
- **THEN** 失敗 —— 它不是這個 envelope 的形狀
- **AND WHEN** 把它先當成 JSON 解析
- **THEN** 解析本身就會失敗，契約 SHALL NOT 假設錯誤回應一定是 JSON

### Requirement: 後端形狀改變時 typecheck 要變紅

系統 SHALL 保留一份由後端 OpenAPI 產生的型別檔，並 SHALL 對每一個 REST 實體
斷言「契約推導出的型別」與「產出的型別」**完全相同**（雙向，不是單向相容）。

系統 SHALL 另外維護一份**實體登錄表**（名稱 → 契約 schema），並 SHALL 斷言
登錄表的鍵集合與產出型別檔的實體集合**剛好相等**（扣掉框架自己的錯誤型別）。

**沒有這一條的話上一條是空的**：把所有相等斷言整個刪掉，typecheck 照樣是綠的
（一個沒有斷言的檔案當然不會有型別錯誤）；後端**新增**一個實體時也不會紅，
因為沒有人替它寫斷言。登錄表把「有沒有涵蓋」變成一條機器判得出來的斷言。

後端欄位的型別、可選性或存在與否改變之後，重新產生該檔案 SHALL 使 typecheck 失敗。
後端**新增或刪除**一個實體之後，重新產生該檔案同樣 SHALL 使 typecheck 失敗。

**這條保證的邊界要寫清楚**：它保證的是「契約沒有偏離**上次產出時**的後端形狀」。
它**不會**自己去看現在的後端 —— 沒有人重新產生的話，它永遠是綠的。
偵測「後端現在變了」需要重新產生這份檔案，那是一個人為動作
（`FE-O08` 的切換演練與 `FE-O05` 對真後端的那一輪）。
把它當成即時的後端漂移偵測器是高估它。

它也**驗不到長度限制** —— 那些限制在後端的 OpenAPI 裡根本不存在
（整份沒有任何 `maxLength`／`minimum`），所以哨兵對它們是盲的。
`limits.ts` 的每一個數字都是人工從 `sql/001_schema.sql` 抄過來的，
**沒有任何機器在對它們**；抓得到那種漂移的是 `FE-O05` 對真後端的成對邊界測試（W2）。

#### Scenario: [FE-O01-S10] 少涵蓋一個實體就會紅

- **WHEN** 從實體登錄表移除一個項目（模擬「有人忘了替新實體寫契約」）
- **THEN** typecheck 失敗，且錯誤指向涵蓋率那一條斷言
- **AND WHEN** 登錄表的鍵剛好等於產出型別檔的實體集合
- **THEN** typecheck 通過

> 兩個方向都要驗：只驗「少一個會紅」的話，一條永遠是 `false` 的斷言
> 也會通過那個測試，而它會讓涵蓋率永遠紅、最後被人註解掉。

#### Scenario: [FE-O01-S11] 後端欄位變成可為 null 時哨兵會紅

- **WHEN** 把產出型別檔中某個必填非空欄位改成可為 `null`（模擬後端改動後重新產生）
- **THEN** typecheck 失敗，且錯誤指向該實體的相等斷言
- **AND WHEN** 改成新增一個後端沒有的欄位
- **THEN** typecheck 同樣失敗 —— 新欄位是契約變更，要被看到，不是被吞掉
