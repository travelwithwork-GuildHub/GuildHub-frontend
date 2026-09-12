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

**比對的是 import 字串，不解析檔案系統**（design D1 量過：這個 repo 的 `import/no-restricted-paths`
解析不了 `@/` 別名）。因此涵蓋範圍是下面這個**閉集**，Scenario 逐項釘住；閉集以外的寫法
（把路徑存進變數再 `import(p)`、字串拼接）明寫在 proposal 的 Non-goals，不宣稱擋得住：

- **路徑寫法**：`@/realtime/client`；任何深度的相對路徑，結尾是 `/realtime/client`，
  有沒有 `.ts` 副檔名都算；`src/realtime/` 內部的 `./client`
- **語法**：具名 import（含 `as` 改名）、預設 import、`import * as`、
  再匯出（`export { … } from`、`export * from`）、`import x = require()`、
  動態 `import('…')`（字面路徑）、`require('…')`（字面路徑）

**Type-only 放行**：`import type { … }`、`import { type … }`、`export type { … } from`
三種寫法都不報 —— 型別不會收到訊息，`src/world/PositionSync.tsx` 今天就是這樣用的。

**barrel 擋在源頭**：`src/realtime/` 內部任何檔案（含未來的 `index.ts`）MUST NOT
以值的形式再匯出 `./client`。這樣 `import { RealtimeClient } from '@/realtime'` 拿不到值，
不需要對別名本身再加規則。

**例外是完整路徑，不是萬用字元**：`src/components/world/RemoteWorld.tsx` 這種
多一層目錄的同名檔案不是例外。

這條規則鎖的是**誰能拿到 client**，不是「拿到之後有沒有先驗證」——
後者是 `RemoteWorld` 內部的事，由 review 守，本 Requirement 不宣稱做到。
`tests/` 不在限制範圍內：單元測試與 itest 本來就要直接建立 client。

#### Scenario: [FE-O21-S01] RemoteWorld 以外的 src 檔案以任何一種閉集內的寫法 import client 的值，lint 擋下

- **WHEN** 對 `src/world/PositionSync.tsx` 跑 lint，內容是下列**每一種**寫法之一
  （每一種各跑一次）：
  - `import { RealtimeClient } from '@/realtime/client'`
  - `import { RealtimeClient as C } from '@/realtime/client'`
  - `import C from '@/realtime/client'`
  - `import * as c from '@/realtime/client'`
  - `export { RealtimeClient } from '@/realtime/client'`
  - `export * from '@/realtime/client'`
  - `import c = require('@/realtime/client')`
  - `await import('@/realtime/client')`
  - `require('@/realtime/client')`
  - `import { RealtimeClient } from '../realtime/client'`
  - `import { RealtimeClient } from '../realtime/client.ts'`
- **THEN** 每一種都回報**至少一則**這條規則的錯誤，訊息說明只有 `RemoteWorld` 可以拿到 client、
  即時訊息要先過 `realtime-protocol` 的驗證
- **AND WHEN** 對 `src/world/deep/x.tsx` 跑 lint，內容 `import { RealtimeClient } from '../../realtime/client'`
- **THEN** 同樣回報 —— 相對路徑不限深度
- **AND WHEN** 對 `src/api/operations.ts`、`src/api/transport.ts`、`src/api/contract/rest.ts`、
  `src/server/realtime.ts` 各跑 lint，內容 `import { RealtimeClient } from '@/realtime/client'`
- **THEN** 每一個都回報 —— 這些檔案是 no-fetch 規則的例外區，**不是**這條規則的例外
  （兩位審查者各自指出第一版 design 的區塊表會讓它們漏網）

#### Scenario: [FE-O21-S02] type-only import、RemoteWorld 本身、tests 底下都不報

- **WHEN** 對 `src/world/PositionSync.tsx` 跑 lint，內容是下列每一種之一：
  - `import type { RealtimeClient } from '@/realtime/client'`
  - `import { type RealtimeClient } from '@/realtime/client'`
  - `export type { RealtimeClient } from '@/realtime/client'`
- **THEN** 每一種都不回報這條規則的錯誤
- **AND WHEN** 對 `src/world/RemoteWorld.tsx` 跑 lint，內容 import `RealtimeClient` 的值並 `new` 它
- **THEN** 不回報這條規則的錯誤
- **AND WHEN** 對 `tests/realtime-client.test.ts` 跑同樣的內容
- **THEN** 不回報這條規則的錯誤

#### Scenario: [FE-O21-S03] 例外是完整路徑，多一層目錄的同名檔案照樣擋

- **WHEN** 對 `src/components/world/RemoteWorld.tsx` 跑 lint，內容 import `RealtimeClient` 的值
- **THEN** 回報這條規則的錯誤 —— 例外只認 `src/world/RemoteWorld.tsx` 這一個路徑

#### Scenario: [FE-O21-S06] src/realtime 內部不得以值再匯出 ./client（barrel 擋在源頭）

- **WHEN** 對 `src/realtime/index.ts` 跑 lint，內容 `export { RealtimeClient } from './client'`
- **THEN** 回報這條規則的錯誤
- **AND WHEN** 對 `src/realtime/protocol.ts` 跑 lint，內容 `import { RealtimeClient } from './client'`
- **THEN** 同樣回報
- **AND WHEN** 對 `src/realtime/protocol.ts` 跑 lint，內容 `await import('./client')` 或 `require('./client')`
- **THEN** 同樣回報
- **AND WHEN** 對 `src/realtime/index.ts` 跑 lint，內容 `export type { ConnectionState } from './client'`
- **THEN** 不回報 —— 型別放行的規則在這裡一樣適用
