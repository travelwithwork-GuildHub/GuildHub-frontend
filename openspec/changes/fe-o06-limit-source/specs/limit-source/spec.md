## Applicability

權限：**不適用** —— 長度規則對所有人一樣
併發：**不適用** —— 純函式與表單的同步計算
持久資料相容性：**不適用** —— 不讀寫持久資料；數字的真實來源是後端 schema，由 `FE-O05` 對真後端盯
失敗路徑：**適用** —— 超長、過短、`LIMITS` 的鍵沒有出處、契約 schema 出現數字字面

測試連到什麼：**不適用 —— 測試不連任何外部服務**（純函式、lint、jsdom 的表單）。

## ADDED Requirements

### Requirement: `LIMITS` 是唯一來源，契約 schema 與邊界表都從它取值

`src/api/contract/limits.ts` 的 `LIMITS` SHALL 是長度與範圍限制的唯一定義。
`src/api/contract/rest.ts` 與 `ws.ts` 裡 `.min(…)`／`.max(…)` 的引數 SHALL NOT 是數字字面（lint 規則，只掃這兩個檔案）。
`FE-O05` 的邊界表 SHALL 從 `LIMITS` 產生：改一個上限，邊界表對應的 `accept`／`reject` 值 SHALL 跟著變。
每一個 `LIMITS` 的鍵 SHALL 在 `LIMIT_SOURCES` 有一筆 `{ source: string, checkedOn: 'YYYY-MM-DD' }`（`source` 是後端檔案與行，例如 `sql/001_schema.sql:13`）。

#### Scenario: [FE-O06-S01] 改上限，邊界表跟著變

- **WHEN** 以 `bio.max = 200` 的 `LIMITS` 產生邊界表（測試注入，不改檔案）
- **THEN** `bio` 那一列的 `accept` SHALL 是 200 個字、`reject` SHALL 含 201 個字；用原本的 `LIMITS` 產生則是 300／301

#### Scenario: [FE-O06-S02] 契約 schema 裡的數字字面被 lint 擋下

- **WHEN** 以 repo 的 ESLint 設定 lint 一段放在 `src/api/contract/rest.ts` 路徑下的 `z.string().max(20)`
- **THEN** SHALL 報錯，訊息 SHALL 指向 `LIMITS`；同一段換成 `.max(LIMITS.displayName.max)` SHALL 通過；同樣的 `.max(20)` 放在 `src/api/contract/limits.ts` 以外、這兩個檔案以外的路徑 SHALL 通過（規則是窄的）

#### Scenario: [FE-O06-S03] 每一個限制都有出處

- **WHEN** 列舉 `Object.keys(LIMITS)`
- **THEN** 每一個鍵 SHALL 在 `LIMIT_SOURCES` 有一筆，`source` 非空、`checkedOn` 是合法日期；`LIMIT_SOURCES` SHALL 沒有 `LIMITS` 沒有的鍵

### Requirement: 長度單位是 Unicode code point，helper 是唯一算法

`codePointLength(s)` SHALL 回 `s` 的 code point 數（`Array.from(s).length`）。
`remaining(limit, s)` SHALL 回 `limit.max - codePointLength(s)`；`limit.max` 是 `UNBOUNDED` 時 SHALL 回 `null`。可為負（表示超出幾個字）。
`violates(limit, s)` SHALL 回 `'too-short'`（少於 `min`）、`'too-long'`（多於 `max`，`UNBOUNDED` 時永不）或 `null`。
UI 計算剩餘字數與可不可送出 SHALL 用這些 helper，SHALL NOT 用 `.length`。

#### Scenario: [FE-O06-S04] emoji 與 CJK 各算一個字

- **WHEN** `codePointLength('😀'.repeat(20))` 與 `codePointLength('字'.repeat(20))`
- **THEN** 兩者 SHALL 都是 20（`'😀'.repeat(20).length` 是 40 —— 那個數字不能出現在任何判斷裡）

#### Scenario: [FE-O06-S05] remaining 與 violates 的邊界

- **WHEN** 對 `LIMITS.displayName` 算 `''`、20 個字、21 個字；對 `LIMITS.projectTitle`（`max` 是 `UNBOUNDED`）算 10000 個字
- **THEN** `remaining` SHALL 分別是 20、0、−1、`null`；`violates` SHALL 分別是 `'too-short'`、`null`、`'too-long'`、`null`

### Requirement: 登入表單的暱稱欄真的拿到那些數字

登入表單的暱稱欄 SHALL 顯示剩餘字數（以 code point 算，來自 `LIMITS.displayName`）；
暱稱 `violates` 非 `null` 時，送出鈕 SHALL 禁用、SHALL NOT 送出請求；SHALL NOT 用原生 `maxlength` 截斷輸入（20 個 emoji 要打得進去）。

#### Scenario: [FE-O06-S06] 超出上限：送出鈕禁用、沒有請求

- **WHEN** 在暱稱欄輸入 `LIMITS.displayName.max + 1` 個字，按送出
- **THEN** 送出鈕 SHALL 是 disabled，SHALL 沒有任何 `POST /api/login` 送出；剩餘字數 SHALL 顯示為 −1（或等價的「超過 1 字」）

#### Scenario: [FE-O06-S07] 剛好上限的 emoji 可以送

- **WHEN** 輸入 `LIMITS.displayName.max` 個 emoji（`.length` 是上限的兩倍）
- **THEN** 送出鈕 SHALL 可用，剩餘字數 SHALL 是 0，送出的 body 的 `nickname` SHALL 是完整的那串（沒有被截斷）

#### Scenario: [FE-O06-S08] 數字不是寫死的

- **WHEN** 測試以 `LIMITS.displayName.max` 計算輸入長度（不寫 20）
- **THEN** `S06`／`S07` SHALL 通過；把 `LIMITS.displayName.max` 換成 10 重跑（測試注入），SHALL 仍通過 —— 表單的閾值跟著來源走
