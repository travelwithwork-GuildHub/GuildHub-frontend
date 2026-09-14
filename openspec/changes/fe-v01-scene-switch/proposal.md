## Why

`docs/WBS.md` 的 `FE-V01`：「場景註冊、入口、Transition、Loading、返回。**Guild Hall ↔ Project Room 是真的伺服器 scene**（關掉舊連線、帶 room token 重開）」。W4 的三個項目都站在它上面：`FE-N08` 房間門禁要有「拿到 token 之後**進去**」這個動作可以呼叫；`FE-W16` Project Room 的桌面配置要有一個「房間場景」可以擺；`FE-J13` 座位要在房間裡才有意義。

今天的世界只有一個場景，而且那件事**散在四個地方**，沒有一個地方叫「場景」：

- `src/app/world/WorldGate.tsx` 寫死 `const SCENE = 'lobby'`
- `src/world/RemoteWorld.tsx` 建 `RealtimeClient` 時不給 `scene`（預設 `lobby`）
- `src/world/environment/WorldShell.tsx` 直接掛 `<GuildHall />`；`WorldCanvas` 直接掛走廊的門、看板、門標籤
- `src/world/player/LocalPlayer.tsx` 直接 import `guildHallLayout` 的 `SPAWN`

再加一個場景的話，這四處各要長一個 `if`。**這個 change 把「現在在哪個場景」收成一份資料、一個入口**，並把 Guild Hall ↔ Project Room 這一組真的伺服器 scene 切換做出來（含過場、失敗、返回）。

**以 `protocol.py`／`scenes.py`／`manager.py` 為準，不是以文件敘述為準**（`CONTEXT.md`〈後端在哪〉）。實際讀到的三件事決定了這份規格的形狀：

1. `scenes.py:11`：scene id 只有 `lobby` 與 `room:<id>`；`add_member()` 的 docstring：「一條連線只屬於一個 scene。切換場景 = 關掉重開」。**沒有 switch 訊息。**
2. `manager.py:71-79`：`room:` 才驗 token；簽章不合、`project_id` 不合、持有人不是自己 → 在 `accept()` 之前 close。客戶端看到的是 `code=1006`、`opened=false`（`realtime-client` 那條已經量過），**分不出原因**。
3. `presence.py:41-47`：`_players` 是**單一** `dict[user_id, Player]`，`join()` 直接覆蓋。同一個帳號在分頁 A 連 `lobby`、分頁 B 連 `room:x`，A 的 `Player.scene` 會被改成 `room:x`（A 從大廳的 snapshot 消失、A 的移動被記到房間），B 斷線時 `disconnect()` 只查同 scene 的其他連線 → `presence.clear()` 把 A 整個清掉。**「同一個人在兩個 scene 各連一條是合法的」（`src/realtime/tabLease.ts:84` 的註解）是錯的** —— 它是 `BE-G31` 的另一個入口。

**跟 `BE-G09` 的關係**：`BE-G09` 裁決的是 Marketplace／Office 要「視覺分區」還是「伺服器 scene」。**這個 change 不碰那個問題** —— Guild Hall 就是 `lobby`、Project Room 就是 `room:<id>`，兩個都是後端**已經存在**的 scene（`CONTEXT.md`〈場景〉那張表的前兩列）。`progress.sh --blocked` 也沒把 `FE-V01` 列在 `BE-G09` 之後。這份規格**不定義**「視覺分區」這個概念，也不為 `FE-W17`／`FE-V11`／`FE-V12` 預留任何欄位。

**不做會怎樣**：`FE-N08` 拿到 token 之後沒有地方可以放；`FE-W16` 的桌子只能擺進 Guild Hall；或者三個 change 各自長一個「換場景」—— 而「舊連線關乾淨再開新的」這件事（`FE-R01-S05`）每一份都要重做一次、每一份都可能漏。

## What Changes

- **新 capability `world-scenes`**：
  - 場景是一份封閉的註冊表（`hall`、`room`），每個場景各自宣告伺服器 scene id、配置、出生點；渲染、物理、連線、出生點都從它讀，不各自 `if`
  - 進入房間 ＝ 關掉舊連線、清掉遠端玩家、帶 `room:<id>` 與 token 開新連線；過場期間有畫面上看得到、無障礙樹讀得到的狀態，**Canvas 不重掛**
  - 握手被拒（token 偽造／過期／不屬於自己／房間不存在／後端沒起來，客戶端分不出）→ 回 Guild Hall、告知（不宣稱原因）、**不自動重試、票留著**；10 秒沒 `ready` 同樣處置；回大廳也失敗時不永久 busy
  - 每次過場有代號，遲到的事件不算數；過場只提交一次
  - 返回 Guild Hall：房間裡常駐一顆 DOM 按鈕；瀏覽器上一頁等效
  - 票的持有：`sessionStorage`、鍵含身分（同分頁重新整理仍在房間裡；換帳號讀不到前一個的票），**怎麼拿到票不是這裡的事**（`FE-N08`）；沒票的深連結回大廳並說明
  - **一個身分一條世界連線，不分 scene** —— 分頁資格的鍵只含身分（修掉 `tabLease.ts` 那句錯的註解與 `WorldGate` 的 `/lobby` 後綴）
  - 房間場景在 `FE-W16` 之前的配置：只有地板與邊界牆，形狀沿用 `world-layout`；走廊的門、看板、門標籤、專案清單提示**只在 Guild Hall**
- **`deep-link` 新增一條 Requirement**：`/world?room=<uuid>` 表示所在場景；history 的寫入只有一個入口；canonical 對整段 query 成立；網址在過場開始時 push、失敗時 replace；面板那一層寫網址時 MUST NOT 把 `room` 洗掉（今天 `serializePanelUrl` 產出的是整段 query —— 見 design D2）
- **`world-interactive-objects` 修改一條 Requirement**〈門與看板都註冊進互動系統〉：門有動作了 —— 對著門按 `E` 是「請求進入那間房」；`FE-W12-S16`（按 E 什麼都不發生）的前提補上「沒有票」，ID 與斷言不變
- **`realtime-client` 修改一條 Requirement**〈一條連線只屬於一個 scene〉：換 scene 時新連線要等舊 socket 的 `close` 事件（上限 1 秒）才建 —— 後端 `disconnect()` 只查同 scene 的兄弟連線，新連線先 `join()` 的話被清掉的是新的那個人（見 design D3）；順手改正那條的理由文字（「後端會當成兩個人」是錯的，同一個 `user_id` 是同一個 `Player` 互相覆蓋）。`closeAndEnter()` 的介面不變

## Non-goals（不做什麼）

- **不做房間門禁**（密碼 Modal、`POST /api/projects/{id}/enter`、錯誤回饋）—— 那是 `FE-N08`。這裡只定義「已經持有 token 時怎麼進去」與「沒有 token 時門說什麼」
- **不做 Project Room 的桌面、座位、隊員**（`FE-W16`、`FE-J13`、`FE-V08`）。房間今天是一塊空地板 —— 進得去、走得動、看得到同房的人、出得來
- **不做斷線重連**（`FE-R12`，W5）。握手被拒或逾時是**一次性**的失敗，回大廳；不退避、不重試
- **不做視覺分區、不碰 `BE-G09`**（見上）
- **不改 `protocol.ts`**、不改內部後端的 `/ws` 替身（它已經支援 `room:<uuid>` ＋ HMAC token，`FE-O03-S21`）；`RealtimeClient` 只改「等舊 close 事件」那一件事
- **不在這個 change 改 `docs/WBS.md`**：上面第 3 點的後端缺口（跨 scene 的同一人會被 `disconnect()` 清掉）要另開 `governance/` PR 記成 `BE-G`
- **不把 token 放進網址**。`?token=` 只在 WebSocket 位址上（協定要求），MUST NOT 出現在 `/world` 的網址裡 —— 那會被複製、被貼到聊天室
- **不做離開房間的確認對話框**。回大廳是可逆的（再走到門前）；多一層確認是在懲罰按錯的人
