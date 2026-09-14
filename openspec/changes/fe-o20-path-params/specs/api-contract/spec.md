## Applicability

權限：不適用 —— 純型別層，不做授權判斷。
併發：不適用 —— 沒有執行期狀態。
持久資料相容性：不適用 —— 不讀寫持久資料。
失敗路徑：適用 —— 鍵拼錯、少給、無參數路徑多給、正確鍵之外再多一個、多參數路徑萃取不全，五種都要在 typecheck 就紅。
測試連到什麼：不適用 —— 測試只對 fixture 跑 tsc，不連任何外部服務。

## ADDED Requirements

### Requirement: 路徑參數的鍵由路徑決定

`RequestSpec` 對每一條路徑 SHALL 從路徑字面值萃取參數名，並以此決定 `params` 的型別：

- **萃取規則**：每一段 `{name}`（`{` 到下一個 `}` 之間的字）算一個參數名，不限個數；同名出現兩次算一個鍵。
  除此之外的寫法都不是參數。
- 路徑含至少一個參數時，`params` SHALL 必填，且鍵的集合 SHALL 與參數名的集合**相等**——
  少一個、拼錯一個、多一個都 SHALL 是 typecheck 錯誤。
- 路徑不含參數時，`params` SHALL 只接受 `undefined`（repo 沒開 `exactOptionalPropertyTypes`，
  寫 `params: undefined` 會過，這是刻意放行的；給任何物件都 SHALL 是 typecheck 錯誤）。

**「多一個」的約束只在 `params` 是物件字面值時成立**——那是 TypeScript 多餘屬性檢查的邊界：
先存進變數再傳的超集不會紅（量過）。`operations.ts` 全是字面值；把 `params` 存進變數再傳
不在本 Requirement 宣稱擋得住的範圍，跟 `realtime-client` 那條對「路徑存進變數再 `import(p)`」的處置相同。

`params` 的值型別維持 `string`（呼叫端自己轉字串；`buildRequest` 照舊 `encodeURIComponent`）。
既有的操作（`src/api/operations.ts` 今天七個帶路徑參數的操作）SHALL 不用改就通過 typecheck。
`buildRequest` 的執行期行為 SHALL 不變。

**這一條跟〈每一個資料存取操作的 method 與 path 必須存在於產出的後端契約〉是同一個缺陷類別的另一半。**
那一條把 `path` 綁進型別，所以路徑打錯會紅；但 `params` 是 `Record<string, string>`，鍵名打錯的話
`path.replace('{profile_id}', …)` 找不到樣板，客戶端會送出字面值 `/api/profiles/{profile_id}` 然後靜靜吃 404 ——
沒有任何測試會紅（`FE-A01` 的兩位審查者各自指到）。

判準的形狀沿用這個 repo 既有的型別 fixture（`tests/type-fixtures/`：單獨一份 tsconfig、故意違規的檔案、
測試對它跑 tsc）。⚠️ **那個目錄是共用的**，裡面已經有別的 change 的違規檔，tsc 本來就非零結束；
而「檔名出現在輸出」也只證明那個檔有**某個**錯（少寫 `method`、忘了 import 都算）。
所以下面每一條 Scenario 斷言的是**那個檔案的診斷恰好一則、且是指定的診斷碼**——
測試 SHALL 解析 tsc 的 `<檔名>(<行>,<欄>): error TS<碼>` 行，按檔名分組比對。

#### Scenario: [FE-O20-S01] 鍵拼錯

- **WHEN** 對 `tests/type-fixtures/` 裡一個 `buildRequest({ method: 'GET', path: '/api/profiles/{profile_id}', params: { id: 'x' } })` 的檔案跑 tsc
- **THEN** 該檔的診斷 SHALL 恰好一則，碼是 `TS2353`（多餘屬性：`id` 不在 `Record<'profile_id', string>`）

#### Scenario: [FE-O20-S02] 少給

- **WHEN** 檔案是 `buildRequest({ method: 'GET', path: '/api/projects/{project_id}' })`（沒有 `params`）
- **THEN** 該檔的診斷 SHALL 恰好一則，碼是 `TS2345`（`params` 缺、但必填）

#### Scenario: [FE-O20-S03] 沒有參數的路徑給了 params

- **WHEN** 檔案是 `buildRequest({ method: 'GET', path: '/api/me', params: { id: 'x' } })`
- **THEN** 該檔的診斷 SHALL 恰好一則，碼是 `TS2353`

#### Scenario: [FE-O20-S04] 正確的鍵之外再多一個

- **WHEN** 檔案是 `buildRequest({ method: 'GET', path: '/api/projects/{project_id}', params: { project_id: 'a', extra: 'b' } })`
- **THEN** 該檔的診斷 SHALL 恰好一則，碼是 `TS2353`

> 這一條跟 `S03` 不能互相取代：`S03` 驗的是「這條路徑根本不收 `params`」，
> 這一條驗的是「收，但集合要相等，不是超集」。只做 `Record<ParamsOf<P>, string>` 而沒有多餘屬性檢查的話，
> `S03` 紅、這一條綠。

#### Scenario: [FE-O20-S05] 多參數路徑要全部萃取（型別哨兵）

- **WHEN** `src/api/transport.ts` 裡對萃取型別放三條哨兵（寫法同 `PathsWith` 的那三條 `Expect<…>`）：
  `'/a/{x}/b/{y}'` → 恰好 `'x' | 'y'`；`'/{id}/c/{id}'` → 恰好 `'id'`；`'/api/me'` → `never`
- **THEN** `pnpm run typecheck` SHALL 綠
- **AND WHEN** 把萃取改成只取第一個參數（`? K : never`）
- **THEN** `pnpm run typecheck` SHALL 紅在第一條哨兵

> 今天產出的契約沒有任何雙參數路徑，所以這件事**過不了 `RequestSpec`**（`path` 只收契約裡有的路徑），
> 只能在萃取型別本身上釘。它是哨兵不是 fixture：跟產品碼在同一次 tsc 裡，但它守的是「第一條雙參數路徑
> 進契約那天，萃取不會只拿到一半」——那天之前沒有 fixture 能寫。

#### Scenario: [FE-O20-S06] 既有操作照舊，新操作寫對就過

- **WHEN** `pnpm run typecheck`
- **THEN** SHALL 綠（`getProfile`、`getProject`、`formTeam`、`closeProject`、`enterProject`、`listSeats`、`claimSeat`
  一個都不用改）
- **AND** `tests/api-operations-coverage.test.ts` SHALL 全綠（執行期送出的路徑不變）
- **AND WHEN** `tests/type-fixtures/` 裡有一個寫對的檔案
  （`buildRequest({ method: 'POST', path: '/api/projects/{project_id}/close', params: { project_id: 'a' } })`），跟 `S01`～`S04` 同一次 tsc
- **THEN** 該檔 SHALL 沒有任何診斷 —— 這條防的是型別被收窄到「只有既有呼叫形狀能過」
