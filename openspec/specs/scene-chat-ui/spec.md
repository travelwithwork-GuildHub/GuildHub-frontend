# scene-chat-ui Specification

## Purpose
場景聊天看得見的那一半：使用者不必走近物件、不必按 E、不必開任何面板，就能在世界畫面上旁觀目前 committed 場景的近期訊息並直接加入。
它只呈現 `scene-chat-transport` 交出的東西（目前頁面、目前 committed 場景的記憶體；筆數與單則預算都在那邊定），不暗示有持久歷史、私聊、未讀或跨場景保存；
使用者提供的字串只當文字。

## Requirements

### Requirement: 不必互動就看得到目前場景的 chat；只看不鎖世界，打字才鎖

世界畫面 SHALL 有一個 DOM 的 chat 區，顯示目前 committed 場景的訊息；使用者 MUST NOT 需要走近任何 3D 物件、按 E 或開任何面板才看得到它。
chat 區可見但輸入框沒有焦點時，世界命令 MUST NOT 被鎖住（W／E 照常）；輸入框有焦點時，字元 SHALL 進輸入框、角色 MUST NOT 移動（既有的
`EditableFocusLock`）；焦點離開輸入框後世界命令 SHALL 恢復。在輸入框裡按 Escape SHALL 離開輸入框、焦點回到世界焦點錨（`[data-focus-anchor="world"]`）；
Escape MUST NOT 關掉 chat 區、MUST NOT 導覽。chat 區的方框 MUST NOT 與互動提示（`InteractionPrompt`）的方框重疊 —— 提示是走到門前唯一的線索。

> 拔掉什麼會紅：要按 E 才掛 chat 區 → S01；chat 區可見就持鎖 → S02 的「按 W 會動」；輸入框焦點不鎖 → S02 的「打 w 不會動」；Escape 不回錨 → S02；
> chat 區放到提示的位置、或訊息多到撐高蓋住提示 → S15。

#### Scenario: [FE-K04-S01] 剛進大廳、沒碰任何東西，別人講的話就出現

- **GIVEN** 使用者剛載入 `/world`、站在出生點、沒有觸發任何 3D 互動
- **WHEN** 偽造的伺服器送來一則合法 `ChatOut`（`name`＝「阿福」、`body`＝「早安」）
- **THEN** chat 區 SHALL 顯示「阿福」與「早安」；SHALL 沒有任何 `role="dialog"`、SHALL 沒有 `PanelShell`
- **AND** 使用者 SHALL 沒有按過 E、沒有走到任何門或看板前（走位用里程計證明角色還在出生點附近）
- → 驗於：e2e

#### Scenario: [FE-K04-S02] 只看不鎖；打字不走路；Escape 離開輸入框回世界錨

- **GIVEN** chat 區可見、輸入框沒有焦點
- **WHEN** 按住 W 一小段時間
- **THEN** 角色 SHALL 移動（里程計位移 > 0）
- **AND WHEN** 把焦點放進輸入框、打「w」
- **THEN** 輸入框的值 SHALL 是「w」；角色 MUST NOT 移動
- **AND WHEN** 按 Escape
- **THEN** `document.activeElement` SHALL 是世界焦點錨；chat 區 SHALL 還在；網址 SHALL 不變；輸入框的值 SHALL 仍是「w」
- **AND WHEN** 再按住 W 一小段時間
- **THEN** 角色 SHALL 移動
- → 驗於：jsdom（焦點與鎖：`inputLockRef`、activeElement）、e2e（真的按鍵、真的位移）

#### Scenario: [FE-K04-S15] chat 區不遮互動提示：兩個 viewport、訊息撐滿也一樣

- **GIVEN** chat 區已收到足以撐到它最大高度的訊息數（至少 30 則、每則含多行）
- **WHEN** 走到門前，互動提示出現
- **THEN** chat 區容器與提示容器的 `getBoundingClientRect()` 交集面積 SHALL 是 0
- **AND WHEN** viewport 換成 1280×720 與 1024×640 各一次重做
- **THEN** 兩次 SHALL 都是 0
- → 驗於：e2e

### Requirement: 列表依接收順序呈現發言者與原始文字；被截斷的看得出來；空狀態不偽造結論

列表 SHALL 依記憶體的順序呈現每一筆，每一列 SHALL 能辨識 `name` 與 `body`；系統 MUST NOT 把 `body` 當 HTML、Markdown 或連結解析。
記憶體標記 `truncated` 的那一列 SHALL 讓使用者辨識它被截斷過（截與不截、截到哪裡都是 `scene-chat-transport` 決定的，UI 只忠實顯示交來的 `body` 與標記；怎麼標是 UI 的字）；
沒標的 MUST NOT 有那個標記。
記憶體為空時 chat 區 SHALL 有可辨識的空狀態（一個穩定的可定位標記），且 SHALL 沒有任何訊息列；空狀態的語意是「這一頁目前還沒收到」，
MUST NOT 暗示伺服器沒有歷史、MUST NOT 暗示這個場景從沒有人發言 —— 這是產品義務，文案本身不進規格（`config.yaml`），由 design D2 與 PR review 守。

> 拔掉什麼會紅：用 `Map`／排序改了順序 → S03；`truncated` 不標或全標 → S03；UI 自己再截一次或顯示截斷前的內容 → S03 的「body 就是交來的」；沒有空狀態或空狀態時還有列 → S04；
> 列表用 `innerHTML` → `output-safety` 的 S13 與既有 lint。

#### Scenario: [FE-K04-S03] 三則依序、各自認得出誰講的；標了 truncated 的那一則有標記

- **GIVEN** 記憶體（注入的 `ChatRecord[]`，不經 transport）依序是 阿福「一」、小美「二」、阿福「三」（都 `truncated: false`），以及一筆 `{ name: '丁', body: '被截過的內容', truncated: true }`
- **THEN** 列表 SHALL 依「一」「二」「三」「被截過的內容」排列，每一列的 `name` 節點 SHALL 分別是「阿福」「小美」「阿福」「丁」
- **AND** 第四列 SHALL 有截斷標記、其 `body` 節點的 `textContent` SHALL 正好是「被截過的內容」；前三列 SHALL 沒有截斷標記
- → 驗於：jsdom

#### Scenario: [FE-K04-S04] 還沒收到任何訊息：空狀態，沒有列

- **WHEN** 記憶體是空的
- **THEN** chat 區 SHALL 有空狀態的可定位標記、SHALL 沒有任何訊息列
- **AND WHEN** 記憶體多了一則
- **THEN** 空狀態 SHALL 消失、SHALL 恰好一列
- → 驗於：jsdom

### Requirement: 全空白不送、非空白原值送；沒有上限；只有 transport 接受了才清空、失敗保留

`trim()` 後為空的輸入 MUST NOT 送出，使用者 SHALL 能辨識要先輸入內容；非空白輸入送出時 `ChatIn.body` SHALL 是**原字串**（含首尾空白）。
輸入框 MUST NOT 有 `maxlength`、MUST NOT 套用任何長度上限（含 Inbox 的 2000）；2001 個以上 code point 的內容 SHALL 完整送出。
`send` 同步回來沒拋 → 輸入框 SHALL 清空；`send` 拋（不管拋的是什麼：沒連線的一般 `Error`、沒 `ready` 的 `RealtimeError`、socket 自己拋的）→ 輸入框 SHALL 保留原值、
送出控制之前 SHALL 恰好一個 `role="alert"` 讓使用者辨識沒送出去、MUST NOT 自動重送；那句 MUST NOT 含後端字串或例外的訊息。回聲前列表 MUST NOT 出現自己剛送的話。
送出的操作是 Enter 或送出控制；Shift+Enter SHALL 在輸入框換行而 MUST NOT 送出。

> 拔掉什麼會紅：送出前 trim → S05 的「原字串」；不擋全空白 → S05；`maxlength` → S07；沒 ready 也清空 → S06；`send` 拋錯被吞、或只接 `RealtimeError` → S06 兩種 cause；
> alert 印例外訊息 → S06；送出時本地 append → S06 的「回聲前沒有」；Enter 不送或 Shift+Enter 也送 → S14。

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

#### Scenario: [FE-K04-S07] 沒有 maxlength；2001 個 code point 完整送出

- **WHEN** 在輸入框輸入 2001 個 code point 的非空白內容送出
- **THEN** 輸入框 SHALL 沒有 `maxlength` 屬性；transport 收到的 `body` SHALL 是完整的 2001 個 code point
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

### Requirement: 畫面跟著 committed 場景：換了就是新場景的、失敗退回還在、refresh 是空的

committed 場景換了之後，chat 區 MUST NOT 顯示前一個場景的任何訊息；過場失敗退回原場景時，原本的訊息 SHALL 仍在畫面上；
重新整理後、伺服器還沒送任何新的 `ChatOut` 之前，chat 區 SHALL 是空狀態。這三條是 `scene-chat-transport` 的 `S05`／`S06`／`S07` 在畫面上的形式；
記憶體的規則在那裡，這裡驗的是**畫面**。

> 拔掉什麼會紅：UI 自己另存一份訊息（不讀 `useSceneChat().log`）→ S08 換場景還看得到大廳的；UI 在過場開始就清自己的副本 → S09；UI 把訊息寫進 storage → S10。

#### Scenario: [FE-K04-S08] 大廳切到房間：畫面只剩房間的

- **GIVEN** 大廳的 chat 區顯示「大廳訊息」
- **WHEN** 走到門前按 E 進房、房間 socket 收到 `hello`（committed）
- **THEN** chat 區 SHALL 不再顯示「大廳訊息」
- **AND WHEN** 房間的伺服器送來「房間訊息」
- **THEN** chat 區 SHALL 只顯示「房間訊息」
- → 驗於：e2e

#### Scenario: [FE-K04-S09] 進房被拒退回大廳：大廳的話還在

- **GIVEN** 大廳的 chat 區顯示一則訊息
- **WHEN** 進房的握手被拒、系統自動回大廳、新的大廳連線 ready
- **THEN** 那則訊息 SHALL 仍在畫面上
- → 驗於：e2e

#### Scenario: [FE-K04-S10] refresh 後是空的

- **GIVEN** chat 區已顯示數則訊息
- **WHEN** 重新整理頁面、重新連線，偽造的伺服器只回 `hello`＋`snapshot`、不重送任何 chat
- **THEN** chat 區 SHALL 是空狀態、SHALL 沒有任何舊訊息
- → 驗於：e2e（這條是 `FE-R11-S05` 「列表 SHALL 是空的」的可觀察形式；`tests/e2e/scene-chat.mjs` 同一段標兩個 ID，`FE-R11-S05` 自己的請求 allowlist 那句照它原文驗，這裡不重述）

### Requirement: 新訊息不打斷正在讀舊訊息的人

「在可見區」的定義：那一列的 `getBoundingClientRect()` 完整落在列表捲動容器的 `getBoundingClientRect()` 裡。
使用者在列表底部時收到新訊息，最新的一則 SHALL 在可見區裡。使用者已往上捲、最後一則不在可見區時收到新訊息，捲動位置 MUST NOT 被移到底；
chat 區 SHALL 讓使用者辨識有新訊息、並提供一個回到最新的控制（一個可定位、可啟動的控制；它的字不進規格），啟動它後最新的一則 SHALL 在可見區。

> 拔掉什麼會紅：每則都 `scrollIntoView` → S12 的位置被移；不跟隨 → S11；沒有回到最新的控制 → S12。

#### Scenario: [FE-K04-S11] 在底部：跟著最新的

- **GIVEN** 列表已經長到會捲動、使用者在底部
- **WHEN** 新訊息到達
- **THEN** 最新的一則 SHALL 在可見區裡
- → 驗於：e2e

#### Scenario: [FE-K04-S12] 往上讀：位置不動、看得到有新的、能回到最新

- **GIVEN** 使用者往上捲到最後一則不在可見區
- **WHEN** 新訊息到達
- **THEN** 捲動位置 SHALL 不變（`scrollTop` 差 ≤ 1px）；SHALL 出現回到最新的控制
- **AND WHEN** 啟動那個控制
- **THEN** 最新的一則 SHALL 在可見區裡；那個控制 SHALL 消失
- → 驗於：e2e
