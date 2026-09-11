# list-panel Specification

## Purpose
TBD - created by archiving change fe-b01-list-container. Update Purpose after archive.

## Requirements

### Requirement: 走到看板前按 E，開得起對應的面板

系統 SHALL 讓既有的 `projectBoard` 與 `talentBoard` 兩個互動目標，
在使用者觸發互動時各自開啟對應資料種類的清單面板。

既有的穩定 `id` 與具名 `label` SHALL 保持不變（`FE-W06-S16`：`id` 重複會拋錯；
`FE-W06-S13`：提示不能只寫「按 E」）。

⚠️ **這一條之前，兩塊看板按 E 什麼都不會發生** ——
`BoardTargets.tsx` 沒有傳 `onInteract`。

#### Scenario: [FE-B01-S01] 專案看板開的是案件清單

- **WHEN** 使用者對 `projectBoard` 觸發互動
- **THEN** 系統 SHALL 開啟清單面板
- **AND** 面板讀取的 SHALL 是案件資料

#### Scenario: [FE-B01-S02] 人才看板開的是人才清單

- **WHEN** 使用者對 `talentBoard` 觸發互動
- **THEN** 面板讀取的 SHALL 是人才資料

> ⚠️ **這兩條要成對。** 只驗一種的話，一個「兩塊看板都開案件」的實作照樣全綠 ——
> 而畫面上兩邊都是合法的卡片，肉眼看不出來。

### Requirement: 案件與人才共用同一個容器

系統 SHALL 以同一套面板版型、列表與翻頁實作服務兩種資料種類。
資料種類 SHALL 只作為輸入傳進去，SHALL NOT 各自複製一份實作。

#### Scenario: [FE-B01-S03] 同一組翻頁行為在兩種資料上都成立

- **WHEN** 對案件與人才分別執行同一組翻頁操作
- **THEN** 兩者的翻頁行為 SHALL 一致

### Requirement: 翻頁只用契約真正提供的參數

面板 SHALL 以 0-based 的 `page` 參數請求資料，每頁 `PAGE_SIZE = 20`。

面板 SHALL NOT 依賴、要求或顯示 `total`、`has_more`、總頁數或
「第 N / M 頁」之類需要總量才能成立的資訊。

⚠️ **`docs/WBS.md` 這一列寫的「offset 翻頁」跟契約對不上。**
端點收的是 `page`，換算成 SQL `offset` 是後端內部的事，不是 API 契約。
**沒有 `limit` 參數** —— 前端不能多抓一筆來探測。

#### Scenario: [FE-B01-S04] 第一頁送出的是 `page=0`

- **WHEN** 面板首次開啟
- **THEN** 送出的請求 SHALL 帶 `page=0`

#### Scenario: [FE-B01-S05] 前進一頁送出的是 `page=1`

- **WHEN** 使用者從第一頁前進
- **THEN** 送出的請求 SHALL 帶 `page=1`

> **沒有這一條，上一條說明不了什麼** —— 一個「永遠送 `page=0`」的實作也會通過。

#### Scenario: [FE-B01-S06] 回應裡沒有總量資訊也能運作

- **WHEN** 端點回傳的只是一個陣列，沒有任何總量欄位
- **THEN** 面板 SHALL 正常呈現該頁
- **AND** 畫面上 SHALL NOT 出現總頁數或總筆數

### Requirement: 「還有沒有下一頁」只能靠實際取到的資料判定

面板 SHALL 依下列三種情況判定是否還有下一頁：

- 某頁回傳**少於** `PAGE_SIZE` 筆 → **確定**沒有下一頁，SHALL NOT 再請求下一頁
- 某頁回傳**正好** `PAGE_SIZE` 筆 → SHALL NOT 宣稱已到底，且 SHALL 允許再前進
- 前進之後回傳**空陣列** → SHALL 辨識為「翻到底」，SHALL NOT 辨識為「首次無資料」

前進之後若回傳空陣列，面板 SHALL 留在原本那一頁，
SHALL NOT 把使用者帶到一張空白的頁面。

⚠️ **在請求下一頁以前，資訊上無從判斷。** 這是契約缺資訊。
「正好 20 筆」只代表**可能**還有 —— 拿它當「確定還有」，
在總數剛好是 20 的倍數時就會給出一張空的幽靈頁，
而那種資料量在開發用的假資料裡幾乎碰不到。

#### Scenario: [FE-B01-S07] 不滿一頁就是到底

- **WHEN** 某頁回傳少於 `PAGE_SIZE` 筆
- **THEN** 面板 SHALL 進入「翻到底」狀態
- **AND** SHALL NOT 再送出下一頁的請求

#### Scenario: [FE-B01-S08] 正好一頁不等於到底

- **WHEN** 某頁回傳正好 `PAGE_SIZE` 筆
- **THEN** 面板 SHALL NOT 進入「翻到底」狀態
- **AND** 使用者 SHALL 仍然能前進

#### Scenario: [FE-B01-S09] 前進之後撲空，留在原頁

- **WHEN** 使用者從一個滿頁前進
- **AND** 下一頁回傳空陣列
- **THEN** 面板 SHALL 仍然呈現原本那一頁的資料
- **AND** 面板 SHALL 進入「翻到底」狀態，而不是「首次無資料」狀態

### Requirement: 請求失敗 SHALL NOT 被當成翻到底

請求失敗時，面板 SHALL 進入錯誤狀態，
並 SHALL NOT 進入「翻到底」或「首次無資料」狀態。

失敗之後 SHALL 仍然可以重試同一頁。

⚠️ **三態要分得開：確定有／確定沒有／不確定。**
把網路失敗畫成「已無更多」，是把失敗偽裝成資料結束 ——
使用者會以為自己看完了。

#### Scenario: [FE-B01-S10] 網路失敗不是資料結束

- **WHEN** 請求下一頁時發生錯誤
- **THEN** 面板 SHALL 進入錯誤狀態
- **AND** SHALL NOT 進入「翻到底」狀態

#### Scenario: [FE-B01-S11] 失敗之後還能重試

- **WHEN** 面板處於錯誤狀態
- **THEN** 使用者 SHALL 能重新請求同一頁

### Requirement: 只做狀態，不做文案

面板 SHALL 把「首次無資料」、「翻到底」與「錯誤」三種狀態，
交給呼叫端提供的節點呈現。

面板本身 SHALL NOT 定義這三種狀態的使用者可見文案，
也 SHALL NOT 定義任何錯誤碼的語彙。

⚠️ **`FE-X04`（空狀態）與 `FE-X03`（錯誤處理）在 `docs/WBS.md` 上
都標著「唯一一份」**，而且「翻到底」與「載入失敗且無快取」逐字列在 `FE-X04` 裡。
這一列先寫一份「暫時的」文案，就是第二份 —— 而第二份之後要有人來拔。

**狀態的判定歸這一列**（它掌握頁次與回傳筆數），**呈現歸那兩列。**

#### Scenario: [FE-B01-S12] 三種狀態各自選到呼叫端給的節點

- **WHEN** 面板處於「首次無資料」、「翻到底」或「錯誤」其中一種狀態
- **THEN** 畫面上 SHALL 出現呼叫端為該狀態提供的節點

#### Scenario: [FE-B01-S13] 容器自己不產生這三種狀態的文案

- **WHEN** 呼叫端沒有為某個狀態提供節點
- **THEN** 面板 SHALL NOT 以自有文案代替

### Requirement: 晚到的回應不得覆蓋畫面

面板 SHALL 只讓「捕捉時的 request identity 仍等於目前有效 identity」的回應，
提交到列表、頁次或錯誤狀態。

request identity SHALL 包含所有會改變結果集合的輸入；
在這一份規格的範圍內，那是**資料種類**與**頁次**兩項。

⚠️ **這個 bug 的畫面全部都是合法卡片。** 快速連點下一頁時，
`page 1` 的回應可能晚於 `page 2` 到達 —— 結果是「頁碼 2、內容 page 1」，
型別檢查與肉眼都抓不到。

⚠️ **判準綁的是身分的同一性，不是欄位名。**
`FE-B05`（搜尋與篩選，W6）來的時候，把 `status` 與搜尋條件加進 identity 即可，
**提交規則與這幾條 Scenario 不需要重寫**。

#### Scenario: [FE-B01-S14] 晚到的舊頁不覆蓋新頁

- **WHEN** 使用者連續前進兩頁，而較早那一頁的回應較晚到達
- **THEN** 畫面呈現的 SHALL 是較新那一頁的資料

#### Scenario: [FE-B01-S15] 換一種資料之後，舊資料不得混進來

- **WHEN** 面板正在請求某一種資料，而使用者改為開啟另一種
- **AND** 前一種的回應在之後才到達
- **THEN** 畫面上 SHALL NOT 出現前一種資料

### Requirement: Escape 關閉面板，並把世界的輸入還回去

面板開啟時按 Escape，面板 SHALL 關閉，
且世界的移動輸入 SHALL 恢復作用。

面板未開啟時按 Escape，SHALL NOT 產生任何與面板有關的副作用。

⚠️ **這一條寫的是可觀察的結果，不是實作手段。**
「移動輸入恢復作用」SHALL NOT 被寫成「呼叫 `canvas.focus()`」或
「呼叫 `stopPropagation()`」—— 移動監聽掛在哪裡是實作的事，
把手段寫進規格等於把測試鎖死在一種實作上。

#### Scenario: [FE-B01-S16] Escape 關閉面板

- **WHEN** 面板開啟中，使用者按下 Escape
- **THEN** 面板 SHALL 關閉

#### Scenario: [FE-B01-S17] 關閉之後，人走得動

- **WHEN** 面板剛被關閉
- **THEN** 移動輸入 SHALL 恢復作用

#### Scenario: [FE-B01-S18] 面板開著的時候，人 SHALL NOT 走動

- **WHEN** 面板開啟中，使用者按下移動鍵
- **THEN** 世界裡的角色 SHALL NOT 移動

> ⚠️ **`S17` 與 `S18` 要成對。** 只有 `S18` 的話，一個「開了面板就永遠鎖住輸入」
> 的實作會全綠 —— 而症狀是「關掉面板之後人走不動了，要用滑鼠點一下畫面」。
