## Applicability

權限：不適用 —— 邊界表只描述欄位與端點的對應；權限矩陣在 `internal-backend`。
併發：不適用。
持久資料相容性：適用 —— 邊界由資料庫 check 決定，拒絕的形狀是 `500 text/plain`。
失敗路徑：適用 —— `max+1`、`min-1`、只含空白的名稱。
測試連線：只打本機自己起的可拋棄後端（`internal` 由 harness 起、`guildhub` 由 wrapper 起）；MUST NOT 連任何共用實例。

## MODIFIED Requirements

### Requirement: 成對邊界從 `limits.ts` 產生

邊界案例 SHALL 由 `tests/contract/boundaries.ts` 產生：**值**來自 `FE-O06` 的 `boundaryValues(limit)`（`src/api/contract/boundaries.ts`，
純函式：`max` 個 CJK、`max` 個 emoji 接受；`max+1` 拒絕；`min > 0` 時 `min-1` 拒絕），這裡只負責把每個欄位對到**端點與鍵**（`via`）。
測試檔 SHALL NOT 出現任何長度數字。
端點到得了的欄位：`displayName`（`POST /api/login` 的 `nickname`、`PATCH` 的 `display_name`）、`bio`（`PATCH`）、
`resourceLabel`（專案資源 `POST` 的 `label`、`PATCH` 的 `label`）、`resourceUrl`（專案資源 `POST` 的 `url`、`PATCH` 的 `url`）。
到不了的（`messageBody`、`seatIndex`、`password`、`loginId`）SHALL 在表裡標成 `pending: '<能力>'`，測試 SHALL 印出 pending 的清單但不算失敗。
「拒絕」的形狀由表指定：資料庫 check 擋的是 `500 text/plain`；應用層擋的是 `422`。

`resourceUrl` 的值另受資料庫的格式 check（`url ~* '^https?://[^[:space:]]+$'`，不分大小寫）約束：
`boundaryValues` 產生的是純 CJK 與 emoji 字串，**不論長短都不是合法網址**，所以它的值不能直接送。
表 SHALL 為這個欄位指定一個**保長度的塑形**：固定的 `https://` 前綴加上填充，使送出的字串總長（code point）**恰好等於**
`boundaryValues` 給的那個值的長度；塑形 SHALL 是表裡的一個純函式，測試檔不寫數字。

⚠️ 塑形 SHALL 只用在**長度可比較**的案例（`max` 與 `max+1`）。`boundaryValues` 在 `min > 0` 時還會給
「`min` 個字」的 accept 與「`min-1` 個字」的 reject —— `resourceUrl.min` 是 1，那兩個值（1 個 CJK、空字串）
一個塑不出合法網址、一個長度是 0：表 SHALL 能宣告「這個欄位的 `min` 側只驗 reject，且用**原值**（空字串）、預期 `500 text/plain`」，
`min` 側的 accept SHALL 被排除並在表裡寫明理由。**MUST NOT** 用「把塑形套到所有值」或「乾脆不驗 `min` 側」蓋過這件事。
專案資源的前置（登入 owner、建立 active 專案、`PATCH` 要先有一筆）SHALL 在 harness 裡，測試檔不分目標。

#### Scenario: [FE-O05-S07] display_name 的四個邊界

- **WHEN** `PATCH /api/profiles/me` 依序送 `display_name` 為 20 個 CJK、20 個 emoji、21 個 CJK、空字串
- **THEN** 前兩次 SHALL 是 `200` 且回傳的 `display_name` 逐字相同；後兩次 SHALL 是 `500 text/plain`；每一次拒絕之後 `GET /api/me` 的 `display_name` SHALL 是最後一次成功的值

#### Scenario: [FE-O05-S08] bio 的邊界與純空白

- **WHEN** `PATCH` 送 `bio` 為 300 個字、301 個字、`""`、`"   "`（三個空白）
- **THEN** SHALL 分別是 `200`、`500`、`200`（`bio` 是 `""`）、`200`（`bio` 是 `"   "` —— 後端不 trim，這是要記下來的事實）

#### Scenario: [FE-O05-S09] 上限收緊會被抓到

- **WHEN** 把 `limits.ts` 的 `bio.max` 改成 200（模擬後端收緊而前端沒跟）
- **THEN** 對兩個目標跑，`max+1`（201）那一條 SHALL 都紅 —— 因為後端仍接受 201 個字（測試預期拒絕）；改回 300 SHALL 全綠

> 這是「只送超長抓不到收緊」那條 Alarm 的直接判準。

#### Scenario: [FE-J14-S33] 資源名稱與網址的成對邊界；名稱只含空白被拒、前後空白保留

- **WHEN** 對兩個目標，專案資源 `POST` 依序送 `label` 為 `resourceLabel.max` 個 CJK、`max` 個 emoji、`max+1` 個 CJK、空字串、`"   "`、`" a "`（其他欄位合法）
- **THEN** SHALL 分別是 `201`、`201`、`500 text/plain`、`500 text/plain`、`500 text/plain`、`201`；最後一筆回傳的 `label` SHALL 逐字是 `" a "`
- **AND WHEN** 送 `url` 為塑形後總長 `resourceUrl.max` 與 `max+1` code point 的字串，以及**未塑形的空字串**（`min-1`）
- **THEN** SHALL 分別是 `201`、`500 text/plain`、`500 text/plain`；第一個回傳的 `url` SHALL 逐字等於送出的
- **AND** 每一次拒絕之後 GET 的筆數 SHALL 不變；`PATCH` 的 `label`、`url` 同一組值 SHALL 得到對應的 `200`／`500`
- **AND WHEN** 把 `limits.ts` 的 `resourceUrl.max` 改成 2000
- **THEN** 對兩個目標跑，`max+1` 那一條 SHALL 都紅；改回 SHALL 全綠
- → 驗於：契約測試（兩個目標）
