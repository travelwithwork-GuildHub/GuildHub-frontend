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

## D1｜用 `no-restricted-syntax` 的 selector，不用 `no-restricted-imports`

兩份 ADR 寫的是 `no-restricted-imports`。實際讀了 `eslint.config.mjs` 之後**不選它**，三個理由：

1. **它已經被用掉了**：`noFetchRules` 用 `no-restricted-imports` 擋 axios／ky 那串 HTTP client，
   而且在 `src/api/**` 整條 `'off'`。flat config 對同名規則是**後者取代前者**，
   為 `src/**` 再設一次就會把 HTTP client 那串蓋掉；要保住就得每個區塊重抄一次。
2. **type import 的差別對待**：`realtime-client` 那條要放行 `import type`，
   `runtime-config`／`api-contract` 兩條要連 type 一起擋。`no-restricted-imports` 的
   `allowTypeImports` 是整條規則一個開關，做不到「同一個檔案兩種政策」。
3. **repo 已有同型的先例**：`ERROR_BOUNDARY`（FE-X03-S16）就是用
   `ImportDeclaration[source.value=…] ImportSpecifier` 這種 selector 擋 import，
   三種寫法（具名、namespace、再匯出）都列了。照它寫，review 的人不用學第二種形狀。

代價：selector 比 `paths:` 囉嗦；`source.value` 用 regex 對字串，**不解析路徑**——
所以 Requirement 把涵蓋的路徑寫法列成閉集（別名、`/realtime/client$`、`src/realtime/` 內的 `./client`），
沒列的（`import(p)` 變數、字串拼接）明寫在 Non-goals。

**每一條 selector 的形狀**（三條規則共用，只換 source regex 與 message）：

| 寫法 | selector 形狀 |
|---|---|
| 具名／預設 import（值） | `ImportDeclaration[importKind!='type'][source.value=/…/] > ImportSpecifier[importKind!='type']`，加 `ImportDefaultSpecifier` |
| `import * as` | `ImportDeclaration[importKind!='type'][source.value=/…/] > ImportNamespaceSpecifier` |
| 再匯出 | `ExportNamedDeclaration[exportKind!='type'][source.value=/…/]`、`ExportAllDeclaration[exportKind!='type'][source.value=/…/]` |
| 動態 import | `ImportExpression > Literal[value=/…/]` |
| `require()` | `CallExpression[callee.name='require'] > Literal[value=/…/]` |

`runtime-config`／`api-contract` 兩條把 `[importKind!='type']`／`[exportKind!='type']` 拿掉就是連 type 一起擋。
**兩條 type 政策不同是刻意的**，見 D2。

## D2｜0006 放行 type import，0005 不放行

`realtime-client`：型別拿不到訊息。`PositionSync.tsx` 今天 `import type { RealtimeClient }`
是為了函式簽章，擋掉它等於逼它改成 `unknown`，換不到任何保護。

`runtime-config`／`api-contract`：0005 的邊界是「兩個生命週期不同的變更理由不要綁在一起」，
而 type import 是編譯期依賴 —— 契約的型別改名，`env.ts` 就要跟著動。今天兩邊都是零 import，
**沒有任何合法用例要犧牲**，所以取最嚴的。要放寬的時候再開 spec PR，屆時要說得出用例。

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
2. 把 `eslint.config.mjs` 裡 client 那組 selector 拿掉 → `tests/boundary-lint-rule.test.ts`
   裡 `FE-O21-S01` 紅、其他不紅
3. 把 `CONTRACT_SCHEMA_PATHS` 區塊的 `ANY_PROCESS_ENV` 拿掉 → `FE-O09-S01` 那條斷言紅

## 待答問題

- 無。三條規則的常數都是路徑，沒有要量的數字。
