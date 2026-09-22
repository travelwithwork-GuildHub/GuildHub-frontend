## MODIFIED Requirements

### Requirement: 同一時間只有一個阻斷式面板；讓位有協定；非阻斷的提示讓位

> **變更（`fe-a06-first-entry` 二次反轉，2026-09-22）：退役 `FE-X16-S15`（訪客提示讓位）。**
> require-name 之後訪客進 `/world` 看到的是**取代世界的取名門檻**（`first-entry` 的 `FE-A06-S04`），
> 不再是「與世界並存、可關掉、面板開著就讓位」的非阻斷提示 —— 訪客根本不 render 世界，也就開不了任何阻斷式面板。
> `FE-X16-S15` 的前提（訪客同時處於「提示顯示中」與「可開世界面板」）已不存在，整條退役；
> 讓位規則裡「訪客提示不顯示…回來…不重設狀態」那一段一併移除。**保留**的非阻斷讓位對象是場景聊天框與換角色彈出層。
> （前言名詞表把「訪客提示」列進「非阻斷的提示」清單、以及它作為表面的分類，因不屬任何 `### Requirement` 無法以 delta 改，
> 由 `archive/fe-a06-first-entry` 的人工同步一併校正 —— 這是 archive diff 必審的跨 change 覆蓋。）

**協調者持有「哪一個阻斷式面板是開的」**（`active: id | null`）—— 那是唯一的來源，各 provider 的「開著」SHALL 從它推導，不各自持有。
所以「任一時刻掛載中的阻斷式面板 `≤ 1`」是結構上的事：一個值只能指向一個 id。
**持有者**：`active` 指向的面板；它掛載中的殼向協調者登記兩個**同步**函式 `canYield(): boolean`（送出中或有未儲存的修改 → `false`）
與 `onYield(): void`（被讓位時的收尾：走既有關閉路徑的副作用，**不**把焦點還給開啟者）。每次登記是一筆有身分的紀錄，解除只刪自己那一筆（compare-and-delete；Strict Mode 的舊 cleanup 不得刪掉新的登記）。
**殼的卸載 SHALL NOT 動 `active`**（Strict Mode 的模擬卸載跟真卸載走同一條 cleanup，分不出來）；`active` 只由 `requestClose(id)`（compare-and-clear）與被取代改變。
**開啟的副作用歸掛載生命週期**：世界命令鎖、焦點還原的旗標、開啟者、重取的世代這些「開了就要收的東西」SHALL 在殼**掛載**時取得、卸載時釋放，
SHALL NOT 在 `requestOpen()` 或 provider 的開啟呼叫裡同步取得 —— 一個成功但從未掛載的請求（被同一事件的後者取代）才不會留下任何要收的東西。
「有阻斷式面板開著」SHALL 從 **`active` 指向的殼已登記** 推導（`useBlockingPanelOpen()`），不是從 `active !== null` 推導 ——
一個指向沒人掛的 id 的 `active`（provider 在 commit 前整個卸載）對畫面沒有作用：聊天框不收起，而且下一次請求會直接取代它。
**請求**：要開一個阻斷式面板 SHALL 呼叫 `requestOpen(id)`，協調者**同步**決定（用同步的鏡像判斷，不等 React commit）：
`active` 是 `null`、或指向一個還沒登記的 id（殼還沒掛成）→ `active = id`、回 `true`；`active` 已登記且 `canYield()` → 先 `onYield()`、`active = id`、回 `true`；
`canYield()` 為 `false` → **拒絕**：`active` 不變、觸發它的控制保持焦點、畫面 SHALL 有可見的回饋（`role="status"`，內容不是契約）。
同一次事件裡的多個請求依呼叫順序處理，後者對前者做同一套判斷（前者還沒掛成 → 被取代），commit 後掛載的只有最後一個成功的。
沒有保留、沒有計時器：一個延遲到很晚才 commit 的舊請求不可能掛出第二個面板，因為掛不掛載由 `active` 決定，不由請求者自己的 state 決定。
**讓位後的焦點**：從觸發到穩定，記錄每一次 `focusin` 的目標，被讓位面板的開啟者（世界焦點錨、或開它的按鈕）SHALL NOT 出現在序列裡，
`body` SHALL NOT 出現在序列裡；最後 `document.activeElement` 在新面板內（新面板自己的取焦規則）。
**網址**：看板在網址裡（`deep-link`）。看板讓位 SHALL 走它既有的關閉路徑（網址跟著退：`history.go(-1)`，帶 `panel` 的那一筆留在**前進**紀錄裡）；
上一頁／下一頁要求重開看板 SHALL 也經過協調者，被拒絕時網址 SHALL 以 `replaceState` 把**目前這一筆**改成實際狀態（跟 `deep-link` 的 canonical 同一種處理），
SHALL NOT `pushState`，畫面 SHALL NOT 換。
**非阻斷的表面**（讀 `active` 推導的 `useBlockingPanelOpen()`）：面板開著時
場景聊天框 SHALL 收成一行（區域仍在、只剩區域名稱與「面板開著期間新到的訊息數」，沒有列表與輸入框），面板關了展開回來，
記憶體與捲動位置照舊：收起前在底部 → 展開後在底部；收起前往上讀 → 展開後位置不動、有新的就顯示「回到最新」（`scene-chat-ui` 的兩條照舊）；
成功開啟任一阻斷式面板時換角色彈出層 SHALL 關（`keyboard-focus` 的「按 E 開面板」擴到所有入口）；請求被拒時照 `keyboard-focus` 既有的「焦點離開就關」——
按了別的入口焦點就離開了它，所以它也關；這份不在那條上加例外。

#### Scenario: [FE-X16-S13] 開第二個面板會關第一個、焦點不經開啟者、網址跟著退

- **WHEN** 看板清單開著（網址有 `panel`），按標題列的收件匣
- **THEN** 看板 SHALL 關、收件匣 SHALL 開、掛載中的阻斷式面板恰好一個、`document.activeElement` 在收件匣內、網址 SHALL NOT 再有 `panel`
- **AND** 從按下到穩定的 `focusin` 序列裡 SHALL NOT 出現世界焦點錨（看板的開啟者）也 SHALL NOT 出現 `body`
- **AND WHEN** 收件匣開著，按標題列的我的名片
- **THEN** 收件匣 SHALL 關、名片 SHALL 開
- **AND WHEN** 名片開著，按標題列的收件匣
- **THEN** 名片 SHALL 關、收件匣 SHALL 開
- **AND WHEN** 人才詳情裡按寄信（`inbox` 既有的路）
- **THEN** 結果 SHALL 跟上面同一種：看板關、收件匣開、焦點在收件匣內

#### Scenario: [FE-X16-S14] 送出中或有未儲存修改的面板拒絕讓位，有回饋，回來後接受

- **WHEN** owner 在案件詳情按了成軍、回應還沒回來，此時按標題列的收件匣
- **THEN** 收件匣 SHALL NOT 開、詳情 SHALL 留著、焦點 SHALL 在收件匣按鈕上、畫面 SHALL 有一個 `role="status"` 的回饋
- **AND WHEN** 回應回來了，再按一次收件匣
- **THEN** 看板 SHALL 關、收件匣 SHALL 開
- **AND WHEN** 我的名片改了字沒存，按標題列的收件匣
- **THEN** 收件匣 SHALL NOT 開、名片 SHALL 留著、改的字 SHALL 還在、SHALL NOT 出現放棄修改確認（讓位不替使用者按下那個問題）、焦點 SHALL 在收件匣按鈕上、SHALL 有一個 `role="status"` 的回饋

#### Scenario: [FE-X16-S15] 訪客提示讓位、面板關了回來、不重設它的狀態

（已退役 —— `fe-a06-first-entry` 二次反轉：訪客進 `/world` 看到的是取代世界的取名門檻，訪客不 render 世界、開不了任何阻斷式面板，
「訪客提示與面板並存、面板開著就讓位」的前提不復存在。保留此標頭讓退役留痕（穩定 ID 不重用），這條不再有對應測試。）

#### Scenario: [FE-X16-S16] 聊天框收成一行、關了展開、訊息與捲動位置沒丟、不持鎖

- **WHEN** 聊天框在底部，看板開著，期間收到 3 則場景訊息
- **THEN** 聊天框 SHALL 是一行（區域仍在、沒有列表、沒有輸入框），那一行顯示 `3`；世界鎖 SHALL NOT 由聊天框持有
- **AND WHEN** 關掉看板
- **THEN** 聊天框 SHALL 展開，列表裡有那 3 則、輸入框在、捲動在底部（最後一列完整可見）
- **AND WHEN** 聊天框往上讀著（不在底部）時開看板、期間收到 2 則、關看板
- **THEN** 展開後 `scrollTop` 跟收起前的差 SHALL `≤ 1px`、SHALL 顯示「回到最新」的控制、列表裡有那 2 則

#### Scenario: [FE-X16-S17] 下一頁要求重開看板：持有者接受就開、拒絕就把那一筆改回來

- **WHEN** 從 `/world` 按 E 開看板（`pushState`）→ 按標題列的收件匣（看板讓位、`go(-1)` 回 `/world`）→ 按瀏覽器**下一頁**
- **THEN** 收件匣 SHALL 關、看板 SHALL 重開（`deep-link` 的下一頁語意）
- **AND WHEN** 同樣走到收件匣開著、收件匣對話正在送出中時按瀏覽器下一頁
- **THEN** 收件匣 SHALL 留著、看板 SHALL NOT 開、`history.replaceState` SHALL 被呼叫恰好一次且 `pushState` 零次（攔截兩者）、網址 SHALL 沒有 `panel`
- **AND WHEN** 之後再按上一頁
- **THEN** SHALL 回到原本的 `/world` 那一筆（沒有 `panel`），收件匣仍然開著（不在網址裡）

#### Scenario: [FE-X16-S18] 換角色彈出層：成功開面板就關、被拒也因焦點離開而關、草稿丟

- **WHEN** 換角色彈出層開著，按標題列的收件匣
- **THEN** 彈出層 SHALL 關、收件匣 SHALL 開
- **AND WHEN** 看板詳情送出中，換角色彈出層開著（有未套用的草稿），按標題列的收件匣
- **THEN** 收件匣 SHALL NOT 開、彈出層 SHALL 關（焦點離開了它）、草稿 SHALL 丟（`keyboard-focus` 既有語意）、焦點在收件匣按鈕上

#### Scenario: [FE-X16-S21] 同一次事件裡兩個請求：只掛最後一個成功的

- **WHEN** 沒有面板開著，在同一個 handler 裡依序請求開看板、再請求開收件匣（commit 前斷言兩個同步回傳值）
- **THEN** 兩個都 SHALL 得到 `true`（看板還沒掛成，被取代）；commit 後掛載中的阻斷式面板 SHALL 恰好一個且是收件匣，看板 SHALL 從未掛載
- **AND** 世界命令鎖的持有者 SHALL 恰好一個（收件匣的殼），看板那次請求 SHALL NOT 留下鎖、開啟者或焦點旗標
- **AND WHEN** 關掉收件匣
- **THEN** 世界命令鎖 SHALL 放開、`active` SHALL 是 `null`（`requestClose`）、`useBlockingPanelOpen()` 是 `false`、人 SHALL 走得動
- **AND WHEN** 收件匣重新開著、對話送出中，再請求開看板
- **THEN** SHALL 得到 `false`、收件匣留著

#### Scenario: [FE-X16-S22] 延遲的舊請求掛不出第二個面板；殼沒掛成不鎖死

- **WHEN** 請求開看板成功，看板的殼還沒登記（例如它的內容在 Suspense 裡延後 commit），此時請求開收件匣
- **THEN** SHALL 得到 `true`；之後看板那次延後的 commit 完成時，看板 SHALL NOT 掛載（它的 provider 從 `active` 推導出「不是我」）、掛載中的阻斷式面板恰好是收件匣
- **AND WHEN** 請求開看板成功但看板的 provider 在 commit 前整個卸載
- **THEN** 卸載穩定後 `useBlockingPanelOpen()` SHALL 是 `false`（聊天框展開 —— 不被一個不存在的面板壓著）；之後請求開收件匣 SHALL 成功、收件匣 SHALL 掛載
- **AND WHEN** Strict Mode 下殼掛載→卸載→再掛載
- **THEN** 登記 SHALL 恰好一筆且是新的那筆、`useBlockingPanelOpen()` SHALL 是 `true`、`active` SHALL 仍指向它（殼的 cleanup 沒動 `active`、舊登記沒刪掉新登記）

