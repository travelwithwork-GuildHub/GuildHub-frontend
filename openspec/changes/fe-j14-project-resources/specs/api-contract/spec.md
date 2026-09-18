## Applicability

權限：不適用 —— 契約只描述形狀，不做授權判斷。
併發：不適用。
持久資料相容性：適用 —— 形狀來自後端 `project_resources` 表與其 OpenAPI；三個欄位在資料庫都是 NOT NULL。
失敗路徑：適用 —— 缺欄、明確 `null`、非法 type、超長與空字串要被契約擋下。
測試連線：不適用 —— 測試不連任何外部服務。

## MODIFIED Requirements

### Requirement: 資料形狀只有一份定義

系統 SHALL 把後端每一個實體、每一個操作的輸入與輸出、以及 WebSocket 兩個方向的
訊息形狀，全部定義在 `src/api/contract/` 底下，並且 SHALL 以執行期可驗證的形式
（不只是 TypeScript 型別）表達。

任何其他位置 MUST NOT 再定義一次相同的形狀 —— 包含元件、Route Handler、測試檔。
需要那些形狀的地方 SHALL 從契約 import。

這一條的範圍是**真後端今天存在的 21 個 `/api/*` 端點與 WebSocket 協定 v1**：
原本凍結的 16 個、2026-09-08 L3 裁決加的 `POST /api/register`（原文寫 16 時漏了它），
以及 `BE-G12` 加的專案資源四個（`GET`／`POST /api/projects/{project_id}/resources`、
`PATCH`／`DELETE /api/projects/{project_id}/resources/{resource_id}`）。
Role / Application / Invitation / Offer 等尚不存在的操作 MUST NOT 出現在契約裡
（後端沒有它們 —— `BE-G10`）；它們由各自的工作項目在自己那一週加進來。

專案資源的更新輸入 SHALL 三個欄位皆可省略、但**不可為 `null`**（後端欄位型別是 `str`，明確送 `null` 回 422）：
契約 SHALL 以「可省略」表達，MUST NOT 以「可為 null」表達 —— 後者會讓〈後端形狀改變時 typecheck 要變紅〉的相等斷言變紅，
而放寬那條斷言來遷就它是禁止的。

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

#### Scenario: [FE-J14-S25] 專案資源的三個形狀：type 封閉、更新可省略不可 null

- **WHEN** 把 `{"label":"Repo","type":"github","url":"https://github.com/o/r"}` 交給資源的新增輸入驗證
- **THEN** 通過
- **AND WHEN** `type` 換成 `other`、或少了 `url`
- **THEN** 各自失敗，並指出是那個欄位
- **AND WHEN** 把 `{}`、`{"url":"https://example.com"}` 交給資源的更新輸入驗證
- **THEN** 都通過；結果 SHALL 只含有給的鍵
- **AND WHEN** 把 `{"label":null}` 交給資源的更新輸入驗證
- **THEN** 失敗
- **AND WHEN** 把一份 `ProjectResourceOut` 形狀的資料加上 `updated_at` 交給輸出驗證
- **THEN** 通過，且結果 SHALL NOT 包含 `updated_at`
- → 驗於：單元

#### Scenario: [FE-J14-S26] 契約的範圍與後端的端點集合相等

- **WHEN** 列出產出型別檔中所有 `/api/*` 的 `(method, path)`
- **THEN** SHALL 恰好 21 組，且包含專案資源的四組
- **AND** `tests/api-operations-coverage.test.ts` 對每一個資料存取操作送出的 method 與路徑 SHALL 都在這 21 組裡（`DELETE` 也算）
- → 驗於：單元

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
| 專案資源 `label`（`resourceLabel`） | 1–100 |
| 專案資源 `url`（`resourceUrl`） | 1–2048 |

長度 SHALL 以 **Unicode code point** 計算，與後端的 Python `len()` 及
PostgreSQL `char_length()` 一致。**MUST NOT 使用 UTF-16 code unit 計數** ——
那會讓前端拒絕後端收得下的字串，而使用者只會看到「打不進去」。

`projects.title`、`projects.body`、`skills` 在後端**完全沒有上限**。
契約 SHALL 明確記錄「這一項沒有後端上限、前端上限尚未決定」，
而不是靜靜地不提 —— 前端自己的上限由 `FE-X05` 決定並填進來。

專案資源在資料庫另有兩條**不是長度**的 check：`label` 不得只含空白（`btrim(label) <> ''`）、
`url` 必須符合 `url ~* '^https?://[^[:space:]]+$'`（`~*` 是**不分大小寫**的比對 —— `HTTPS://…` 合法）。它們 MUST NOT 被寫進這張長度表，也 MUST NOT 以數字表達；
前端送出前怎麼擋它們由 `project-resources` 規定。

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

#### Scenario: [FE-J14-S27] 資源名稱與網址的邊界成對，且有出處

- **WHEN** 以資源的新增輸入驗證 `label` 為 100 個 emoji、101 個 CJK、空字串（其他欄位合法）
- **THEN** 分別 SHALL 通過、失敗、失敗
- **AND WHEN** 驗證 `url` 為 `https://example.com/` 開頭、總長恰好 2048 與 2049 code point 的字串
- **THEN** 分別 SHALL 通過、失敗
- **AND** 常數表的 `resourceLabel` 與 `resourceUrl` SHALL 各在 `LIMIT_SOURCES` 有一筆，`source` 指向後端 `sql/001_schema.sql` 的行
- → 驗於：單元
