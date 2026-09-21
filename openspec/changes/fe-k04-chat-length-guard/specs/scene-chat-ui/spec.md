## REMOVED Requirements

### Requirement: 全空白不送、非空白原值送；沒有上限；只有 transport 接受了才清空、失敗保留

**移除理由**：標題的「沒有上限」已被部署後端推翻 —— 正式閘道 relay 對 `len(body) > 500` 靜默丟棄（見 `scene-chat-transport` 的 `FE-R11-S11`）。這條的其他規則（trim 空不送、送原值、只有 transport 接受才清空、失敗保留、Enter／Shift+Enter）**沒有變**。

**這條被下面的 `全空白不送、非空白原值送；送出上限 500 擋在送出端；只有 transport 接受了才清空、失敗保留` 取代，不是刪掉。** 沒有變的規則沿用原 scenario ID（`FE-K04-S05`／`FE-K04-S06`／`FE-K04-S14`，意義不變）。

`FE-K04-S07`（原「沒有 maxlength；2001 完整送出」）這個 ID 隨本條退場，**MUST NOT 被重新使用** —— 它的意義從「無上限完整送出」反轉成「500 擋在送出端」，沿用同一個 ID 會讓舊測試對應關係悄悄錯位。反轉後的斷言改用新 ID `FE-K04-S16`，剩餘字數與貼上超長用新 ID `FE-K04-S17`。

## ADDED Requirements

### Requirement: 全空白不送、非空白原值送；送出上限 500 擋在送出端；只有 transport 接受了才清空、失敗保留

`trim()` 後為空的輸入 MUST NOT 送出，使用者 SHALL 能辨識要先輸入內容；非空白輸入送出時 `ChatIn.body` SHALL 是**原字串**（含首尾空白，不 trim）。
**送出上限 500**（`LIMITS.chatBody.max`，正式閘道 relay 對 `len(body) > 500` 靜默丟棄的既成事實）：長度**恰好 500 code point 以內**才送得出去；**超過就擋在送出端** —— `send` MUST NOT 被呼叫、輸入框的值 MUST NOT 被截斷或清空、送出控制 SHALL disabled。**`submit()` 本身 SHALL 擋** `violates() === 'too-long'`（不只是禁用按鈕 —— Enter／form submit 不經按鈕的 disabled）。
長度 SHALL 用 **Unicode code point** 算（`remaining`／`violates`，跟後端 `len()` 一致），**MUST NOT 用原生 HTML `maxlength`**（它數 UTF-16 code unit，emoji 會誤判成後端其實收得下的長度）；輸入框 SHALL 沒有 `maxlength` 屬性 —— 使用者仍可自由輸入／貼上超過 500（欄位不設限），擋的是**送出**。
`send` 同步回來沒拋 → 輸入框 SHALL 清空；`send` 拋（不管拋的是什麼：沒連線的一般 `Error`、沒 `ready` 的 `RealtimeError`、socket 自己拋的）→ 輸入框 SHALL 保留原值、
送出控制之前 SHALL 恰好一個 `role="alert"` 讓使用者辨識沒送出去、MUST NOT 自動重送；那句 MUST NOT 含後端字串或例外的訊息。回聲前列表 MUST NOT 出現自己剛送的話。
送出的操作是 Enter 或送出控制；Shift+Enter SHALL 在輸入框換行而 MUST NOT 送出。

> 拔掉什麼會紅：送出前 trim → S05 的「原字串」；不擋全空白 → S05；加原生 `maxlength` → S16／S17；501 code point 還送得出去（只禁用按鈕、沒在 `submit()` 擋）→ S16；貼上超長被截斷 → S17；剩餘字數用 `.length` 不是 code point → S17 的 emoji 段；沒 ready 也清空 → S06；`send` 拋錯被吞、或只接 `RealtimeError` → S06 兩種 cause；alert 印例外訊息 → S06；送出時本地 append → S06 的「回聲前沒有」；Enter 不送或 Shift+Enter 也送 → S14。

#### Scenario: [FE-K04-S05] 全空白不送、非空白不 trim

- **WHEN** 輸入「」與「   」各送出一次
- **THEN** transport SHALL 沒有收到任何 `ChatIn`；使用者 SHALL 能辨識要先輸入內容
- **AND WHEN** 輸入「  哈囉  」送出
- **THEN** transport 收到的 `ChatIn.body` SHALL 正好是「  哈囉  」
- → 驗於：jsdom

#### Scenario: [FE-K04-S06] 送不出去：保留、有 alert、不洩漏；送出去了：清空、回聲前列表沒有

- **GIVEN** transport 的 `send` 會拋 —— 兩種 cause 各跑一次：`RealtimeError('還不能送訊息（現在是 connecting，要 ready）。')`、一般 `Error('沒有即時連線，聊天訊息送不出去。')`
- **WHEN** 輸入「哈囉」送出
- **THEN** 輸入框 SHALL 仍是「哈囉」；送出控制之前 SHALL 恰好一個 `role="alert"`、焦點 SHALL 在它上面、內容 MUST NOT 含例外的 `message`；列表 SHALL 沒有「哈囉」；跑完所有排程中的計時器後 SHALL 沒有第二次 `send`
- **AND WHEN** transport 的 `send` 改成接受，再送出一次
- **THEN** `send` SHALL 被呼叫一次、參數 `{ t: 'chat', body: '哈囉' }`；輸入框 SHALL 清空；alert SHALL 消失；列表 SHALL 仍沒有「哈囉」（回聲還沒到）
- **AND WHEN** 記憶體收到回聲 `{ id: me, name: '我', body: '哈囉' }`
- **THEN** 列表 SHALL 恰好一列「哈囉」
- → 驗於：jsdom

#### Scenario: [FE-K04-S16] 送出上限 500：≤500 原值送出、>500 擋在送出端不呼叫 send

- **WHEN** 輸入正好 500 個 code point 的非空白內容送出
- **THEN** transport 收到的 `body` SHALL 是完整的 500 個 code point（不截斷）
- **AND WHEN** 輸入 501 個 code point，以 Enter、送出控制、form submit 各觸發一次送出
- **THEN** 三次 `send` SHALL 都 NOT 被呼叫（不只是禁用按鈕 —— `submit()` 本身 SHALL 擋 `violates() === 'too-long'`）；輸入框的值 SHALL 保留（MUST NOT 截斷、MUST NOT 清空）；送出控制 SHALL 是 disabled
- **AND** 輸入框 SHALL 沒有原生 `maxlength` 屬性
- → 驗於：jsdom

#### Scenario: [FE-K04-S17] 剩餘字數與超長回饋：code point 計數、貼上超長保留全文、超長是欄位級不是 alert

- **GIVEN** `LIMITS.chatBody.max` 是 500
- **WHEN** 輸入框有內容
- **THEN** SHALL 有一個可定位、隨輸入更新的剩餘字數（`remaining(LIMITS.chatBody, value)`，可為負 ＝「超過 N 字」），以 `aria-describedby` 掛在輸入框上
- **AND WHEN** 一次貼上 600 個 code point
- **THEN** 輸入框 SHALL 保留全部 600（MUST NOT 自動截斷 —— 暗中截斷也是資料遺失）、剩餘字數 SHALL 顯示負值、送出控制 SHALL disabled、輸入框 SHALL `aria-invalid`
- **AND** 超長 SHALL 是欄位級回饋（`aria-invalid` ＋ `aria-describedby` 指向字數），MUST NOT 冒充 transport 失敗的 `role="alert"`（那句留給送出真的失敗）
- **AND WHEN** 用 20 個 emoji（`.length` ＝ 40 UTF-16 code unit、code point ＝ 20）當輸入
- **THEN** 剩餘字數 SHALL 按 code point 算成 `500 - 20`（不是 `500 - 40`）—— 跟後端 `len()` 一致
- → 驗於：jsdom

#### Scenario: [FE-K04-S14] Enter 送、送出控制送、Shift+Enter 換行不送

- **GIVEN** transport 接受
- **WHEN** 輸入「一」後在輸入框按 Enter
- **THEN** `send` SHALL 被呼叫一次、`body` 是「一」；輸入框 SHALL 清空
- **AND WHEN** 輸入「二」後啟動送出控制
- **THEN** `send` SHALL 再被呼叫一次、`body` 是「二」
- **AND WHEN** 輸入「三」後按 Shift+Enter，再輸入「四」
- **THEN** `send` SHALL 沒有第三次呼叫；輸入框的值 SHALL 含換行（「三\n四」）
- **AND WHEN** 按 Enter
- **THEN** `send` 的 `body` SHALL 正好是「三\n四」
- → 驗於：jsdom
