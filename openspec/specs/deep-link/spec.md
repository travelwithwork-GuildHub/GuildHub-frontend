# deep-link Specification

## Purpose
世界裡開著哪一層（哪一塊看板的清單、哪一筆詳情 —— 人才 `profile=<id>`、案件 `project=<id>`、第幾頁）由 `/world` 的網址表示 —— 網址是這一層的
**單一事實來源**，不是記憶體狀態順便寫進去。複製它就能還原同一層；重新整理不會把人丟回第 0 頁。

瀏覽器的上一頁與 Escape 等效：開清單、開詳情各 push 一層紀錄，翻頁 replace；退一層是真的退，
不是再堆。深連結直達的人本站沒有上一層，Escape 用 replace 退到上一層，不離站。
這些網址變化 SHALL NOT 讓世界的 Canvas 重掛 —— 那是畫面上看不出來、WebGL context 卻重建了的那種錯。

## Requirements

### Requirement: 網址表示開著哪一層，複製它就能還原

`/world` 的 query SHALL 表示三件事：開著哪一種清單（`panel=profiles`／`panel=projects`）、開著哪一筆詳情
（人才 `profile=<id>`；案件 `project=<id>`）、清單在第幾頁（0-based 的 `page=N`，第 0 頁 SHALL 省略）。
載入帶這些參數的網址 SHALL 還原同一層：清單、詳情（以 `id` 請求 `GET /api/profiles/{id}`／`GET /api/projects/{id}`）、頁碼。
`profile` 只在 `panel=profiles`、`project` 只在 `panel=projects` 下有意義：帶錯面板的那一個 SHALL 被去掉（顯式 `panel` 同時帶兩個詳情參數時，留下對應面板的那一個）；
`project` 的形狀跟 `profile` 一樣只接受 UUID，不合形狀的視同沒有；單獨的 `project`（沒有 `panel`）SHALL 視為 `panel=projects`，`page` SHALL 保留；
同時單獨帶 `profile` 與 `project` 時 SHALL 取 `profile`（`panel=profiles`）；`panel` 不合法時 SHALL 整份視為沒有面板（既有規則，不因 `project` 而推導面板）；
同名參數重複時 SHALL 取第一個。canonical 化 SHALL 用 replace（不新增瀏覽紀錄）；只有使用者在清單裡開詳情才 push。

深連結直達時面板直接開著，不受看板互動距離限制；角色在哪裡、關掉之後怎麼再開，
這一列**不改變**既有規則（不傳送角色；再開仍是走到看板前按 E —— `FE-W06`／`FE-B01` 的判準守著）。

⚠️ 今天面板狀態全在記憶體：重新整理之後面板關、詳情沒了、翻頁回第 0 頁。
`FE-B04` 為「連續看很多個人才」做了返回不丟頁碼 —— 那個人一重新整理就掉回第 0 頁。

#### Scenario: [FE-B09-S01] `?panel=profiles` 開著人才清單

- **WHEN** 載入 `/world?panel=profiles`
- **THEN** 人才清單面板 SHALL 開著，並已送出 `GET /api/profiles?page=0`

#### Scenario: [FE-B09-S02] `?panel=profiles&profile=<id>` 開著那一筆詳情

- **WHEN** 載入 `/world?panel=profiles&profile=<id>`
- **THEN** 人才面板 SHALL 開著且詳情蓋在上面，並已送出 `GET /api/profiles/<id>`

#### Scenario: [FE-B09-S13] `?panel=projects` 開著案件清單

- **WHEN** 載入 `/world?panel=projects`
- **THEN** 案件清單面板 SHALL 開著，並已送出 `GET /api/projects?page=0`

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

- **WHEN** 載入 `/world?panel=profiles&page=-1`、`/world?panel=profiles&page=abc`、`/world?panel=bogus`、
  以及 `/world?profile=<id>`（沒有 `panel`）各一次
- **THEN** 每一次 SHALL 都是可操作的畫面：前兩者是人才清單第 0 頁、`panel=bogus` 是沒有面板的世界、
  單獨的 `profile` 視為 `panel=profiles` 開著那一筆詳情
- **AND** 網址 SHALL 被改成對應的 canonical 形式（`/world?panel=profiles`、同、`/world`、`/world?panel=profiles&profile=<id>`）

#### Scenario: [FE-B09-S14] `?panel=projects&project=<id>` 開著那一筆案件詳情；帶錯面板的參數被去掉

- **WHEN** 直接載入 `/world?panel=projects&project=<id>`（本站沒有上一層紀錄）
- **THEN** 案件面板 SHALL 開著且詳情蓋在上面，並已送出 `GET /api/projects/<id>`；SHALL NOT 新增瀏覽紀錄；按 Escape 後詳情 SHALL 不再顯示且網址 SHALL 被**替換**成 `/world?panel=projects`（`FE-B09-S11` 的案件版，不離站）
- **AND WHEN** 案件清單開著（`/world?panel=projects`），使用者在清單裡開某一筆案件的詳情
- **THEN** 網址 SHALL 變成 `/world?panel=projects&project=<id>` 且瀏覽紀錄 SHALL 多一層；瀏覽器的上一頁 SHALL 回到 `/world?panel=projects`（詳情關、清單仍開）
- **AND WHEN** 載入 `/world?panel=projects&profile=<id>`、`/world?panel=profiles&project=<id>`、`/world?project=<id>&page=2`、`/world?profile=<a>&project=<b>`、`/world?panel=projects&project=<b>&profile=<a>`、`/world?panel=bogus&project=<id>`、`/world?project=not-a-uuid`、`/world?project=<a>&project=<b>` 各一次
- **THEN** 網址 SHALL 分別被改成 `/world?panel=projects`、`/world?panel=profiles`、`/world?panel=projects&project=<id>&page=2`、`/world?panel=profiles&profile=<a>`、`/world?panel=projects&project=<b>`、`/world`、`/world`、`/world?panel=projects&project=<a>`，每一次都是可操作的畫面，且這些 canonical 化 SHALL NOT 新增瀏覽紀錄（replace）

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

#### Scenario: [FE-B09-S09] 上一頁關最上層，下一頁依序重開

- **WHEN** 詳情開著（網址帶 `profile`），使用者按瀏覽器的上一頁
- **THEN** 詳情 SHALL 不再顯示，清單 SHALL 仍開著，網址 SHALL 不再帶 `profile`
- **AND** 再按一次上一頁，面板 SHALL 關閉，網址 SHALL 是 `/world`
- **AND** 按兩次下一頁之後，清單與詳情 SHALL 依序重新開著

#### Scenario: [FE-B09-S10] Escape 關一層，網址跟著少一層

- **WHEN** 詳情開著，使用者按 Escape
- **THEN** 網址 SHALL 不再帶 `profile` 但仍帶 `panel`
- **AND** 再按 Escape，網址 SHALL 是 `/world`

#### Scenario: [FE-B09-S11] 深連結直達，Escape 不離站

- **WHEN** 直接載入 `/world?panel=profiles&profile=<id>`（本站沒有上一層紀錄），使用者按 Escape
- **THEN** 詳情 SHALL 不再顯示，網址 SHALL 是 `/world?panel=profiles`

> jsdom 裡只有一層紀錄時 `history.back()` 是 no-op —— 用 back 實作的話網址會停在帶 `profile` 的那一個，這條紅。

### Requirement: 網址改變時世界不重掛

清單、詳情、翻頁、上一頁、下一頁、Escape 造成的網址變化，SHALL NOT 讓世界的 Canvas 重新掛載。

⚠️ **這是這一列最可能做錯、而且畫面上看不出來的地方**：畫面一樣、WebGL context 已經重建。

#### Scenario: [FE-B09-S12] 一連串網址變化，Canvas 是同一個 DOM 節點

- **WHEN** 在真瀏覽器裡從 `/world` 依序開清單、開詳情、上一頁、下一頁、Escape 兩次
- **THEN** 一開始抓住的那個 `canvas` 元素 SHALL 仍然連在 DOM 上，且仍是頁面上唯一的 `canvas`

> 這條的主要判準是 Playwright 的**節點同一性**（抓 element handle，不是 locator）。
> jsdom 掛不了 WebGL，那裡只能用一個探針證明「provider 那一層沒重掛」—— 探針數到 1 證明不了 Canvas，
> `key={url}` 綁在 Canvas 上探針照樣是 1（審查指出）。

### Requirement: 網址表示所在的場景，與面板參數同一個寫入者

`/world` 的 query SHALL 以 `room=<uuid>` 表示人在哪一間 Project Room；沒有 `room` 就是 Guild Hall。
`room` 不是 uuid 的形狀 SHALL 去掉（canonical）。`room` 存在時 `panel`／`profile`／`page` SHALL 一律去掉 —— 房間裡沒有看板，也就沒有清單那一層；
進房間的那一次寫入 SHALL 同時把面板狀態歸零。

`/world` 網址寫進 `history` 的入口 SHALL 只有一個（單一 commit：把場景與面板的變更合併成一次寫入）；
`room` 與面板參數可以各有自己的 parse／serialize，但 canonical 規則 SHALL 對整段 query 成立：
未知參數去掉、重複的 `room` 取第一個、大寫 uuid 轉小寫、參數順序固定為 `room`、`panel`、`profile`、`page`。
面板那一層寫網址時 MUST NOT 把 `room` 洗掉。

網址改變的時點：進房間的過場**開始**時 `pushState` 成 `/world?room=<id>`（多一層紀錄，跟開清單同一個規則；面板同時歸零）；
過場失敗時 `replaceState` 回 `/world`（不多一層）。瀏覽器上一頁 SHALL 回到 Guild Hall（走過場）；
上一頁進到一間進不去的房（票被拒）SHALL 走同一套失敗處置，網址同樣 `replaceState` 成 `/world`。
「回到 Guild Hall」按鈕 SHALL 是 `pushState('/world')` 而不是 `history.back()`：深連結直達房間的人沒有上一層可退（`FE-B09-S11` 的同一個問題），
而「站內進來的人按上一頁會再進一次房間」是瀏覽器紀錄的常態（首頁→頁面→首頁），不是要避免的事。

#### Scenario: [FE-V01-S08] `room` 的解析與 canonical

- **WHEN** 解析 `?room=<uuid>`、`?room=abc`、`?room=<uuid>&panel=profiles&page=2`、`?panel=profiles&page=2`、
  `?room=<UUID 大寫>`、`?room=<uuid-a>&room=<uuid-b>`、`?page=2&panel=profiles&foo=1`
- **THEN** SHALL 分別是 `{room:<uuid>, panel:null}`、`{room:null, panel:null}`、`{room:<uuid>, panel:null, page:0}`、`{room:null, panel:'profiles', page:2}`、
  `{room:<uuid 小寫>}`、`{room:<uuid-a>}`、`{panel:'profiles', page:2}`
- **AND** 七個都序列化回去 SHALL 是 `?room=<uuid>`、``、`?room=<uuid>`、`?panel=profiles&page=2`、`?room=<uuid 小寫>`、`?room=<uuid-a>`、`?panel=profiles&page=2`（canonical 是定點；再解析一次 SHALL 得到同一個值）

#### Scenario: [FE-V01-S09] 進房間多一層紀錄，上一頁回大廳

- **GIVEN** 在 `/world?panel=profiles`（清單開著）
- **WHEN** 進入 `room:<id>`
- **THEN** 網址 SHALL 是 `/world?room=<id>`，清單面板 SHALL 關閉
- **AND WHEN** 瀏覽器上一頁
- **THEN** 網址 SHALL 是 `/world?panel=profiles`、清單 SHALL 重新開著、連線 SHALL 回到 `scene=lobby`（走過場）—— 一次上一頁就到，不是兩次
- **AND WHEN** 瀏覽器下一頁
- **THEN** 網址 SHALL 是 `/world?room=<id>` 並開始進房間的過場
- **AND**（瀏覽器）`canvas` SHALL 是同一個節點、頁面 SHALL 沒有整個重新載入（掛載時放的記號仍在）
