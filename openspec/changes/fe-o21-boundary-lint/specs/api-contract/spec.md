## Applicability

權限：不適用 —— 本 change 不做授權判斷。
併發：不適用 —— lint 規則是靜態分析，沒有執行期狀態。
持久資料相容性：不適用 —— 不讀寫持久資料。
失敗路徑：適用 —— 「失敗」就是 lint 回報錯誤；Scenario 同時寫要報的與不能報的。
測試連到什麼：不適用 —— 測試用 ESLint 的 `lintText` 帶虛擬檔案路徑，不建檔案、不連任何外部服務。

## ADDED Requirements

### Requirement: 契約不 import 設定

`src/api/contract/` 底下的任何檔案（含子目錄）MUST NOT 對 `src/config/` 底下的任何模組有
**編譯期相依** —— 任何形式的 import，**包含 type-only import**，且這條限制 SHALL 由 lint 規則強制。

契約是「請求與回應必須長成的樣子」，它不知道也不該知道後端在哪（`docs/adr/0005`）。
0005 要的是編譯圖上完全分離（理由同 `runtime-config` 那條）。
今天 `src/api/contract/` 對外只 import `zod`；這條把現況變成義務。

**把「在哪」接到「長什麼樣」上的是兩個傳輸通道**：`src/api/transport.ts`（REST）與
`src/realtime/client.ts`（WS）。它們同時 import 兩邊是設計，**不在限制範圍內**。
限制範圍是 `src/api/contract/` 這個目錄，不是整個 `src/api/`。

**比對的是 import 字串**，閉集：路徑 `@/config/…` 別名與任何深度、結尾含 `/config/` 的相對路徑；
語法同 `runtime-config` 那條。

#### Scenario: [FE-O21-S05] contract 底下以任何一種閉集內的寫法 import 設定（含 type），lint 擋下；transport 不報

- **WHEN** 對 `src/api/contract/rest.ts` 跑 lint，內容是下列每一種之一（每一種各跑一次）：
  - `import { restBase } from '@/config/env'`
  - `import type { AppEnv } from '@/config/env'`
  - `import * as env from '@/config/env'`
  - `export { restBase } from '@/config/env'`
  - `import e = require('@/config/env')`
  - `await import('@/config/env')`
  - `require('@/config/env')`
  - `import { restBase } from '../../config/env'`
- **THEN** 每一種都回報至少一則這條規則的錯誤，訊息說明契約不得依賴設定、傳輸層才是接兩邊的地方
- **AND WHEN** 對 `src/api/contract/limits.ts` 與 `src/api/contract/sub/x.ts` 跑
  `import { restBase } from '@/config/env'`
- **THEN** 同樣回報 —— 限制是整個目錄含子目錄，不只 `rest.ts`／`ws.ts`
- **AND WHEN** 對 `src/api/transport.ts` 跑 lint，內容同時 import `@/config/env` 的值與
  `@/api/contract/rest` 的值
- **THEN** 不回報這條規則的錯誤
