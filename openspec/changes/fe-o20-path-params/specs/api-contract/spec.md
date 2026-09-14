## Applicability

權限：不適用 —— 純型別層，不做授權判斷。
併發：不適用 —— 沒有執行期狀態。
持久資料相容性：不適用 —— 不讀寫持久資料。
失敗路徑：適用 —— 鍵拼錯、少給、無參數路徑多給、正確鍵之外再多一個，四種都要在 typecheck 就紅。
測試連到什麼：不適用 —— 測試只對 fixture 跑 tsc，不連任何外部服務。

## ADDED Requirements

### Requirement: 路徑參數的鍵由路徑決定

`RequestSpec` 對每一條路徑 SHALL 從路徑字面值萃取 `{param}` 的名字，並以此決定 `params` 的型別：

- 路徑含至少一個 `{param}` 時，`params` SHALL 必填，且鍵的集合 SHALL 與路徑裡的參數名**完全相等**——
  少一個、拼錯一個、多一個都 SHALL 是 typecheck 錯誤。
- 路徑不含 `{param}` 時，SHALL NOT 接受 `params`。

`params` 的值型別維持 `string`（呼叫端自己轉字串；`buildRequest` 照舊 `encodeURIComponent`）。
既有的操作（`src/api/operations.ts` 今天七個帶路徑參數的操作）SHALL 不用改就通過 typecheck。
`buildRequest` 的執行期行為 SHALL 不變。

**這一條跟〈每一個資料存取操作的 method 與 path 必須存在於產出的後端契約〉是同一個缺陷類別的另一半。**
那一條把 `path` 綁進型別，所以路徑打錯會紅；但 `params` 是 `Record<string, string>`，鍵名打錯的話
`path.replace('{profile_id}', …)` 找不到樣板，客戶端會送出字面值 `/api/profiles/{profile_id}` 然後靜靜吃 404 ——
沒有任何測試會紅（`FE-A01` 的兩位審查者各自指到）。

判準的形狀沿用這個 repo 既有的型別 fixture（`tests/type-fixtures/`：單獨一份 tsconfig、故意違規的檔案、
測試對它跑 tsc）。⚠️ **那個目錄是共用的**——裡面已經有別的 change 的違規檔，所以 tsc 本來就非零結束；
下面每一條 Scenario 斷言的是**錯誤輸出含那個檔名**，不是退出碼。

#### Scenario: [FE-O20-S01] 鍵拼錯

- **WHEN** 對 `tests/type-fixtures/` 裡一個 `buildRequest({ method: 'GET', path: '/api/profiles/{profile_id}', params: { id: 'x' } })` 的檔案跑 tsc
- **THEN** 錯誤輸出 SHALL 含那個檔名

#### Scenario: [FE-O20-S02] 少給

- **WHEN** 檔案是 `buildRequest({ method: 'GET', path: '/api/projects/{project_id}' })`（沒有 `params`）
- **THEN** 錯誤輸出 SHALL 含那個檔名

#### Scenario: [FE-O20-S03] 沒有參數的路徑給了 params

- **WHEN** 檔案是 `buildRequest({ method: 'GET', path: '/api/me', params: { id: 'x' } })`
- **THEN** 錯誤輸出 SHALL 含那個檔名

#### Scenario: [FE-O20-S04] 正確的鍵之外再多一個

- **WHEN** 檔案是 `buildRequest({ method: 'GET', path: '/api/projects/{project_id}', params: { project_id: 'a', extra: 'b' } })`
- **THEN** 錯誤輸出 SHALL 含那個檔名

> 這一條跟 `S03` 不能互相取代：`S03` 驗的是「這條路徑根本不收 `params`」，
> 這一條驗的是「收，但集合要相等，不是超集」。只做 `Record<ParamsOf<P>, string>` 而沒有多餘屬性檢查的話，
> `S03` 紅、這一條綠。

#### Scenario: [FE-O20-S05] 既有操作照舊

- **WHEN** `pnpm run typecheck`
- **THEN** SHALL 綠（`getProfile`、`getProject`、`formTeam`、`closeProject`、`enterProject`、`listSeats`、`claimSeat`
  一個都不用改）
- **AND** `tests/api-operations-coverage.test.ts` SHALL 全綠（執行期送出的路徑不變）
