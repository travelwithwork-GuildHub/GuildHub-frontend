## REMOVED Requirements

### Requirement: `LIMITS` 如實記錄 chat body 沒有後端限制；契約 schema 不加任何長度檢查

**移除理由**：這條的前提（後端對 chat body 完全沒限制）已被部署後端推翻 —— 正式閘道 relay 廣播層對 `len(body) > 500` 靜默丟棄（2026-09-21 對 `wss://gateway-production-3ecd.up.railway.app/ws` 實測：499／500 有回聲、501／502 無回聲、連線不關，邊界正好 500、按 code point）。`LIMITS.chatBody` 不再是 `UNBOUNDED`，這條的核心斷言反轉。

**這條被下面的 `LIMITS 記錄 chat body 的送出上限 500；契約 schema 不加任何長度檢查` 取代，不是單純刪掉。** schema 不加長度檢查那半條的規則原封保留（丟棄是 relay 政策不是 parse 拒絕）。

`FE-R11-S09` 這個 ID 隨本條退場，**MUST NOT 被重新使用** —— 它的意義從「無上限」反轉成「500」，沿用同一個 ID 會讓舊測試對應關係悄悄錯位。反轉後的斷言改用新 ID `FE-R11-S11`。

## ADDED Requirements

### Requirement: `LIMITS` 記錄 chat body 的送出上限 500；契約 schema 不加任何長度檢查

`src/api/contract/limits.ts` SHALL 有 `chatBody: { min: 0, max: 500 }`，`LIMIT_SOURCES.chatBody` SHALL 指向「正式部署閘道 relay 層實測 `len(body) > 500` 靜默丟棄」與實測日期，**不指向舊 clone 的 `protocol.py::ChatIn.body`**（那份 clone 早於加上限的部署、看不到這段）。

**這個上限的性質**：後端的 Pydantic `ChatIn.body` parse 任意長度都不擋；丟棄發生在 relay 廣播層 —— 超過 500 code point 的一則 `chat` **不廣播、不關連線、不回任何錯誤**。所以 500 是**送出端必須擋的事實**（前端不擋 ＝ 使用者送出後輸入框清空、訊息人間蒸發、畫面像壞了），與 `statusText: {0, 12}`（`presence.py` 的靜默丟棄）同一種情境。

「全空白不送」是 `FE-K04` 的送出規則（trim 後至少一個 code point），MUST NOT 偽裝成後端限制寫進 `LIMITS`；
單則只保留 2000 code point 的**顯示記憶體預算**（`FE-R11-S04`）是客戶端資源政策，與這條的 **500 送出上限各自獨立**（收到別人或舊連線的長訊息仍截到 2000 顯示；自己送不出超過 500），MUST NOT 混為一談或寫進 `ChatIn`。
`ChatIn.body` 與 `ChatOut.body` 的 Zod schema **仍 MUST NOT 有任何長度檢查**（沒有 `min`／`max`／`length`）—— 丟棄是 relay 政策、不是 parse 拒絕，schema 模的是「wire 能不能 parse」；500 只住 `LIMITS` 與 composer 的送出守門，不進 schema。

> 拔掉什麼會紅：`chatBody.max` 改回 `UNBOUNDED` 或非 500 → S11 的 LIMITS 段；`chatBody.min` 改成 1 → S11；`ChatIn`／`ChatOut` 的 `body` 加任何 `.min()`／`.max()`（不管數字多大）→ S11 的自省段。

#### Scenario: [FE-R11-S11] chat 送出上限是後端 relay 的 500，不是 parse 約束、也不是 Inbox 的上限

- **WHEN** 檢查 `LIMITS.chatBody` 與 `LIMIT_SOURCES.chatBody`
- **THEN** `min` SHALL 是 0、`max` SHALL 是 500；`LIMIT_SOURCES.chatBody.source` SHALL 說出是部署閘道 relay 的實測（`len(body) > 500` 靜默丟棄），MUST NOT 只指向不擋長度的 `ChatIn.body`
- **AND** `ChatIn.shape.body` 與 `ChatOut.shape.body` 的 Zod 長度 checks SHALL 仍是空的（自省 `_def.checks` 沒有 `min`／`max`／`length`）
- **AND** 501 個 code point 的 body 與 `""` 都 SHALL 通過 `ChatIn.safeParse`（parse 不擋長度 —— 長度擋在 composer 的送出守門，不在 wire schema）
- → 驗於：單元
