## Applicability

權限：不適用 —— 本 change 不做授權判斷。
併發：不適用 —— lint 規則是靜態分析，沒有執行期狀態。
持久資料相容性：不適用 —— 不讀寫持久資料。
失敗路徑：適用 —— 「失敗」就是 lint 回報錯誤；每條 Scenario 同時寫要報的與不能報的。
測試連到什麼：不適用 —— 測試用 ESLint 的 `lintText` 帶虛擬檔案路徑，不建檔案、不連任何外部服務。

## ADDED Requirements

### Requirement: 只有 RemoteWorld 可以 import client 的值

`src/` 底下，`src/world/RemoteWorld.tsx` SHALL 是**唯一**可以 import `src/realtime/client`
輸出的**值**（`RealtimeClient`、`RealtimeError`、`connectionUrl`，以及未來新增的任何值）的檔案。
其他任何 `src/` 底下的檔案 MUST NOT 這樣做，且這條限制 SHALL 由 lint 規則強制。

限制涵蓋**指向該模組的每一種 import 寫法**：具名 import（含 `as` 改名）、
`import * as`、再匯出（`export … from`、`export * from`）、動態 `import()`、
以及 `require()`；路徑寫法涵蓋 `@/realtime/client` 別名、任何以 `/realtime/client`
結尾的相對路徑、與 `src/realtime/` 內部的 `./client`。

**Type-only import 放行**（`import type { … }` 與 `import { type … }` 兩種寫法）——
型別不會收到訊息，`src/world/PositionSync.tsx` 今天就是這樣用的。

**例外是完整路徑，不是萬用字元**：`src/components/world/RemoteWorld.tsx` 這種
多一層目錄的同名檔案不是例外。

這條規則鎖的是**誰能拿到 client**，不是「拿到之後有沒有先驗證」——
後者是 `RemoteWorld` 內部的事，由 review 守，本 Requirement 不宣稱做到。
`tests/` 不在限制範圍內：單元測試與 itest 本來就要直接建立 client。

#### Scenario: [FE-O21-S01] RemoteWorld 以外的 src 檔案 import client 的值，lint 擋下

- **WHEN** 對一個位於 `src/` 底下、不是 `src/world/RemoteWorld.tsx` 的檔案跑 lint，
  內容 import `@/realtime/client` 的 `RealtimeClient` 並 `new` 它
- **THEN** 回報**恰好一則**這條規則的錯誤，訊息說明只有 `RemoteWorld` 可以拿到 client、
  即時訊息要先過 `realtime-protocol` 的驗證
- **AND WHEN** 同一個檔案改成 `import * as`、`export { RealtimeClient } from`、
  `export * from`、`await import('@/realtime/client')`、`require('@/realtime/client')`
  之中的任何一種
- **THEN** 每一種都回報這條規則的錯誤
- **AND WHEN** 路徑改寫成 `../realtime/client`
- **THEN** 同樣回報

#### Scenario: [FE-O21-S02] type-only import、RemoteWorld 本身、tests 底下都不報

- **WHEN** 對 `src/world/PositionSync.tsx` 跑 lint，內容是
  `import type { RealtimeClient } from '@/realtime/client'`
- **THEN** 不回報這條規則的錯誤
- **AND WHEN** 內容改成 `import { type RealtimeClient } from '@/realtime/client'`
- **THEN** 同樣不回報
- **AND WHEN** 對 `src/world/RemoteWorld.tsx` 跑 lint，內容 import `RealtimeClient` 的值並 `new` 它
- **THEN** 不回報這條規則的錯誤
- **AND WHEN** 對 `tests/realtime-client.test.ts` 跑同樣的內容
- **THEN** 不回報這條規則的錯誤

#### Scenario: [FE-O21-S03] 例外是完整路徑，多一層目錄的同名檔案照樣擋

- **WHEN** 對 `src/components/world/RemoteWorld.tsx` 跑 lint，內容 import `RealtimeClient` 的值
- **THEN** 回報這條規則的錯誤 —— 例外只認 `src/world/RemoteWorld.tsx` 這一個路徑
