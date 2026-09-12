## Applicability

權限：不適用 —— 本 change 不做授權判斷。
併發：不適用 —— lint 規則是靜態分析，沒有執行期狀態。
持久資料相容性：不適用 —— 不讀寫持久資料。
失敗路徑：適用 —— 「失敗」就是 lint 回報錯誤；Scenario 同時寫要報的與不能報的。
測試連到什麼：不適用 —— 測試用 ESLint 的 `lintText` 帶虛擬檔案路徑，不建檔案、不連任何外部服務。

## ADDED Requirements

### Requirement: 設定模組不 import 契約

`src/config/env.ts` MUST NOT import `src/api/` 底下的任何模組，**包含 type-only import**，
且這條限制 SHALL 由 lint 規則強制。

「後端在哪」與「後端長什麼樣」是兩個生命週期不同的變更理由（`docs/adr/0005`）：
前者每個環境都在變，後者跟著後端版本走。設定模組一旦 import 契約 —— 就算只是型別 ——
換一份後端位址的 PR 就會跟後端形狀的改動綁在同一個編譯單元上。
今天 `env.ts` 一個 import 都沒有；這條把現況變成義務。

限制涵蓋 `@/api/…` 別名與 `../api/…` 相對路徑，以及具名 import、`import * as`、
再匯出、動態 `import()`、`require()`。

#### Scenario: [FE-O21-S04] env.ts import 契約（含 type），lint 擋下；零 import 不報

- **WHEN** 對 `src/config/env.ts` 跑 lint，內容 `import { Hello } from '@/api/contract/ws'`
- **THEN** 回報這條規則的錯誤，訊息說明設定模組不得依賴契約、理由是兩者的變更理由不同
- **AND WHEN** 內容改成 `import type { Hello } from '@/api/contract/ws'`
- **THEN** 同樣回報 —— 這條跟 `realtime-client` 那條不同，型別也算依賴
- **AND WHEN** 內容改成 `import { restBase } from '../api/transport'`
- **THEN** 同樣回報
- **AND WHEN** 內容是只讀 `process.env.NEXT_PUBLIC_GUILDHUB_REST` 的字面存取、沒有任何 import
- **THEN** 不回報這條規則的錯誤（`FE-O09-S01` 那條也不報）
