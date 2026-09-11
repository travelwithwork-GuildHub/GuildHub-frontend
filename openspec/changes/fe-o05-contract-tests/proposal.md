# `FE-O05` 契約測試

## Why

本地後端（`FE-O03`）存在的那一天起，就有兩份「後端」：真的與替身。**沒有任何東西能證明它們一樣** ——
替身的 422 少一個鍵、分頁多回一個 `total`、長度擋在 handler 而不是資料庫，前端在替身上全綠，切到 `guildhub` 才炸。
WBS：「這是唯一能防止本地後端漂走的東西。」

`limits.ts` 的數字是人工從後端 schema 抄的，「沒有任何機器在對它們」（那個檔案自己的註解）。
成對邊界測試對真後端跑一次，就是那台機器。

不做會怎樣：`FE-O03` 之後每一個在替身上開發的能力，銜接時都是一次重寫。

## What Changes

- **唯一一份**契約測試 `tests/contract/**`，同一組對兩個目標各跑一次：`CONTRACT_TARGET=internal`（harness 自己起 `next start`＋可拋棄 Postgres）
  與 `CONTRACT_TARGET=guildhub`（wrapper 自己起 `./run.sh`，DB 指向可拋棄的庫）。**兩邊都走真 HTTP**，不 import Route Handler。
- 契約 client：cookie jar（Node 的 `fetch` 不會自己記 `Set-Cookie`）、**raw request**（不經 `operations.ts` 的 Zod —— 經過的話 `max+1` 在送出前就被擋，永遠看不到後端）。
- **成對邊界從 `limits.ts` 產生**：`max` 接受、`max+1` 拒絕；有 `min` 的加 `min-1` 拒絕。只送超長抓不到收緊。
- 空字串、純空白、Unicode 長度單位（code point，不是 UTF-16 code unit）、`null` 與缺欄、型別強制轉換、status 與 error shape、拒絕後不得部分寫入。
- WS：未知 `t`、浮點座標、超長狀態文字、靜止時封包數為 0 —— 對替身與真後端各跑一次。
- **CI 只跑 `internal`**（`.github/` 的 job 走 `governance/` PR）；`guildhub` 那一輪在本機跑，**只准打自己起的**：位址必須是 loopback，而且 wrapper 持有自己起的 PID。
- **破壞性操作之前先證明連的是可拋棄的那一份**：`internal` 看 `FE-O04` 的標記表；`guildhub` 只在 wrapper 自己起的程序上跑（不接受既有的 8000）。

## ⚠️ 討論談定的取捨

- **不 import Route Handler**：Next 的 method dispatch、dynamic params、cookie 序列化、404／405 只有 HTTP 能覆蓋。快的單元測試（mapper、session 簽章）另放，不叫契約測試。
- **`credentials: 'include'` 不在契約測試裡**：同源的 Route Handlers 分不出呼叫端寫沒寫；那條在 transport 的單元測試已經有了（`FE-O02`），這裡引用不重寫。
- **422 的 `msg` 不逐字比**：Pydantic 的英文訊息不是契約。比 `loc` 的第一段與 `type` 的存在。
- **時間字串逐字比**：`updated_at`／`expires_at` 兩邊都要是 `YYYY-MM-DDTHH:MM:SS.ffffff+00:00` 這種形狀 —— 真後端（asyncpg → Pydantic）的實際輸出在實作時量，寫進 golden。

## ⚠️ 不做什麼

- **SHALL NOT 測 W6+ 的端點**（create／form-team／seats／messages）。它們的邊界（`messageBody`、`seatIndex`）在那些能力的 change 補進同一份表。
- **SHALL NOT 在 CI 跑 `guildhub`。** CI 沒有真後端，也不該有。
- **SHALL NOT 用 `NEXT_PUBLIC_*` 當測試目標的位址**：那是產品的設定，測試用自己的 `CONTRACT_BASE_URL`。
- **SHALL NOT 把限制值的數字寫進測試檔**：全部從 `limits.ts` 來（`FE-O06`）。
