## Applicability

權限：不適用 —— 網址只表示開著哪一層；詳情本身的 401 歸 `project-directory`
併發：不適用
持久資料相容性：不適用 —— 網址不是持久資料
失敗路徑：適用 —— 帶錯面板的參數、單獨的 `project`、兩個詳情參數同時出現
測試連到什麼：不適用 —— `urlState` 是純函式；`deep-link.test.tsx` 只連本機自起的 `contract-server` 替身

## MODIFIED Requirements

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

- **WHEN** 載入 `/world?panel=projects&project=<id>`
- **THEN** 案件面板 SHALL 開著且詳情蓋在上面，並已送出 `GET /api/projects/<id>`；開詳情 SHALL 多一層瀏覽紀錄、Escape 或上一頁 SHALL 回到 `/world?panel=projects`
- **AND WHEN** 載入 `/world?panel=projects&profile=<id>`、`/world?panel=profiles&project=<id>`、`/world?project=<id>&page=2`、`/world?profile=<a>&project=<b>`、`/world?panel=projects&project=<b>&profile=<a>`、`/world?panel=bogus&project=<id>`、`/world?project=not-a-uuid`、`/world?project=<a>&project=<b>` 各一次
- **THEN** 網址 SHALL 分別被改成 `/world?panel=projects`、`/world?panel=profiles`、`/world?panel=projects&project=<id>&page=2`、`/world?panel=profiles&profile=<a>`、`/world?panel=projects&project=<b>`、`/world`、`/world`、`/world?panel=projects&project=<a>`，每一次都是可操作的畫面，且這些 canonical 化 SHALL NOT 新增瀏覽紀錄（replace）
