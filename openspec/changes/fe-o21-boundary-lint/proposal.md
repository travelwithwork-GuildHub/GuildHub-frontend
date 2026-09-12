## Why

`docs/adr/0005` 與 `docs/adr/0006` 各記了一條系統邊界，而且各自誠實地寫了它守不住：

- **0005（僅約定）**：`runtime-config`（後端在哪）與 `api-contract`（後端長什麼樣）
  彼此不相依。今天 `src/config/env.ts` 一個 import 都沒有、`src/api/contract/` 對外只
  import `zod` —— 但那是**現況**，誰在 `env.ts` 加一行 `import … from '@/api/contract/…'`
  不會有任何東西變紅。
- **0006（已知缺口）**：進來的即時訊息只有一條路 —— `RealtimeClient.onMessage` 吐的是
  **原始字串**（`src/realtime/client.ts:44`），`src/` 裡唯一訂它的 `src/world/RemoteWorld.tsx:105`
  接法是對的（先 `validate(raw)`），但**沒有東西擋第二個消費者**繞過驗證自己 `JSON.parse`。

兩份 ADR 的〈代價〉／〈補上的方向〉指向同一條最便宜的路：`eslint.config.mjs` 加一段
import 邊界規則、配一條 `lintText` 虛擬檔案的測試，**正式碼零行**。

**不做會怎樣**：兩條邊界繼續靠「大家都這樣寫」。四天的觀察是沒有人繞、也沒有東西擋
（0006 原文）。下一個碰即時訊息的是 `FE-R10`（presence，別人負責）與 `FE-R04`；
下一個碰 `env.ts` 的是任何要加環境變數的人。**繞過的那一刻不會有錯誤訊息** ——
這是 0007 拒絕「一個 store 加一個約定」時用的同一把尺，0006 自己也引用了它。
而且 ADR 明寫：「在那之前不要把這份 ADR 的狀態改掉」—— 不做，兩份 ADR 就永遠停在
「僅約定」與「已知缺口」，`arch-view.sh` 每次都會這樣印。

**為什麼現在做**：它不依賴任何 change 的排程（0006：「方向 3 隨時可以做」），
而 W3 的 `FE-R10` 正在動即時訊息的消費端 —— 規則先在，那個 PR 的 review 就少守一件事。

### 順路發現的一個洞（FE-O09 的既有義務，不是新需求）

寫這份規格時實測了現況：對 `src/api/contract/rest.ts` 餵 `process.env.NEXT_PUBLIC_X`，
**lint 不報**。原因是 `eslint.config.mjs` 為 `FE-O06` 開的那個
`CONTRACT_SCHEMA_PATHS` 區塊整條覆蓋了 `no-restricted-syntax`（flat config 是後者取代
前者，不是合併），把 `FE-O09` 的三個 `process.env` selector 一起丟掉了。
`FE-O09-S01` 的字面是「`src/` 底下該模組以外的任何檔案」—— `rest.ts`／`ws.ts` 是它的
兩個例外，而且無聲。這個 change 動的正是那個區塊，一起補回去（見 design D3）；
它對應的是 `FE-O09` 既有的 Requirement，不在這份 delta 裡再寫一次。

## What Changes

- `realtime-client` 新增 Requirement：`src/` 底下**只有 `src/world/RemoteWorld.tsx`**
  可以 import `src/realtime/client` 的**值**；type-only import 放行；`src/realtime/` 內部
  不得以值再匯出 `./client`（barrel 擋在源頭）；由 lint 強制
- `runtime-config` 新增 Requirement：`src/config/env.ts` MUST NOT import `src/api/` 底下任何模組
  （**含 type import**，理由見 design D2）；由 lint 強制
- `api-contract` 新增 Requirement：`src/api/contract/` 底下 MUST NOT import `src/config/`
  底下任何模組（含 type import）；由 lint 強制。`src/api/transport.ts` 與
  `src/realtime/client.ts` 是兩個傳輸通道，**刻意不在限制範圍內**（0005 的 B 選項）
- `docs/adr/0005`／`0006` 的 `邊界狀態` 改「已強制」、`證據` 改指到那條測試
  （`arch-view.sh` 會驗證據路徑存在且至少一條在 `tests/`）
- **不改任何正式碼。** `RealtimeClient` 的介面、`onMessage` 吐 raw string、
  `realtime-client` 的 Purpose 全部不動

## Non-goals（不做什麼）

- **不做 0006 的方向 1／2**（client 收 validator、或把 raw 改名成 diagnostics）——
  那要改 client 的 Purpose，而且 `FE-R04` 正在動同一個 client；這條路正式碼零行
- **不擋「進了 `RemoteWorld` 之後有沒有先驗證」** —— 它鎖的是 import，那半截仍由 review 守。
  ADR 0006 的〈代價〉已經寫明，這裡不宣稱它做到了
- **不擋刻意的繞法**：把路徑存進變數再 `import(p)`、字串拼接、`require` 動態路徑。
  跟 no-fetch 那條一樣，它擋的是**順手寫下去的那一次**
- **不動 `tests/`** —— 單元測試與 itest 本來就要直接 `new RealtimeClient(`，限制範圍是 `src/**`
- **不引入 `dependency-cruiser` 那種全域 import 圖工具**：三條規則、三個精確路徑，
  repo 既有的 `no-restricted-syntax` 寫法就夠，多一個工具多一份設定會漂
- **不順手修 `openspec/specs/world-physics/spec.md:5` 的 `world-interaction` 打錯字** ——
  `spec/`／`feat/` 分支碰不到 `openspec/specs/`，留給這個 change 的 archive PR

## Capabilities

### New Capabilities

（無）

### Modified Capabilities

- `realtime-client`：新增「只有 `RemoteWorld` 可以 import client 的值」
- `runtime-config`：新增「設定模組不 import 契約」
- `api-contract`：新增「契約不 import 設定」

## Impact

- `eslint.config.mjs`：三組 `no-restricted-imports` pattern 常數＋兩組動態 import selector，
  各區塊只組合不重抄（design D1）；`CONTRACT_SCHEMA_PATHS` 區塊補回 `FE-O09` 的三個 selector（design D3）
- `tests/boundary-lint-rule.test.ts`：新檔，寫法照 `tests/env-lint-rule.test.ts`
  （`lintText` 帶虛擬 filePath、每條自己的逾時）
- `docs/adr/0005-*.md`、`docs/adr/0006-*.md`：只改 `邊界狀態` 與 `證據` 兩行
- 正式碼：**零行**
- 驗收：**把防禦拿掉，測試要變紅** —— 在 `src/world/PositionSync.tsx` 寫
  `new RealtimeClient(`，`npm run lint` 必須紅在**這條規則的訊息**，不是紅在別處
