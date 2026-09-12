## Context

見 proposal.md〈Why〉。這裡只記會影響實作與驗收的事實（2026-09-12，main = `4c43579` 量的）：

- `src/` 裡 import `@/realtime/client` 的只有兩個：`src/world/RemoteWorld.tsx:5`（值）、
  `src/world/PositionSync.tsx:6`（`import type`）。`tests/` 底下五個檔案 import 值。
- `src/config/env.ts` 零 import。`src/api/contract/` 對外只 import `zod`。
- 同時 import `@/config/env` 與契約的：`src/api/transport.ts`（REST）、`src/realtime/client.ts`（WS）。
  另有 `src/server/{realtime,session,db}.ts` import `@/config/env`（伺服器端，不在任何一條限制裡）。
- **實測**：對 `src/api/contract/rest.ts` 餵 `process.env.NEXT_PUBLIC_X`，現在 lint **不報**（見 D3）。

## Goals / Non-Goals

**Goals**
- 三條 import 邊界從「現況」變成「不這樣寫會變紅」，正式碼零行
- 兩份 ADR 的狀態欄有一條 `tests/` 底下的證據可以指

**Non-Goals**：見 proposal。

## D1｜靜態 import 用 core `no-restricted-imports`（patterns＋regex，逐條 `allowTypeImports`），動態的用 `no-restricted-syntax` 補

兩份 ADR 寫的是 `no-restricted-imports`；第一版 design 選了 `no-restricted-syntax` selector，
兩位審查者一致指出兩個理由站不住（`allowTypeImports` 可以逐條 pattern 設；flat config 的覆蓋
問題兩種規則都有，D3 就是在處理它），並且一位建議改用 `eslint-plugin-import` 的
`no-restricted-paths`。**沒有裁決，去量了**（`lintText` 帶虛擬路徑，2026-09-12，記在 PR 內文）：

| 寫法 | `import/no-restricted-paths`（含 typescript resolver 設定） | core `no-restricted-imports` patterns.regex | `no-restricted-syntax` |
|---|---|---|---|
| `import { X } from '@/realtime/client'` | **不報**（`@/` 別名解析不到） | 報 | 報 |
| `import type …`／`import { type … }` | 報（分不出 type） | 可逐條 `allowTypeImports` | 可用 `importKind` |
| `import * as`／`export { } from`／`export * from` | 報（相對路徑）／不報（別名） | 報 | 報 |
| `import x = require()` | **不報** | 報 | 要另寫 `TSImportEqualsDeclaration` |
| `await import('…')`／`require('…')` | 報（相對路徑）／不報（別名） | **不報** | 報（`ImportExpression > Literal`、`CallExpression[callee.name='require'] > Literal`） |
| `../../realtime/client`、`.ts` 副檔名 | 報 | 報（regex） | 報（regex） |
| `import { X } from '@/realtime'`（barrel） | 不報 | 不報 | 不報 |

結論：
- **`no-restricted-paths` 出局**：這個 repo 裡它解析不了 `@/` 別名（就算加了 resolver 設定），
  而 repo 的 import 幾乎全用別名；分不出 type import；漏 `import x = require()`。
- **core `no-restricted-imports`** 拿下靜態的全部（含 `import x = require()`），
  `patterns: [{ regex, message, allowTypeImports }]` 一條一個 type 政策 —— 這正是 D2 要的不對稱。
- **`no-restricted-syntax` 只補動態兩種**（`import('字面')`、`require('字面')`），兩個 selector。
- **barrel 沒有規則直接擋**，改成擋源頭：`src/realtime/**` 裡 `./client` 的值 import／再匯出（S06）。

**覆蓋問題的處理**：三組 restriction 各做成常數陣列（`CLIENT_IMPORT_PATTERNS`、
`ENV_TO_API_PATTERNS`、`CONTRACT_TO_CONFIG_PATTERNS`），HTTP client 那串也抽成 `HTTP_CLIENT_PATHS`。
每個 override 區塊**只決定組合哪幾組**，不重抄內容：

| 區塊 | `no-restricted-imports` | `no-restricted-syntax` 加的 |
|---|---|---|
| `src/**`（除 RemoteWorld、`src/api/**`） | HTTP ＋ client | 動態 client |
| `src/world/RemoteWorld.tsx` | HTTP | — |
| `src/realtime/**` | HTTP ＋ client ＋ `./client`（值） | 動態 client、動態 `./client` |
| `src/config/env.ts` | HTTP ＋ client ＋ env→api | 動態 client、動態 env→api |
| `src/api/contract/**`（原本整條 off） | contract→config（HTTP 維持 off：這裡本來就是 fetch 的家） | 動態 contract→config ＋ D3 補回的 FE-O09 三條 ＋ OUTPUT_SAFETY ＋ LIMITS（限 rest/ws） |

**regex 的形狀**（字串比對，閉集）：client 是 `(^|/)realtime/client(\.tsx?)?$`；
`src/realtime/**` 內部另加 `^\./client(\.ts)?$`；env→api 是 `^@/api/|(^|/)\.\./api/`；
contract→config 是 `^@/config/|(^|/)\.\./config/`。

代價：不解析檔案系統，所以閉集以外的寫法（變數路徑、字串拼接）擋不住 —— Non-goals 明寫。

## D2｜0006 放行 type import，0005 不放行 —— 而且 0005 的 Requirement 明寫「編譯期相依」

`realtime-client`：型別拿不到訊息。`PositionSync.tsx` 今天 `import type { RealtimeClient }`
是為了函式簽章，擋掉它等於逼它改成 `unknown`，換不到任何保護。兩位審查者都同意。

`runtime-config`／`api-contract`：一位審查者指出「生命週期不同」推不出「type 也要擋」——
type import 在執行期不耦合，要擋就得在 Requirement 明說政策是**編譯圖完全分離**，
不能從 ADR 的敘述自行推導。採納：兩條 Requirement 的字面改成「MUST NOT 有編譯期相依」。
理由仍然是 0005 的：契約改名的 PR 不該動到 `env.ts`。今天兩邊都是零 import，沒有用例要犧牲；
審查者舉的可能用例（branded primitive、共享 `Brand` 型別）現在不存在，要用的時候開 spec PR 說用例。

## D3｜順路補回 FE-O09 在 `rest.ts`／`ws.ts` 上的洞

`CONTRACT_SCHEMA_PATHS` 那個區塊（FE-O06）只列了 LIMITS 那一條 selector，整條取代了前面
`src/**` 區塊的 `no-restricted-syntax`，所以 `rest.ts`／`ws.ts` 讀 `process.env` 不會被擋。
`FE-O09-S01` 的字面是「`src/` 底下該模組以外的任何檔案」，這兩個檔案是它的無聲例外。

做法：那個區塊改成帶著 `ANY_PROCESS_ENV`／`COMPUTED_PROCESS_ENV`／`ALIASED_PROCESS_ENV`
＋ `OUTPUT_SAFETY` ＋ LIMITS ＋ 本 change 的 contract 邊界 selector。這跟 `SAFE_EXTERNAL_LINK`
那個 override 的做法一樣（「這個 override 帶著除了那一條以外的全部」）。
測試裡加一條標 `FE-O09-S01` 的斷言釘住它 —— 它對應的是既有 Requirement，不在 delta 裡重寫。

**這不是範圍蔓延**：不動這個區塊就加不了 contract 那條規則；動了就會看到這個洞。

## D4｜訊息要說「為什麼」，不只說「不准」

三條 message 各自指回 ADR 與 capability：
- client：「即時訊息只有一條路：`RemoteWorld` → `realtime-protocol` 驗證 → 下游。別處拿到 client 就是第二條路。見 `docs/adr/0006`。」
- env→api：「設定模組不依賴契約 —— 換後端位址與後端改形狀是兩個變更理由。見 `docs/adr/0005`。」
- contract→config：「契約不知道後端在哪；接兩邊的是 `src/api/transport.ts`／`src/realtime/client.ts`。見 `docs/adr/0005`。」

## D5｜驗收是突變，不是全綠

實作 PR 要做、而且寫進 PR 內文：
1. 在 `src/world/PositionSync.tsx` 把 `import type` 改成值 import 並 `new RealtimeClient(…)`
   → `npm run lint` 紅，**而且紅的訊息是 D4 的第一則**
2. 把 `CLIENT_IMPORT_PATTERNS` 從各區塊拿掉 → `FE-O21-S01`／`S03`／`S06` 紅，`S04`／`S05` 不紅
3. 把 contract 區塊補回的 `ANY_PROCESS_ENV` 拿掉 → 標 `FE-O09-S01` 的那條新斷言**必然**紅
   （一位審查者指出：不要求「只有它紅」—— `tests/env-lint-rule.test.ts` 裡其他 FE-O09 案例
   走的是別的區塊，理論上不受影響，但那不是這條突變要證明的事）

## 待答問題

- 無。三條規則的常數都是路徑，沒有要量的數字。
