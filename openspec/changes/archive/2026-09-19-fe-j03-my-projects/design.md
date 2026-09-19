## Context

專案看板（`BoardPanel` → `ListPanel`）是一個分頁容器：`useListPage` 打 `GET /api/projects?page=N`（後端預設 `status=recruiting`）、
「開著哪一筆、第幾頁」住在 `ListPanelProvider` 的 `route`（`{ panel, profile, project, page }`），`PanelUrlSync` 把它寫進網址（`FE-B09`）。
詳情蓋在列表上（`overlay`、列表 `inert`），owner 的成軍／結案（`OwnerActions`）在詳情的插槽裡，成功後 `replace(next)` 更新詳情、
成軍時 `reload()` 重取招募中的第 0 頁、`refreshRooms()` 立即重取門。

後端（`FE-O08`、`app/api/projects.py`）：`GET /projects?status=<recruiting|active|closed>&page=N`，`PAGE_SIZE=20`，`expires_at > now()`
對三種狀態都過濾，沒有 owner 篩選、沒有總數。替身的 route（`src/app/api/projects/route.ts`）已接受 `status`；
前端的 `listProjects` 操作還沒有 `status` 參數。

標題列在房間裡已經有 4 個入口（`FE-X16-S19` 上限 5、`FE-K05` 還要一個），所以入口不進標題列。

## Decisions

### D1｜「我的案件」是看板的一個**視圖**，不是第二個面板；住在 `route.view`

`ListPanelProvider` 的 `route` 多一個 `view: 'mine' | null`（只在 `panel === 'projects'` 下有意義）。`PanelUrlSync` 的解析與序列化
按 `deep-link` 的 delta：`view=mine` 只在案件面板下、不合法視同沒有、`view=mine` 時 `page` 去掉、切換用 replace。
`openPanel('projects')` 開的是招募中（`view: null`）；深連結帶 `view=mine` 直接開在我的案件。
不做第二個面板的理由：一次只有一個阻斷式面板（`FE-X16`）、兩個面板的網址與讓位規則會加倍；而「我的」本來就是同一份資料的另一種切法。

### D2｜`ListPanel` 多一個 `body` 插槽：有它就不畫分頁列表與翻頁，其餘（標題列、工具列、overlay、inert、關閉、讓位）照舊

`ListPanel` 的狀態機（`useListPage`）綁著分頁；「我的案件」不是分頁（是三種狀態的掃描），硬塞進 `useListPage` 會把 `S07`～`S09`
的翻到底規則變成謊言。所以容器多一個 `body?: ReactNode`：有它時內容區畫 `body`、不畫列表與「下一頁」，`useListPage` 不跑
（`view=mine` 時招募中的請求零個）；`overlay`／`subScreen`／`toolbar`／`inert`／`onClose`／`panel` 都不變 —— 詳情仍蓋在 `body` 上、
`body` 仍 `inert`、捲動位置仍在（`body` 不卸載）。**`list-panel` 的 Requirement 不動**：`body` 是插槽不是狀態；判準沿用既有的。

### D3｜掃描是一個純函式加一個 hook；三種狀態並行、每種一條序列、上限 5 頁；作廢用 generation

`src/projects/myProjectsScan.ts`（純）：`mergeMine(pages, me)` —— 三種狀態的頁陣列 → 只留 `owner_id === me`、依 `updated_at` desc、
回 `{ items, seen, capped: Status[] }`；`nextPage(len)` —— 不滿 `PAGE_SIZE` 就停、滿就 +1、到 `MAX_PAGES=5` 就 `capped`。
`useMyProjects(me, active)`：三條並行的 `for` 迴圈各自 `await listProjects({ status, page, signal })`；一個 `AbortController` 加一個
`generation` 計數：切視圖、重試、重掃都 +1 並 abort，晚到的回應比對 generation 不對就丟（`FE-B01-S15` 同一招）。
狀態：`{ phase: 'loading' | 'ready' | 'failed' | 'blocked', items, seen, capped, cause }` —— 任一請求失敗整個 `failed`（不把兩種狀態的結果當完整），
401 → `blocked`（`EmptyState` 的 `permission`）。上限 5 頁是 demo 的量（一種狀態 100 筆）；到上限的狀態列進 `capped`，畫面逐一標明。

### D4｜成軍／結案回來就地更新：`MyProjects` 持有 `items`，詳情的 `onReplaced` 同時 `replace(next)` 與 `patchMine(next)`

`ProjectBoard` 在 `view === 'mine'` 時把 `onReplaced` 多接一條：`setMine((items) => items.map((p) => (p.id === next.id ? next : p)))`；
不呼叫 `reload()`（那是招募中列表的重取，`view=mine` 時 `useListPage` 沒跑、也沒有東西可重取）；`refreshRooms()` 照舊。
不重掃的理由：掃描最多 15 個請求，成軍後為了一筆狀態重打 15 個是浪費，而且回應本身就是最新的那一筆（`FE-J04` D6 同一個原則）。

### D5｜工具列：「發案」主要、視圖切換是兩顆 `aria-pressed` 的次要鈕（`FE-X16-S09` 一個操作區一個主要）

跟 `/login` 的帳號分頁同一種形狀（`role="group"`＋兩顆 `SECONDARY`＋`aria-pressed`）。切到「我的案件」時「發案」仍是主要、仍能發；
發案成功後的「回第 0 頁重取」（`FE-J01-S05`）在 `view=mine` 下改成重掃（新案子要出現在我的案件裡）—— 這是 `FE-J01` 那條的自然延伸，不改它的 Requirement。

### D6｜效能

新元件與 hook 進 board chunk（只在面板開時載）；招募中視圖零新請求、零新節點。掃描只在切到我的案件時發：最多 3 × 5 = 15 個請求，
demo 的資料量下通常 3 個。預期 JS +2 KB gz 以內；量前後差貼 PR。

## Risks

- 後端補了 owner 篩選（已在給後端的清單裡）之後：`useMyProjects` 換成一個請求，`capped`／`seen` 的標示自然消失；規格的可見行為（清單、狀態、詳情接合）不變，掃描那條 Requirement 屆時要 `spec/` 改掉。
- 到期的 `active` 案子後端不回：owner 看不到自己已成軍但到期的案子。這是後端行為（`FE-O08` 量過），畫面標明；不在前端另外打 `GET /projects/{id}` 補。
- 兩個分頁同時操作（一個結案、另一個仍顯示招募中）：跟 `FE-J04` 一樣是 UI 的圍堵不是保證，後端仍會 200。
