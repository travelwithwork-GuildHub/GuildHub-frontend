## Why

`src/` 裡目前**沒有任何一處讀 `process.env`**，也沒有 `.env` 範本。下一批要做的
`FE-O02`（adapter 切換）與 `FE-R01`（WebSocket 連線）**第一件事都是決定連到哪裡**。

不做會發生的具體事情，兩件都不是假設：

1. **位址會被寫死。** `AGENTS.md`〈測試環境隔離〉第 1 條是硬規則：
   「測試連到哪裡，由環境變數決定，**不得寫死在測試檔裡**。寫死的位址是最常見的
   失控方式 —— 它在別人的機器上會指到別人的東西。」`CONTEXT.md` 進一步寫著
   `FE-R09` 的 40 連線壓測「足以把同時在用那份後端的人全部踢下線」——
   **那是 repo 自己的判斷，我沒有量過**，但預設值要不要指向共用實例由它決定。

2. **設定寫錯的失敗是無聲的。** 三種都查證過：
   `NEXT_PUBLIC_*` 在建置時被靜態替換，所以**計算屬性存取
   （`process.env[name]`）不會被替換**，在瀏覽器裡得到 `undefined`；
   **漏掉 `NEXT_PUBLIC_` 前綴的變數會被替換成空字串**，不是 `undefined`；
   而位址協定寫錯的錯誤要到連線時才出現，那時它跟「後端沒開」「路徑打錯」
   「握手被拒」**長得一模一樣**（三種實測都是 `close code=1006`、空 reason）。

## What Changes

- 新增 `src/config/env.ts`：**唯一一處讀取環境變數的地方**。匯出後端 REST base
  與 WebSocket URL，以及目前的環境代號。
- 新增 `.env.example`：變數的完整清單與預設值。**預設一律指向本機自己起的那一份**。
- 定義三個環境（`local` / `preview` / `production`）各自的預設與必填規則。
  `local` 有安全的預設值；**`preview` 與 `production` 沒有預設值，缺了就啟動失敗**。
- 匯出 REST 請求的憑證模式常數（`include`），作為**單一來源**。
  「每個 adapter 的請求真的帶上它」屬於 `FE-O02` 的驗收 ——
  這一刀沒有任何資料存取存在，證明不了那件事。

### 不做什麼（Non-goals）

- **不做任何請求。** 沒有 `fetch`、沒有 WebSocket、沒有 client —— 那是 `FE-O02`
  與 `FE-R01`。這一刀只回答「位址是什麼、從哪裡來、預設是誰」。
- **不做 adapter 切換的實作。** 「用 `local` 還是 `guildhub`」那個開關屬於
  `FE-O02`；這裡只提供它要讀的那個變數。
- **不處理跨網域部署的 SameSite / Secure。** 那是同一列的 `W13–W16` 那一格。
- **不宣稱 WebSocket 的 cookie 會送到。** WS 的 `Upgrade` 請求不走 CORS
  preflight，送不送由 cookie 自身的 `SameSite`／`Secure`／`Domain` 決定 ——
  **要實測才知道，那是 `FE-R01`**。
- **不碰 `next.config.ts` 的既有設定**（`agentRules`、`redirects`）。
- **不做部署與 preview 環境的實際建置** —— 那是 `FE-O14`（W5）。
  這一刀只定義那些環境要有哪些變數、缺了會怎樣。

## Capabilities

### New Capabilities
- `runtime-config`: 前端在執行期要連到哪裡、憑證怎麼帶，以及那些值缺席時
  系統該怎麼失敗 —— 集中在一處，預設指向本機，正式環境不給預設值。

### Modified Capabilities

（無。）

## Impact

- 新增 `src/config/env.ts` 與 `.env.example`。
- `.gitignore` 要涵蓋 `.env*.local`（`create-next-app` 的預設已經有，要確認）。
- 不影響 `/world` 的任何現有行為，也不影響已經完成的 `api-contract`
  —— 契約定義形狀，不定義位址。
- 之後 `FE-O02` 與 `FE-R01` 從這裡讀位址，**不得再讀一次 `process.env`**。
