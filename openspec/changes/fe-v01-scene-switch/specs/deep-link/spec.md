## Applicability

權限：不適用 —— 網址只表示所在場景，票不在網址裡。
併發：不適用 —— 單一寫入者，順序由 React 的 effect 決定。
持久資料相容性：不適用。
失敗路徑：適用 —— `room` 不是 uuid、`room` 與 `panel` 同時出現。
測試連到什麼：不適用 —— 純函式測試與 jsdom 的 `history`；瀏覽器部分沿用 `world-scenes` 那條的偽造方式。

## ADDED Requirements

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
