## Applicability

權限：不適用 —— 本 change 不做授權判斷。
併發：不適用 —— lint 規則是靜態分析，沒有執行期狀態。
持久資料相容性：不適用 —— 不讀寫持久資料。
失敗路徑：適用 —— 「失敗」就是 lint 回報錯誤；Scenario 同時寫要報的與不能報的。
測試連到什麼：不適用 —— 測試用 ESLint 的 `lintText` 帶虛擬檔案路徑，不建檔案、不連任何外部服務。

## ADDED Requirements

### Requirement: 設定模組不依賴資料層

`src/config/env.ts` MUST NOT 對 `src/api/` 底下的**任何**模組有**編譯期相依** ——
也就是任何形式的 import，**包含 type-only import**，且這條限制 SHALL 由 lint 規則強制。

範圍是整個 `src/api/`，**比 `docs/adr/0005` 的 config↔contract 邊界更寬**，兩個理由分開講：

- `src/api/contract/`：0005 —— 「後端在哪」與「後端長什麼樣」是兩個生命週期不同的變更理由，
  前者每個環境都在變，後者跟著後端版本走。0005 要的是**編譯圖上完全分離**，不只是執行期
  不耦合：設定模組一旦 import 契約的型別，契約改名的 PR 就得動到 `env.ts`。
- `src/api/` 其他（`transport.ts`、`operations.ts`、`scope.ts`）：它們 **import `env.ts`**
  （`transport.ts:2`）。設定模組反過來 import 它們就是循環相依；設定模組是整棵依賴樹的葉子，
  這條把「葉子」寫成義務。

今天 `env.ts` 一個 import 都沒有；這條把現況變成義務。要放寬的時候開 spec PR，屆時要說得出用例。

**比對的是 import 字串**（同 `realtime-client` 那條），閉集：路徑 `@/api/…` 別名與任何深度、
結尾含 `/api/` 的相對路徑；語法涵蓋具名／預設／`import * as`／再匯出／`import x = require()`／
動態 `import('…')`／`require('…')`（後兩者限字面路徑）。

#### Scenario: [FE-O21-S04] env.ts 以任何一種閉集內的寫法 import 契約（含 type），lint 擋下；零 import 不報

- **WHEN** 對 `src/config/env.ts` 跑 lint，內容是下列每一種之一（每一種各跑一次）：
  - `import { Hello } from '@/api/contract/ws'`
  - `import type { Hello } from '@/api/contract/ws'`
  - `import { type Hello } from '@/api/contract/ws'`
  - `import * as ws from '@/api/contract/ws'`
  - `export { Hello } from '@/api/contract/ws'`
  - `export type { Hello } from '@/api/contract/ws'`
  - `import t = require('@/api/transport')`
  - `await import('@/api/transport')`
  - `require('@/api/transport')`
  - `import { restBase } from '../api/transport'`
- **THEN** 每一種都回報至少一則這條規則的錯誤，訊息說明設定模組是依賴樹的葉子、
  不得依賴資料層（契約：變更理由不同；傳輸層：會循環）
- **AND WHEN** 內容是只讀 `process.env.NEXT_PUBLIC_GUILDHUB_REST` 的字面存取、沒有任何 import
- **THEN** 不回報這條規則的錯誤（`FE-O09-S01` 那條也不報）
