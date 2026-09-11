## Applicability

權限：**不適用** —— 網址只表示「開著哪一層」，看不看得到內容由端點的 401 與 `FE-X04` 的權限阻擋處理
併發：**適用** —— 網址 → 狀態與狀態 → 網址兩個方向同時在跑，要避免互相觸發成迴圈
持久資料相容性：**不適用** —— 不讀寫持久資料；網址不是持久資料
失敗路徑：**適用** —— 不合法的參數、深連結直達的頁碼已經不存在、直達詳情的人已經被移除

測試連到什麼：**不連任何團隊共用的位址。**
單元判準用 jsdom 的 `window.history`／`window.location`；世界那一半在 Playwright 打**本機自己起的** dev server。

## ADDED Requirements

### Requirement: 網址表示開著哪一層，複製它就能還原

`/world` 的 query SHALL 表示三件事：開著哪一種清單（`panel=profiles`）、開著哪一筆詳情
（`profile=<id>`）、清單在第幾頁（0-based 的 `page=N`，第 0 頁 SHALL 省略）。
載入帶這些參數的網址 SHALL 還原同一層：清單、詳情（以 `id` 請求 `GET /api/profiles/{id}`，沒有預覽）、頁碼。

深連結直達時角色 SHALL 在出生點，面板直接開著；**不**把角色傳送到看板前。
關掉面板之後，再開仍 SHALL 走到看板前按 E。

⚠️ 今天面板狀態全在記憶體：重新整理之後面板關、詳情沒了、翻頁回第 0 頁。
`FE-B04` 為「連續看很多個人才」做了返回不丟頁碼 —— 那個人一重新整理就掉回第 0 頁。

#### Scenario: [FE-B09-S01] `?panel=profiles` 開著人才清單

- **WHEN** 載入 `/world?panel=profiles`
- **THEN** 人才清單面板 SHALL 開著，並已送出 `GET /api/profiles?page=0`

#### Scenario: [FE-B09-S02] `?panel=profiles&profile=<id>` 開著那一筆詳情

- **WHEN** 載入 `/world?panel=profiles&profile=<id>`
- **THEN** 人才面板 SHALL 開著且詳情蓋在上面，並已送出 `GET /api/profiles/<id>`

#### Scenario: [FE-B09-S03] `page=N` 還原第 N 頁

- **WHEN** 載入 `/world?panel=profiles&page=2`
- **THEN** 清單送出的第一個請求 SHALL 是 `GET /api/profiles?page=2`

#### Scenario: [FE-B09-S04] 深連結直達的頁碼已經是空的：退回第 0 頁，網址跟著改

- **WHEN** 載入 `/world?panel=profiles&page=7`，第 7 頁回空陣列
- **THEN** 清單 SHALL 改請求第 0 頁並呈現它
- **AND** 網址 SHALL 不再帶 `page=7`（不留下一個重新整理仍撲空的網址）

> 沒有「原頁」可以留（`FE-B01-S09` 的規則是給「從滿頁前進」用的）。畫成「首次無資料」的話，
> 使用者會以為整個系統沒資料或連結壞了。

#### Scenario: [FE-B09-S05] 不合法的參數回到 canonical，不出錯

- **WHEN** 載入 `page=-1`、`page=abc`、`panel=bogus`、以及沒有 `panel` 的 `profile=<id>` 各一次
- **THEN** 每一次 SHALL 都是可操作的畫面：前兩者是人才清單第 0 頁、`panel=bogus` 是沒有面板的世界、
  單獨的 `profile` 視為 `panel=profiles`
- **AND** 網址 SHALL 被改成對應的 canonical 形式

### Requirement: 互動寫回網址；上一頁與 Escape 等效

在世界裡開清單 SHALL 新增一層瀏覽紀錄並把 `panel` 寫進網址；開詳情 SHALL 再新增一層並寫 `profile`；
翻頁 SHALL 更新 `page` 但 SHALL NOT 新增瀏覽紀錄。
瀏覽器的上一頁 SHALL 關閉最上層（詳情 → 清單 → 世界），與 Escape 等效；下一頁 SHALL 依序重開。
Escape 關一層時網址 SHALL 跟著少一層。

深連結直達（瀏覽紀錄裡沒有本站的上一層）時，Escape SHALL NOT 離開本站：
網址 SHALL 被替換成上一層（詳情 → 清單 → `/world`）。

⚠️ **網址是這一層的單一事實來源** —— 不是「記憶體狀態順便寫進網址」。
兩個方向同時在跑，寫回時要以「網址已經是這樣了」為終止條件，否則會互相觸發。

#### Scenario: [FE-B09-S06] 按 E 開清單：網址多 `panel`，紀錄多一層

- **WHEN** 在 `/world` 按 E 開人才清單
- **THEN** 網址 SHALL 變成 `/world?panel=profiles`
- **AND** 瀏覽紀錄 SHALL 比之前多一層

#### Scenario: [FE-B09-S07] 點卡開詳情：網址多 `profile`，紀錄再多一層

- **WHEN** 清單開著，使用者開某一筆的詳情
- **THEN** 網址 SHALL 帶那一筆的 `profile=<id>`
- **AND** 瀏覽紀錄 SHALL 再多一層

#### Scenario: [FE-B09-S08] 翻頁改網址、不加紀錄

- **WHEN** 清單在第 0 頁，使用者前進一頁
- **THEN** 網址 SHALL 帶 `page=1`
- **AND** 瀏覽紀錄 SHALL 不變

#### Scenario: [FE-B09-S09] 上一頁關最上層

- **WHEN** 詳情開著（網址帶 `profile`），使用者按瀏覽器的上一頁
- **THEN** 詳情 SHALL 不再顯示，清單 SHALL 仍開著，網址 SHALL 不再帶 `profile`
- **AND** 再按一次上一頁，面板 SHALL 關閉，網址 SHALL 是 `/world`

#### Scenario: [FE-B09-S10] Escape 關一層，網址跟著少一層

- **WHEN** 詳情開著，使用者按 Escape
- **THEN** 網址 SHALL 不再帶 `profile` 但仍帶 `panel`
- **AND** 再按 Escape，網址 SHALL 是 `/world`

#### Scenario: [FE-B09-S11] 深連結直達，Escape 不離站

- **WHEN** 直接載入 `/world?panel=profiles&profile=<id>`（本站沒有上一層紀錄），使用者按 Escape
- **THEN** 詳情 SHALL 不再顯示，網址 SHALL 是 `/world?panel=profiles`
- **AND** 瀏覽紀錄 SHALL 沒有多也沒有少（是替換，不是後退）

### Requirement: 網址改變時世界不重掛

清單、詳情、翻頁、上一頁、下一頁、Escape 造成的網址變化，SHALL NOT 讓世界的 Canvas 重新掛載。

⚠️ **這是這一列最可能做錯、而且畫面上看不出來的地方**：畫面一樣、WebGL context 已經重建。

#### Scenario: [FE-B09-S12] 一連串網址變化，世界只掛一次

- **WHEN** 從 `/world` 依序開清單、開詳情、上一頁、下一頁、Escape 兩次
- **THEN** 世界那棵子樹的掛載次數 SHALL 是 1，Canvas 的 DOM 節點 SHALL 是同一個
