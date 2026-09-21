# `FE-K04` 聊天送出上限 500：對齊部署後端的靜默丟棄，別讓訊息人間蒸發

## Why

**部署後端的合約變了，前端的規格還停在舊事實。** 場景聊天的規格（`scene-chat-ui` FE-K04、`scene-chat-transport` FE-R11）目前明文寫「chat body 沒有上限、完整送出」，還有防禦測試（`LIMITS.chatBody = UNBOUNDED`、Zod schema 自省無 length check、FE-K04-S07「2001 code point 完整送出」）。當初這是對的：後端 `protocol.py::ChatIn.body: str` 對 body 完全沒限制。

**但正式部署的閘道（demo 用、已凍結一次部署）在某次 demo-hardening 於 relay 廣播層加了 `len(body) > 500 就丟棄`。** 2026-09-21 對 `wss://gateway-production-3ecd.up.railway.app/ws` 實測（`ws-smoke.mjs`／`ws-boundary.mjs`）：499／500 code point 的 chat 有回聲、**501／502 靜默丟棄**（無回聲、連線不關、無錯誤），邊界正好 500、按 code point。手上的後端 clone 是舊 commit、看不到這段。

**不做會怎樣**：使用者打超過 500 字送出 → 前端照現在的規格「送出成功、清空輸入框」→ 訊息人間蒸發，畫面像壞掉。demo 現場最難看的那種 bug，而後端動不了（凍結、別團隊維運）。這跟 `statusText: {0, 12}`（`presence.py` 對 >12 字狀態的靜默丟棄，前端早就用 `LIMITS` 擋）是**同一種情境、同一種解法**。

## What Changes

- **`LIMITS.chatBody`：`{min:0, max:UNBOUNDED}` → `{min:0, max:500}`**，`LIMIT_SOURCES.chatBody` 改指向「部署閘道 relay 實測 `len(body) > 500` 靜默丟棄」＋實測日期（不再指向不擋長度的舊 clone `protocol.py`）。
- **`SceneChatComposer` 加送出守門**（比照 `LoginForm` 暱稱欄 FE-O06）：隨輸入更新的剩餘字數、超過 500 即時禁用送出、**`submit()` 本身也擋** `violates() === 'too-long'`（不只是禁用按鈕 —— Enter／form submit 仍會觸發）。用 `remaining`／`violates`（**code point**），**不用原生 `maxlength`**。
- **反轉 FE-K04-S07**：從「無 maxlength、2001 完整送出」改成「≤500 原值送出、>500 擋在送出端」；新增 FE-K04-S16（剩餘字數、貼上超長保留全文不截斷、code point 計數、超長是欄位級不是 alert）。
- **只反轉 FE-R11-S09 的 LIMITS 半條**：`chatBody.max` 500、來源改實測；**保留 Zod schema 無 length check 那半條**（丟棄是 relay 政策不是 parse 拒絕，schema 模的是 wire 能不能 parse；501 code point 仍 SHALL 通過 `ChatIn.safeParse`）。

## Non-goals

- **不動 Zod `ChatIn`／`ChatOut` schema**。500 只住 `LIMITS` 與 composer 送出守門，不進 wire schema（parse 層 vs 送出守門的切分，兩個外部模型一致）。
- **不改顯示記憶體預算**。單則保留 2000 code point（`FE-R11-S04` 的 `sceneChat.ts`）是客戶端記憶體政策，與 500 送出上限**各自獨立**：收到別人／舊連線的長訊息照樣截到 2000 顯示，只有**自己送**不能超過 500。
- **不截斷使用者輸入**。貼上 >500 保留全文、顯示負剩餘、禁用送出讓使用者自己刪 —— 暗中截斷一樣是資料遺失。
- **不動後端**（凍結、別團隊維運）。這是前端對齊既成事實，不是要求後端改。
- **不改聊天的其他行為**（trim 空不送、送出失敗保留＋alert、Enter／Shift+Enter、換場清空、不遮互動提示）全部不動。
