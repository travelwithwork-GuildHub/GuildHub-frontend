# design：fe-n08-room-ticket-in-memory

## D1 權威放記憶體，不放 sessionStorage

**決定**：這一場的票權威是模組級 `Map<string, string | null>`；`sessionStorage` 只在「重整後撿回票」時被讀。

**為什麼**：`sessionStorage` 在真實瀏覽器會被擋（隱私擴充、站台儲存設定、部分無痕），cookie 沒被擋 ——
所以「`/enter` 成功但存票失敗」是真實且成群發生的狀態（2026-09-22 一整隊只有無痕能進）。
把「進得了房」綁在一個會被使用者環境擋掉的 API 上，等於把可用性交給使用者的瀏覽器設定。
記憶體是 JS 一定寫得進的地方，把它當權威 → storage 被擋不再等於進不了房。

**代價（明寫在規格，不藏）**：重整（記憶體清空）後才靠 storage 撿票，storage 被擋就撿不回 → 回大廳重拿。
storage 被擋時另一個分頁／新視窗沒有這份 `Map`、接不了票。兩者都遠優於「整隊只有無痕能進」。

## D2 墓碑：丟票不靠 storage 刪得掉

**決定**：`dropRoomToken` 在記憶體放 `null`（墓碑），`heldRoomToken` 讀到墓碑回 `null` 且**不回頭問 storage**。

**為什麼**：原本的三態回傳（`held`／`unknown`）是要防「`removeItem` 失敗、舊票殘留在 storage、被拿去撞握手」。
記憶體墓碑用更強的方式保證這件事：即使 storage 刪不掉、殘留舊票，這一場之後 `heldRoomToken` 也回 `null`。
所以 `dropRoomToken` 一律回 `dropped`，「storage 刪不掉」不再是要擋「重新輸入密碼」的理由（那一步反轉了，見 S18）。

## D3 兩個能力的 delta 形狀（與 codex 一致）

- **A. `world-scenes`〈票由前端持有，鍵含身分，不進網址〉→ MODIFIED**：標題未變（票仍由前端持有、鍵含身分、不進網址），
  只改 prose 的持有模型，並新增一條 scenario 描述「storage 被擋這一場仍持有、重整後才沒票」。
- **B. `room-entry-gate`〈成功先存票再進房；票存不進去就不算成功；有票的人不再被問〉→ REMOVED + ADDED**：
  標題裡「**票存不進去就不算成功**」是明確且被反轉的產品承諾（storage 存不進現在照樣成功）。
  OpenSpec 的 MODIFIED 要逐字對上標題、不能改標題；改標題只能 REMOVED + ADDED。
  codex 也確認：把那句重新詮釋成「拿不到有效票就不算成功」是**不誠實**的——會誤導讀者與 archive 歷史。

## D4 scenario ID 計畫（退役 ID 不得改義重用）

**A（`world-scenes`，MODIFIED，不退役任何 ID）**
- `FE-V01-S14`：語意未變（重整仍在房間／沒票回大廳／票不進網址），沿用；只在 GIVEN 註明「重整後記憶體是空的新一場，讀取從 storage 撿回」。
- `FE-V01-S22`：**新增**。storage 被擋這一場仍持有（記憶體）、重整後才沒票、墓碑蓋過 storage 殘留。
  取 `FE-V01` 家族下一個未使用號碼 —— live spec 用到 S19、未封存的 `fe-v01-room-exit` 佔了 S20/S21，故 **S22**（不是 codex 憑印象說的 S15，那個早被佔）。

**B（`room-entry-gate`，REMOVED 退役 S06/S07/S11/S14/S15，ADDED 重列）**
- `FE-N08-S06`／`S07`／`S11`／`S15`：**核心語意未變**，在 ADDED 需求沿用同一 ID（退役後同義重用是允許的）。
  只更新與「storage＝權威」綁死的斷言字眼（改為以 `heldRoomToken` 為準）。
- `FE-N08-S14`：核心語意就是「storage 寫入失敗不可進房」，**已反轉**，退役、**MUST NOT 重用**。
  反轉後的新行為（storage 失敗照進、只有空 `room_token` 擋）→ 新 ID **`FE-N08-S17`**。
- `FE-N08-S18`：**新增**。丟票即使 `removeItem` 失敗，記憶體墓碑令 `heldRoomToken` 回 `null`、視窗照開、舊票不可用
  （從舊 S11 裡那段反轉的子斷言獨立出來，給新 ID —— 舊 S11 的主語意「被拒後確認才丟票重輸」未變、沿用）。

## D5 實作邊界（codex 審過的坑，逐條確認）

- `Map.has(key)` 區分「未見過」與墓碑 `null` —— 不能只用 `get`（否則墓碑跟未見過都回 `undefined`）。✅ 已如此。
- `getItem`／`setItem`／`removeItem` 各自包在 `withStorage` 的 try 裡，取得 `window.sessionStorage` 本身也可能拋。✅
- 空或不合法 `room_token`（`''`）MUST NOT `hold` —— 這才是仍應擋進房的失敗（`RoomPasswordDialog` 在 `hold` 前擋掉）。✅
- 同一分頁換 scene **不**清空 `Map`（換場景不該掉票）—— `Map` 是模組級、只有測試專用的 `__resetRoomTokenMemory` 清它。✅
- SSR：這些函式只在 `'use client'` 元件的 event/effect 呼叫；server 端不會走到（真要誤用，`withStorage` 取 `window` 會拋被接住，
  `Map` 也不會被 hold 寫入）。維持現狀不加 `typeof window` 守衛，避免為理論路徑增加分支；註解已標明只在 client 用。
