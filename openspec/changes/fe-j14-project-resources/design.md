## Context

動機見 proposal。這裡只記做法會受限的現況：

- **後端契約**（`BE-G12-FE-J14-contract-draft.md` v0.3 §11 收斂、小玉 2026-09-15／16 裁決）：四個端點、權限 × 狀態矩陣（`internal-backend` 那張表）、
  每專案 50 筆、未知欄位靜默忽略、明確 `null` → 422、長度與格式違反 → 500 text/plain、`label` 不 trim 但不得只含空白、網址不正規化且可重複。
  後端實作在 `GuildHub-backend` 的 `feat/be-g12-project-resources`，**由另一條工作線做**；本 change 不改後端。
- **真後端的票在 session 裡**：`enter` 把 token 寫進 `request.session["room_tokens"][project_id]`，`require_room_token` 從 session 讀，
  驗簽章、期限、房間、持有人（`app/deps.py:41-67`）。前端請求上**不帶票**。
- **本地後端沒有 server-side 的票**：`src/app/api/projects/[project_id]/enter/route.ts:14` 註解與 `room-entry-gate` 主規格都明寫。
  非 owner 讀資源要驗票，本地得先有東西可驗（D4）。
- **`closed` 的專案仍拿得到票**（`enter` 不看 `status`，`FE-N08-S12`）：資源端點必須自己看狀態，不能靠票。
- **沒有 lifecycle 推播**：`protocol.py` 沒有「專案結案」事件；前端也沒有別的管道知道面板開著時專案被結案。
- **`CONTEXT.md`〈3D 憑什麼存在〉**：「走到物件、按 E、開 DOM 面板」本身就是那條很貴的導覽列。
- **`world-scenes` 的 `FE-V01-S03`** 字面禁止 `room` 場景有任何看板註冊；`fe-w16-project-room`（未封存、0/15）同時 MODIFIED 同一條 Requirement。

## Goals / Non-Goals

**Goals:**
- 前端的資料層、本地後端、契約測試對 21 個端點是**同一份契約**，兩個目標跑同一組測試。
- 使用者在房間裡不開面板就看得到前幾筆資源；owner 在面板裡能安全地增修刪。
- 伺服器一定會拒絕的輸入不送出；伺服器仍拒絕時說得出是哪一種，不猜。

**Non-Goals（設計層）:**
- 不為了「面板開著時即時知道結案」加輪詢、加 WS 事件、或在其他元件訂閱專案狀態。
- 不做前端快取層的一般化（只做資源這一份共享狀態，不順手抽象成全站 store）。
- 不在這個 change 決定看板在房間裡的座標、朝向、跟工位的相對位置（`project-room-layout`，後續規格 PR）。

## Decisions

## D1｜看板與面板讀同一份資源狀態；寫入以伺服器回應為準，不樂觀更新

每個 `project_id` 一份資源狀態（清單、載入中、失敗的 `UiError`、專案狀態確認的結果），看板與面板都訂閱它。
看板掛載時讀一次；面板開啟時**不另外讀**（看板已經讀過）；寫入成功後用伺服器回應更新：POST 接在最後、PATCH 就地取代、DELETE 移除。

- **不選**：面板自己讀一份、看板自己讀一份 —— 兩份會漂（`FE-W20` 在 WBS 上要的正是「看板上的摘要與按 E 開出來的面板一致」的判準），
  而且開面板就多一次請求（`FE-J14-S24`）。
- **不選**：`createOptimistic` 樂觀更新 —— 資源的 `id`、`created_at` 由伺服器產生，順序由它們決定；
  先插一筆假的再換掉，順序可能跳動，而且 409（上限、結案）是常見路徑，回滾比等回應更吵。代價：送出到畫面更新之間有一次往返的延遲。
- 訂閱的生命週期跟著看板（房間子樹重掛就重建）；沒有看板時單獨開面板（測試）才由面板觸發讀取。
- **讀取時機是封閉的四種**（規格〈讀取的時機是封閉的〉）：看板掛載一次、面板每次開啟一次（同一次掛載的**第一次**開啟與看板共用那一次）、
  使用者按的重試、規格指名的重讀。第二輪審查指出初稿的「面板開啟時不另外讀」與 `FE-J14-S05`「關掉再開才發現結案」互相矛盾 —— 現在的寫法把兩者接上了：
  第一次開啟共用、之後每次開啟都重讀，而那正是不輪詢時唯一能發現結案的時機。
- 晚到的淘汰規則同時適用**資源讀取**與**專案狀態確認**：晚到的 `active` 不得把已呈現的「已結案」改回去（第二輪抓到）。
- **看板顯示的是最舊的 k 筆**（排序固定 `created_at ASC`，不做排序調整）：超過 k 筆之後新加的資源不會出現在看板上，要按 E 才看得到。
  接受這個代價 —— 專案的核心工具通常最早建立；要改就是改排序或讓看板顯示最新幾筆，那是一次規格變更，不在本案（審查者提出，列為不阻塞）。

## D2｜403／409 之後確認一次專案狀態，是 `closed` 才說「已結案」

小玉 2026-09-16 的 Q2 裁決是 **A：下一次讀／寫拿到 403／409 就換成「已結案」、收掉寫入控制項，不輪詢**。
逐條查證之後，**403 與 409 都不是只有結案一個意思**：

| 碼 | 除了結案，還可能是 |
|---|---|
| 讀取 403（非 owner） | 專案仍 active，但票過期了（真後端的票有 TTL，`app/room_token.py`）或這個 session 沒進過房 |
| 新增 409（owner） | 專案仍 active，但另一個分頁已新增到 50 筆 |
| 寫入 403 | 身分換了（同一個瀏覽器換帳號） |

直接照字面把它們都說成「已結案」，會把「票過期」「滿了」講成「專案結束了」—— 那違反 `room-entry-gate` 已經立下的「不猜原因」。
前端又 MUST NOT 讀後端的 `detail` 來分辨（`FE-X03`）。所以做法是：**拿到 403／409 時打一次 `GET /api/projects/{id}`**，
`closed` 才呈現已結案；否則照 `kind` 呈現（`project-resources`〈結案與權限失敗〉）。

- 這仍然是 Q2=A：只在**使用者自己觸發的**讀寫失敗之後多讀一次，不輪詢、不訂閱。
- 代價：失敗路徑多一次請求；確認本身失敗時退回 `kind` 的呈現，不說已結案。
- ✅ **小玉 2026-09-16 確認採用精確化版**（原本的 Q2=A 字面保留在〈已決〉紀錄裡）。
- **兩位審查者都指出原本的分支沒有封閉**，已補進規格：確認回 401 → 用 401 的那一句（登入失效比原本那個碼更接近事實）；
  確認回 404 → 用 404 的那一句；確認結果是 `recruiting` 或任何非 `closed` 的狀態 → 一律不說已結案；
  403／409 不分是 GET、POST、PATCH 還是 DELETE，都走同一條確認路徑；**每一次失敗各確認一次，不得把 `active` 快取起來**
  （快取的話結案永遠發現不了 —— 那正是 Q2 要解的問題）。

## D3｜本地寫入：先鎖專案列，再計數與寫入（跟後端 B4 同形）

本地的 POST／PATCH／DELETE 在同一個交易裡：第 1 句 `SELECT … FROM projects WHERE id=$1 AND owner_id=$me AND status='active' FOR UPDATE`；
零列才做 404／403／409 的診斷；第 2 句才計數（POST，≤50）與寫入。**鎖與計數不能擠成同一句**：Read Committed 下單句的計數用語句開始時的快照，
看不到等鎖期間別人剛提交的列，上限會被突破（`FE-J14-S32` 那個並行測試要抓的就是這個）。

- **不選**：單句 `INSERT … SELECT … WHERE (SELECT count(*) …) < 50` —— 同一個快照問題。
- **不選**：本地不管併發 —— `internal-backend` 的 Purpose 是複製可觀察行為，「本地比真後端好用」或「本地比真後端鬆」都是在製造假象。

## D4｜本地「伺服器端記住票」：`enter` 成功時多發一個簽章的 HttpOnly cookie

`room-entry-gate` 的 MODIFIED 要求本地 `enter` 成功後，同一個 session 在 REST 上被認得持有那間房的票，且前端請求不帶票。
做法：`enter` 成功時除了回 `EnterOut`，另外對**那一間房**發一個 cookie：`Set-Cookie: room_grant_<project_id>=<profile id>.<HMAC(secret, "<project_id>|<profile id>")>`
（⚠️ **HMAC 的輸入必須同時蓋住 `project_id` 與 profile id**：只簽 profile id 的話，把 A 房那個有效值改個 cookie 名稱貼成 `room_grant_<B>` 就讀得到 B 房 —— 第二輪審查抓到）
（HttpOnly、`Path=/`、`SameSite=Lax`，非 `local` 加 `Secure`，屬性跟 `session` 相同）；資源端點驗簽章、且 `<profile id>` 等於目前 session 的身分。

⚠️ **一間房一個 cookie，不是一個裝著集合的 cookie。** 審查指出集合寫法有覆寫競態：兩個分頁同時 `enter` 兩間房，
兩邊各自讀到舊集合、各自加自己那一間再寫回，後回來的會蓋掉先回來的，使用者密碼都輸對了卻只拿到一間房的票。
每間房各自一個 cookie 名稱，瀏覽器以名稱合併，**兩次 `Set-Cookie` 不互相覆寫**，競態消失。
cookie 總量的上界因此由瀏覽器的每網域 cookie 數限制決定（不是 50 —— 50 是每專案的資源筆數上限，跟能進幾間房無關；
初稿把兩者混為一談，審查抓到）。同一個瀏覽器實際會進的房間數遠低於那個限制；真的超過時最舊的票失效，使用者重新輸入密碼即可。

- **為什麼像真後端**：真後端的 session 本來就是 Starlette 的簽章 cookie，`room_tokens` 就放在裡面 —— 可觀察的語意是「這個瀏覽器的 cookie 帶著它」。
- **不選**：改 `session` cookie 的格式把票塞進去 —— 那會 MODIFIED `internal-backend`〈session 是簽章的 HttpOnly cookie〉的格式句，影響面比這個 change 大。
- **不選**：`1xx_room_grants` 資料表 —— `db:reset` 之後 cookie 還在但表空了，行為跟真後端（cookie 在就在）相反；而且要多一個前端獨有的表。
- **不選**：前端在資源請求上帶 header —— 兩個目標的請求不同，`data-access`〈元件不知道自己連的是誰〉與「真後端不收 header 的票」都不允許。
- 跟 ADR 0008（票只在簽發者的 process 內有意義）一致：這個 cookie 的內容是本地後端自己的格式，前端不解析。**不新增 ADR**。
- 已知差異（沿用 N08 D7）：**本地不過期**（真後端的票有 TTL）。
- **同一個人重新登入之後票還在，這一點兩邊相同**，不是本地的漏洞：真後端的 `/api/login` 只寫 `session["user_id"]` 等鍵、
  **不清 session**（`app/api/auth.py` 的 `_remember()`），`room_tokens` 照樣留著；換成別人登入時，真後端比對 `claims.user_id != me` 回 403，
  本地比對 cookie 裡的 profile id，語意相同（審查者之一主張這是本地獨有的安全漏洞，查證後不成立）。
- 本地沒有登出端點（17 個端點裡沒有），所以沒有「登出要清票」這條路徑。

## D5｜網址送原字串；前端的格式判定是「`safeHref` 放行 ∧ 不含空白」

後端資料庫的格式 check 是 `url ~* '^https?://[^[:space:]]+$'`（`~*`＝**不分大小寫**，所以 `HTTPS://EXAMPLE.COM/x` 合法；
一位審查者以為是區分大小寫、判定 `FE-J14-S11` 與資料庫矛盾，查 `BE-G12-FE-J14-contract-draft.md` 的 SQL 後不成立）；
`safeHref` 用 URL 解析器，**兩者不等價**：
`new URL(' https://x')` 會吃掉前導空白而放行、`https://example.com/a b` 會被編成 `%20` 而放行 —— 送原字串到後端都是 500；
反過來 `https://[` 資料庫收、`safeHref` 不收。所以前端即時擋的格式條件是 `safeHref(輸入) !== null` **且**輸入不含空白字元，
送出的是**原字串**，不是 `safeHref` 的正規化結果。

- **不選**：送 `safeHref` 的正規化值 —— 使用者存進去的字跟打的不同（大寫 scheme 變小寫、加尾斜線、`%20`），而契約 D6 明定不做 canonicalization；
  而且正規化會改變長度，長度檢查就得對「另一個字串」做。
- 渲染一律 `SafeExternalLink`，資料庫裡已經存在但 `safeHref` 不放行的（例如 `https://[`）顯示純文字（`FE-J14-S02`）。

## D6｜寫入者＝`me.id === project.owner_id` ∧ `project.status === 'active'`，資料走既有 operation

面板與看板需要 `getMe` 與 `getProject` 的結果；兩者都已經在 `src/api/operations.ts`。任何一個還沒回來時沒有寫入控制項（`FE-J14-S10` 的 (d)）。
隱藏控制項只是 UI；伺服器的 403／409 仍照 D2 處理。

## D7｜看板是 3D 物件、摘要畫在看板上；掛進房間與 `FE-V01-S03` 的改寫留給後續規格 PR

小玉 2026-09-16 的 Q1 裁決是 **B：房間裡一個 3D 看板物件，走過去按 E 開面板**（Claude 原推薦 A：DOM HUD，不採）。
這帶出三件事，處理如下：

1. **撞 `FE-V01-S03`**：它的原意是「Guild Hall 的兩塊看板不掛進房間」，字面是「任何看板」，而 `tests/world-scenes-hall-only.test.tsx:103` 用 `board-` 前綴判定。
   正確的處置是 MODIFIED 那條規格、把範圍收成 Guild Hall 的看板，再加「房間裡恰好有資源看板」。**不換識別字前綴繞過**：測試會綠，但規格字面仍被違反。
2. **`world-scenes` 被 `fe-w16-project-room` 同時改著**：在同一個 capability 上疊第二個 MODIFIED，archive 時後封存的會整條覆蓋先封存的（`AGENTS.md`〈平行開發〉）。
   所以本 change 不碰 `world-scenes`／`project-room-layout`；`FE-W16` 封存後另開 `spec/` PR（可以是本 change 的 spec 更新，也可以是獨立的小 change，屆時決定）。
3. **3D 變成導覽列**：緩解是看板**自己**顯示前幾筆的 type 與名稱（`FE-J14-S22`），房間裡的人不按 E 也知道這個專案用哪些工具；
   按 E 才是完整清單與寫入。這個緩解**不完全解決** `CONTEXT.md` 的質疑 —— 資源本來就是「點出去」的東西，這裡能做的是讓「看見」不需要按 E。

看板的元件、互動註冊、摘要渲染在本 change 實作並以單獨掛載驗證；`--room` 那一片等後續規格 PR 合併才做。

## D8｜修改只送改過的欄位；沒改就不送

後端是真正的 partial PATCH。只送改過的欄位，另一個分頁同時改了別的欄位時不會被這次覆蓋回舊值。
「沒改就按送出」**不禁用送出鈕**（`form-conventions`：送出鈕只因即時錯誤或送出中禁用），而是直接結束修改、不發請求（`FE-J14-S18`）。

## D9｜50 放在 `LIMITS`，出處指向後端

每專案 50 筆是後端應用層的常數，不是資料庫 check。它跟長度一樣是「後端決定、前端必須知道」的數字，放 `LIMITS`（`resourcesPerProject`），
`LIMIT_SOURCES` 指向後端實作的檔案與行號。它不是字串長度，契約測試的邊界表把它標成由 `FE-J14-S32` 專門驗（不走 `boundaryValues`）。

## Risks / Trade-offs

- [後端 PR 還沒合併：資源的 404／403／409 `detail` 字句、422 與 403／404／409 的先後都還不知道] → 規格只要求「兩個目標逐字相同」與「先後相同」，
  由契約測試對兩個目標同一組決定；`--contract` 那一片在後端合併後才開始，不在前端先猜。
- [`BE-G33`：換 scene 時新連線可能被舊連線的斷線清掉] → 影響 `--room` 那片的 e2e 穩定度，不影響資料層與面板；那片開工時再確認 BE-G33 狀態。
- [看板卡槽數在固定相機下讀不讀得清楚，要實作才量得出來] → 列為待答常數；規格只定值域與行為。
- [D2 多一次請求] → 只在失敗路徑、只在使用者觸發之後，一次。
- [D4 本地 cookie 不過期、有集合上限] → 已知差異，不進兩個目標共用的契約（契約只驗「進過才讀得到、別間與別人不算」）。
- [`FE-W16` 擋住最後一片] → 前六片不受影響；規格與 tasks 明寫沒掛進房間不得宣稱完成。
  2026-09-16 的現況比預期樂觀：`feat/fe-w16-project-room--layout` 已經有 layout 片的判準、實作與突變紀錄（tasks 1.1、2.1–2.3 已勾）。
- [**archive 被 W16 擋住期間，main 的規格會落後 main 的程式碼**：前六片合併後，`openspec/specs/api-contract` 仍寫 17 個端點、
  `internal-backend` 仍沒有資源四端點，直到整個 change archive] → 這是 OpenSpec「一個 change 一次 archive」的結構性代價，不是這份規格獨有。
  **fallback（W16 若長期停住）**：把第 7 節（看板掛進房間）抽成同一個 WBS ID 底下的**另一個 change**（`AGENTS.md` 允許一個 ID 有多個 change），
  讓 `fe-j14-project-resources` 先 archive，房間整合另走一份 spec → feat → archive。觸發條件寫在 tasks 7.2。
- [**觸控裝置上到不了資源**：`CONTEXT.md:216`「主要輸入是觸控就不載 3D」，而 DOM-only 那一面今天只有看板／名片／收件匣／登入，
  **本來就沒有 Project Room**] → 不是這個 change 造成的缺口，也不在本 change 解（proposal Non-goals）。
  觸發條件：哪一天 `FE-X08` 的 DOM-only 面把 Project Room 納進來，資源要一起補一個 DOM 入口 —— 那時開 `spec/` PR，不是現在偷偷加。
- [名稱與網址可能含存取權杖，結案後仍保留] → 表單在送出前讓 owner 知道可見範圍（`FE-J14-S15`）；刪除是 hard delete。不做更多（不遮罩、不加密）。

## Migration Plan

- 前端沒有要遷移的使用者資料。本地開發庫在同步 `db/schema/001_schema.sql` 之後跑一次 `npm run db:reset`（可拋棄，規則允許）。
- **不對 Railway 做任何事**。真後端的部署與資料能不能丟由部署那天問組長或部署負責人（工作清單 §4），不在本 change。
- 回滾：每一片是獨立 PR，可單獨 revert；`--local-backend` 被 revert 時契約測試 `local` 目標會紅，那是預期的訊號。

## Open Questions

- **看板卡槽數 C 的值**（1–50）：實作 `--room` 時在固定相機下量，能讀出名稱的最大值。不改規格（規格以常數寫）。
- **五種 type 的圖示**：動 tsx 前過 `ui-ux-pro-max` 決定；規格只要求可辨識且有可及名稱。
- **資源的 404／403／409 `detail` 字句與錯誤先後**：以後端 PR 為準（見 Risks）。
- **看板掛進房間的後續規格是本 change 的 spec 更新，還是獨立 change**：`FE-W16` 封存時決定；兩者對 tasks 的影響只在 7.1 的寫法。
