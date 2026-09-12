## Applicability

權限：不適用 —— 本 change 不做授權判斷。
併發：不適用 —— lint 規則是靜態分析，沒有執行期狀態。
持久資料相容性：不適用 —— 不讀寫持久資料。
失敗路徑：適用 —— 「失敗」就是 lint 回報錯誤；Scenario 同時寫要報的與不能報的。
測試連到什麼：不適用 —— 測試用 ESLint 的 `lintText` 帶虛擬檔案路徑，不建檔案、不連任何外部服務。

## ADDED Requirements

### Requirement: 契約不 import 設定

`src/api/contract/` 底下的任何檔案 MUST NOT import `src/config/` 底下的任何模組，
**包含 type-only import**，且這條限制 SHALL 由 lint 規則強制。

契約是「請求與回應必須長成的樣子」，它不知道也不該知道後端在哪（`docs/adr/0005`）。
今天 `src/api/contract/` 對外只 import `zod`；這條把現況變成義務。

**把「在哪」接到「長什麼樣」上的是兩個傳輸通道**：`src/api/transport.ts`（REST）與
`src/realtime/client.ts`（WS）。它們同時 import 兩邊是設計，**不在限制範圍內**。
限制範圍是 `src/api/contract/` 這個目錄，不是整個 `src/api/`。

限制涵蓋 `@/config/…` 別名與 `../../config/…` 相對路徑，以及具名 import、
`import * as`、再匯出、動態 `import()`、`require()`。

#### Scenario: [FE-O21-S05] contract 底下 import 設定（含 type），lint 擋下；transport 不報

- **WHEN** 對 `src/api/contract/rest.ts` 跑 lint，內容 `import { restBase } from '@/config/env'`
- **THEN** 回報這條規則的錯誤，訊息說明契約不得依賴設定、傳輸層才是接兩邊的地方
- **AND WHEN** 內容改成 `import type { AppEnv } from '../../config/env'`
- **THEN** 同樣回報
- **AND WHEN** 對 `src/api/contract/limits.ts` 跑同樣的內容
- **THEN** 同樣回報 —— 限制是整個目錄，不只 `rest.ts`／`ws.ts`
- **AND WHEN** 對 `src/api/transport.ts` 跑 lint，內容同時 import `@/config/env` 的值與
  `@/api/contract/rest` 的值
- **THEN** 不回報這條規則的錯誤
