## Why

`src/api/` 現在是空的，而 W2 之後的每一項功能都要讀寫資料。第一個寫資料存取的人會在
元件裡開一個 `fetch`、順手把 `display_name` 的長度上限打成 `20`，第二個人在另一個檔案
再打一次 —— 到了 `FE-O08` 要切到真後端時，那不是切換，是重寫。

**不做會發生的具體事情**：真後端的長度規則**只寫在資料庫**（`sql/001_schema.sql`），
應用層刻意不檢查，所以**超長欄位回 500 而不是 422**（`API-前端整合指南.md` §8）。
沒有一份會擋長度的契約，使用者打太長的自我介紹就會拿到一個看不懂的伺服器錯誤，
而前端沒有任何地方攔得住它。

`FE-O01` 是 W1 里程碑的後半句：「把**唯一一份契約**與 adapter 切換做好 ——
之後所有功能都建在它上面」。W2 的 `FE-O03` 本地後端、`FE-O05` 契約測試在結構上
都站在它上面：`FE-O05` 的定義是「同一組測試對 `local` 與 `guildhub` 各跑一次」，
沒有這一份契約，那組測試沒有東西可以對。

## What Changes

- 新增 `src/api/contract/`：用 Zod 定義真後端**現有 16 個 REST 端點**的輸入與輸出，
  以及 **WebSocket 協定 v1** 的兩個訊息集合。這是系統裡唯一一份，別處不得再定義。
- 新增 `src/api/contract/limits.ts`：長度與範圍限制的**單一常數表**
  （`display_name` 1–20、`bio` ≤300、訊息 `body` 1–2000、狀態文字 ≤12、`seat_index` 0–7）。
  來源是 `sql/001_schema.sql` 與 `presence.py`，不是任何散文複述。Zod schema 由這份表建。
- 新增 `src/api/contract/schema.d.ts`：由 `npx openapi-typescript` 從真後端
  `/openapi.json` 產出，**進版控**。它不是型別來源，是**漂移哨兵** —— 見下一條。
- 新增型別層的相等斷言：`z.infer<typeof X>` 必須與 `components['schemas']['X']` 完全相同，
  外加一份**實體登錄表**與一條涵蓋率斷言（登錄表的鍵必須剛好等於後端的實體集合）。
  後端欄位改了、或**新增／刪除一個實體**，重產之後 **typecheck 會紅**。
  沒有涵蓋率那一條的話，把所有相等斷言刪光 typecheck 照樣是綠的。
- WS 的 client→server 與 server→client 是**兩個各自獨立的 discriminated union**，
  不是一個。`status` 與 `chat` 在兩個方向都存在但形狀不同，`t` 不是全域唯一的判別鍵。
- 錯誤 envelope：`{ detail: string | ValidationError[] }`，**只涵蓋 JSON 的錯誤回應**。
  實測 500 回的是 `text/plain` 的 `Internal Server Error`，不是 JSON —— 契約明寫它
  不屬於這個 envelope。**只定義線路上的形狀，不定義處置、不列舉 status code**（那是 `FE-X03`）。

### 不做什麼（Non-goals）

這份是契約定義，不是資料存取。以下每一條都是**別的工作項目**，這一刀不碰：

- **不做任何網路呼叫。** 沒有 `fetch`、沒有 client、沒有 adapter —— 那是 `FE-O02`。
- **不做 Route Handler、不碰資料庫** —— `FE-O03`／`FE-O04`（W2）。
- **不寫契約測試、不對真後端跑任何一輪** —— `FE-O05`（W2）。
  這一刀只驗契約自己（Zod 的行為、型別斷言、常數表），不驗後端符不符合契約。
- **不把限制值接到 UI。** maxlength 屬性、剩餘字數、送出鈕禁用是 `FE-O06`（W2）。
  這一刀只保證那些數字有一個可以被讀出來的來源。
- **不定義錯誤的處置。**「401 要導向登入」「409 要重拉座位圖」是 `FE-X03`（W2）
  的唯一一份錯誤語彙。這一刀只描述線路上長什麼樣。
- **不涵蓋 Role / Application / Invitation / Offer。** 真後端沒有這些端點（`BE-G10`），
  對應的產品能力排在 W6–W9。照 `FE-O03` 那列的原則「產品操作隨各能力追加」，
  它們由各自的工作項目在自己那一週加進這份契約。
- **不定義 `avatar_id` 的語意。** 它是不是六維設定的編碼欄位是 `BE-G04`，**待裁決**。
  契約只記錄它是一個 `smallint`。

## Capabilities

### New Capabilities
- `api-contract`: 前端與後端之間資料形狀的唯一定義 —— REST 的實體與操作、
  WebSocket 兩個方向的訊息集合、長度與範圍限制、錯誤 envelope，
  以及一個會在後端漂移時讓 typecheck 變紅的哨兵。

### Modified Capabilities

（無。這是一個新 capability，不改動任何既有 spec 的 Requirement。）

## Impact

- 新增 `src/api/contract/**`。`src/api/` 目前是空目錄，沒有既有程式碼被改動。
- 新增相依 `zod`（執行期驗證要用）。
- `package.json` 新增一個產 `schema.d.ts` 的 script。
  ⚠️ `openapi-typescript@7.13.0` 的 peer 是 `typescript@^5.x`，本 repo 釘死
  `typescript@6.0.3`，**裝不進 devDependencies**。取捨寫在 `design.md`。
- 產 `schema.d.ts` 要有一份跑著的真後端（`~/Desktop/workshop/fergus/GuildHub-backend`
  的 `./run.sh`）。**那是開發者自己起的一份**，不是共用實例；而且不進 CI ——
  CI 只驗已經進版控的那份產物。
- 不影響 `/world` 的任何現有行為。
