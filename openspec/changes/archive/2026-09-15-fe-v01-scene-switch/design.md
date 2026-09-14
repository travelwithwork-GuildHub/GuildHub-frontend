# `FE-V01` 設計

## D1｜場景是一份封閉的註冊表，四個讀取者都從它讀

`src/world/scenes/registry.ts`：

```ts
export type SceneRef = { id: 'hall' } | { id: 'room'; projectId: string }
export interface SceneDef {
  /** 交給 WebSocket 的 `scene` 查詢參數。只有這兩種形狀（`scenes.py:11`）。 */
  wsScene: string           // 'lobby' | `room:${projectId}`
  layout: readonly LayoutItem[]
  spawn: { x: number; z: number }
  /** 這個場景要不要驗 token（`manager.py:71`：只有 `room:` 驗）。 */
  needsToken: boolean
}
export function sceneOf(ref: SceneRef): SceneDef
```

- **`projectId` 的合法域是 uuid（小寫）**，不是後端正規式的 `[0-9a-zA-Z\-]+`：前端的 id 只從 `GET /api/rooms` 與網址來，兩邊都是 uuid；收寬會讓 `?room=abc` 這種東西「程式內部進得去、序列化出來不穩定」（審查抓到的）。`sceneOf` 對不合的 `projectId` 拋錯
- **`SceneRef` 是 discriminated union，不是字串。** `'room:abc'` 這種字串要 parse 才知道 `projectId`，parse 就有第二份規則。`wsScene` 是**推導**出來的（`sceneOf` 算），跟 `scenes.py` 的正規式對得上是一條測試（`S01`）
- 四個讀取者：`WorldShell` 掛 `sceneOf(ref).layout`（不再直接 `<GuildHall />`）、`LocalPlayer` 收 `spawn` prop（不再 import `guildHallLayout.SPAWN`）、`RemoteWorld` 收 `wsScene`／`token`、`WorldGate` 不再寫 `SCENE`（見 D6）
- **只在 Guild Hall 的東西**（走廊的門 `ProjectDoors`、看板 `BoardTargets`、門標籤 `DoorLabelProjector`／`DoorLabels`、`RoomsNotice`、`useRooms` 的輪詢）掛在 `ref.id === 'hall'` 的分支下。房間裡沒有門也沒有看板 —— 不是「有但看不到」，是**不掛**（`S03`）：`useRooms` 在房間裡繼續打 `GET /api/rooms` 是白打的
- 房間的配置 `src/world/layout/projectRoomLayout.ts`：四面 `role: 'boundary'` 的牆 ＋ 出生點在原點，**沒有別的**。`FE-W16` 會把桌子擺進去 —— 它動的是這個檔案，不動註冊表。`world-layout` 的判準（`FE-W11-S05` 識別字不重複、`S07` 沒有東西擺到區域外、`S08` 邊界只來自配置）對這份配置同樣跑一次（`S02`）
- `PHYSICS.halfExtent` 維持單一來源、兩個場景共用。`FE-W16` 要改房間大小時再談 —— 今天沒有讀取者需要「每個場景不同尺寸」

## D2｜`room` 進網址：一個 history 寫入者，canonical 對整段 query 成立

**現況的坑**：`src/list-panel/urlState.ts` 的 `serializePanelUrl()` 回的是**整段** query（`''` 或 `?panel=…`），`PanelUrlSync` 直接把它寫進 `history`。所以只要面板層寫一次網址（開清單、翻頁、甚至只是 canonicalize），`?room=<id>` 就會被洗掉 —— 使用者在房間裡開一次收件匣、重新整理，人就回大廳了。

三條路：

| | 做法 | 為什麼不 |
|---|---|---|
| A | `room` 進 `PanelUrlState`，同一個 parse／serialize／sync 管 | 面板模組多知道一個「場景」概念 |
| B | 另寫 `SceneUrlSync`，兩邊各自「只動自己的鍵、保留別人的」 | **兩個寫入者**：進房間同時要關面板（看板是大廳的），一個 push 一個 replace，紀錄堆疊順序看時序 |
| C | 唯一的 `WorldHistory` 寫入者：收 `{ scenePatch?, panelPatch?, mode: 'push' \| 'replace' }`，合併目前網址後**寫一次**；場景與面板各留自己的 codec | 多一層組合 |

**選 C**（第一版是「整個 codec 也只有一份」，審查指出真正必須唯一的是 history 的 commit，不是資料模型 —— 一個持續膨脹的全域 codec 比兩個小 codec 加一個組合層更難守）。`deep-link` 的 Purpose 第一句「網址是這一層的**單一事實來源**」要的是一個寫入者。

canonical 規則對整段 query 成立（`FE-V01-S08` 列了邊界）：`room` 不是 uuid → 去掉；大寫 → 小寫；重複 → 第一個；未知參數 → 去掉；`room` 存在時 `panel`／`profile`／`page` 一律去掉（房間裡沒有看板，也就沒有清單那一層；`FE-B01` 的面板是看板開的）；順序固定。**這條反過來也成立**：進房間的那一次寫入，面板狀態同時歸零。

**網址什麼時候改**（審查指出沒裁決）：過場**開始**時 `pushState`；失敗時 `replaceState('/world')`。理由：URL 是「使用者要去哪」的紀錄，不是「連線成功了沒」的紀錄 —— 開始時就改，重新整理會重試同一個目的地（票在就進、票不在就回大廳並說明）；失敗用 replace 是為了不留一層「按上一頁會再撞一次牆」的紀錄（`S06` 驗）。

歷史紀錄：進房間 `pushState`（多一層，跟開清單同一個規則）；「回到 Guild Hall」按鈕是 `pushState('/world')` 不是 `back()`：`back()` 在「深連結直達房間」的人身上會離站（`FE-B09-S11` 同一個問題）。審查提的替代（記錄 entry provenance：站內進來的用 `replaceState`）沒採：它讓同一顆按鈕在兩種情況下留下不同的紀錄形狀，而「首頁→頁面→首頁，按上一頁回到頁面」是每個網站的常態，不是要避免的循環。Gemini 同意 push；codex 要求規格明定產品想要這個循環 —— 已寫進 `deep-link` delta 的正文。popstate 進到進不去的房間：走 D4 同一套（含 `replaceState`）。

## D3｜過場是場景子樹以 `key` 重掛，Canvas 不重掛

```
<Canvas>                                  ← 同一個 DOM 節點（FE-B09-S12 的判準）
  <WorldCamera/> 燈光
  <SceneSubtree key={sceneKey}>           ← 換場景時整棵重掛
    <WorldShell layout/> <LocalPlayer spawn/> <RemoteWorld wsScene token/>
    {hall && <ProjectDoors/> <BoardTargets/> <DoorLabelProjector/>}
    <SpatialInteraction/>
  </SceneSubtree>
</Canvas>
```

`sceneKey = wsScene`（token 不進 key：token 換了但 scene 沒換的情況今天不存在 —— `FE-N08` 重新換票也是先回大廳）。

**為什麼用 `key` 而不是逐個元件處理「場景變了」**：

- `LocalPlayer` 的物理世界（rapier）裡的靜態碰撞體是配置生成的；換配置＝全部拆掉重建，**跟重掛是同一件事**。加一個「請把碰撞體換掉、把角色搬到新出生點、把節流重置」的 API，是在重刻 unmount／mount
- `RemoteWorld` 的 effect cleanup **已經**會關連線、清兩個容器（`RemoteWorld.tsx:124-131`）。React 保證同一次 commit 裡所有 cleanup 先於所有新 effect，所以「同步的那一半」（移除監聽器、呼叫 `close()`）由 React 的順序保證
- **非同步的那一半 React 保證不了**（審查指出）：舊 socket 的 close 幀要到伺服器、伺服器要處理 `disconnect()`。而 `manager.disconnect()` 只查同 scene 的兄弟連線，新連線若已在另一個 scene `join()`，被 `presence.clear()` 的是**新的那個人** —— 連線開著、房間裡沒人看得到他（`realtime-client` delta 寫了證據）。所以新連線要等舊 socket 的 `close` 事件（上限 1 秒）：這是 `RealtimeClient` 的一個小改（`close()` 留一個一次性的 close 監聽器、`closeAndEnter()` 等它或 1 秒），是 `realtime-client` 那條 Requirement 的 MODIFIED，`FE-V01-S18` 驗。**它是降機率不是證明**（第二輪 codex 指出：close 事件只代表伺服器傳輸層回了 close 幀，應用層的 `disconnect()` 是否跑完客戶端看不到）—— 規格正文照這樣寫，根治記成 `BE-G`（tasks 6.3）。「任何時刻不得兩條」因此也只能是客戶端的定義：兩條**尚未呼叫 `close()`** 的
- 過場有代號（transition generation）：`ready`／`closed`／兩個計時器都比對代號，不是當前過場的一律忽略；提交一次、其餘計時器取消（`S15`）。Strict Mode 的雙重 effect 靠既有的 `RemoteWorld` 寫法（建 client 在 effect 內、cleanup 關掉）—— `S04` 包 `<StrictMode>` 跑
- **物理世界在 `LocalPlayer` 的 effect 裡建**（`LocalPlayer.tsx:76`），在 `SceneSubtree` 裡面 —— 重掛＝舊 rigid body／colliders 全拆、新配置全建（`S04` 驗碰撞體恰好是房間的）
- `PositionSync` 靠 client 物件身分判斷 session generation（`position-sync` 那條），重掛自然給它一個新的

**Suspense**：子樹重掛時 fallback（`null`）可能短暫出現；覆蓋層獨立於它、蓋在上面，所以看不到黑一幀。載入失敗（chunk、wasm）走 `FE-X01-S04` 既有路徑，覆蓋層那時要消失（不能永久 busy）。「實測不會出現」不是規格 —— 規格寫的是上面那兩句。

過場的可觀察狀態（`src/world/scenes/SceneProvider.tsx`）：

```
in: { phase: 'in', ref }                              ← 正常
transition: { phase: 'transition', from, to, since }  ← 進行中
```

`transition` 的結束條件三選一：新連線 `ready`（收到 `hello`）→ `in(to)`；新連線在 `open` 之前就 `closed`（`opened === false`）→ **失敗**（D4）；**自呼叫 `connect()` 起** 10 秒還沒 `ready` → 失敗（起點不是覆蓋層出現、也不含等舊 close 那 ≤1 秒）。10 秒是 `hello` 實測不到 1 ms ＋ 本機 dev server 冷啟動最慢一次量到 3 秒的三倍；**具名常數、測試可注入**（審查：本機數字不代表部署網路，寫死成不可調是過度宣稱）。背景分頁的計時器會被瀏覽器節流到 ≥1 秒一次，逾時可能晚觸發 —— 背景分頁是 `FE-R04` 的題目。

**過場覆蓋層**（DOM，`role="status"`、`aria-busy`）：文字是「前往 <房間名>⋯⋯」／「回到 Guild Hall⋯⋯」。`ui-ux-pro-max`（`--domain ux`「Loading Indicators」）：不要為瞬間完成的事閃一個 spinner。本機 `hello` 在 1 ms 內到 —— 沒有最短顯示時間的話覆蓋層是一幀的閃爍。**最短顯示 300 ms**（同一條指引的「preserve layout, accessible busy status」）；超過 300 ms 就等 `ready`。它只延後**覆蓋層消失**這一件事：狀態在 `ready` 當下就提交、連線與清理照時間走（`S05` 驗 1 ms 時狀態已是 `in(room)`）。覆蓋層蓋在 Canvas 上（`layer('hud')`），過場期間**移動輸入鎖住**（沿用面板開著時那把鎖，`InteractionProvider`）—— 不鎖的話角色在舊配置裡走、出生在新配置的牆裡。

## D4｜進不去是一次性的失敗：回大廳、說一句話、不重試、票留著

客戶端在握手被拒時看到的是 `code=1006`、`opened=false`，**分不出**是票過期、偽造、房間不存在、還是後端沒起來／網路斷了（`realtime-client` 的 `ConnectionClosed` 已經量過並拒絕加原因欄位）。所以：

- 通知**不得宣稱原因**，而且要把「連不上」也列進去 —— 第一版只寫「票可能失效或房間關閉」，兩位審查都指出那是「刻意不說原因卻又暗示兩個原因」。語彙：「進不了這間房 —— 可能暫時連不上，或通行證已經失效、房間已經關閉。已回到 Guild Hall。」`role="alert"`（`ui-ux-pro-max` ux「Error Messages must be announced」）
- **回大廳是自動的**，不問。留在一個進不去的房間裡沒有可操作的畫面
- **不重試**。`FE-R12`（W5）才做退避重連；這裡重試的話，票真的過期時會每 10 秒撞一次牆。回大廳之後門還在那裡，「再試一次」就是再走到門前（error recovery 的 next step 是可見的門，不是一顆按鈕；`S07` 驗使用者再按 E 會以同一張票再試）
- **票留著**（第一版是丟掉，兩位審查都反對：連不上跟票失效分不出來，丟票會讓網路瞬斷的人重輸一次密碼；逾時更不能當成票的問題）。票只被 `FE-N08` 的 `enter` 成功覆蓋。代價：票真的過期時，每次按 E 都失敗一次 —— `FE-N08` 的通知要提供「重新輸入密碼」，那是它的規格
- 通知留到：下一次**使用者發起的**成功進入任何場景、使用者關閉、或被下一則取代。失敗後系統自動回大廳的 `ready` 不算（實作時抓到的：大廳 `hello` 幾毫秒就到，通知會在出現後立刻消失）。第一版是「下一次過場開始就消失」—— 再按一次門、又失敗，使用者看到的是通知閃一下再出現，分不清是新的還是舊的
- **回大廳也連不上**：過場狀態仍然結束（覆蓋層消失、輸入解鎖、場景是 `hall`），交給大廳既有的失敗呈現（今天是 console；`FE-R12` 之後是重連 UI）。不建第三條連線（`S16`）

大廳自己的連線失敗（今天就會發生的那種）**不在**這條的射程：那是「連不上」（`FE-X03-S08`）加 `FE-R12`。這裡只管「從一個活著的場景過去，過不去」。

## D5｜票的持有：`sessionStorage`、鍵含身分、不進網址

後端把票存進 session cookie 的 `room_tokens`（`projects.py:182`），但**沒有端點讀得回來**；`/ws?token=` 又必須由前端帶上。所以前端要自己留一份。

- 位置：`sessionStorage`，鍵 `guildhub.roomToken.<profileId>.<projectId>`。**鍵含身分**（審查抓到的）：同一個分頁登出、換帳號登入，鍵只含 `projectId` 的話會讀到前一個帳號的票、握手必敗一次
- **不進 `localStorage`**：跨分頁共用會讓第二個分頁拿票直接連。但這**不是**「一個身分一條連線」的保證 —— 「複製分頁」與 opener 開的分頁會帶走 `sessionStorage` 的初始副本（審查指出）。正確性靠 D6 的資格，票不共享只是少一個入口
- **不是安全邊界**：同源 XSS 讀得到原文票。安全靠 CSP／輸出安全（`FE-T06`）與後端 8 小時 TTL。規格正文明寫這一點，不暗示它比 `localStorage`「安全很多」
- **不進網址**（proposal 的 Non-goals）；`S14` 在五個時點用票的字面值斷言 `location.href`（審查：「任何時刻不含」在測試從沒讓 URL writer 碰到票時是恆真的 —— 所以要在持票進房、失敗、返回、history 來回都看）
- 不解析票的內容（`project_id|user_id|expires_at` 是後端的格式，`room_token.py` 的 docstring 說得很清楚它只在同一個 process 內有意義）。過期與否由握手告訴我們（D4）
- 誰寫進去：`FE-N08` 的 `enter` 成功時。這個 change 只提供 `holdRoomToken(profileId, projectId, token)`／`heldRoomToken(profileId, projectId)`／`dropRoomToken(…)` 三個函式與它們的測試；今天只有測試會寫

重新整理：`/world?room=<id>` → **先等身分查詢結束**（鍵含身分，身分還沒回來就查會誤判成沒票）→ 有票 → 直接進房間（過場照 D3）；沒票 → 網址 canonical 成 `/world`、人在大廳、一則 `role="status"` 的說明「這間房需要房間密碼 —— 走到走廊上它的門前按 E。」（第一版是完全安靜；審查：深連結的人看起來像連結壞了）。不是 alert：那不是失敗，是「你還沒有票」。

## D6｜一個身分一條世界連線，不分 scene

證據在 proposal：`presence.py` 的 `_players` 是單一 dict、`join()` 覆蓋、`disconnect()` 只查同 scene 的兄弟連線。所以同一個帳號在兩個 scene 各連一條的結果是：大廳那條**憑空消失**（不是被踢，是 presence 不再認得它，連線還開著）。

- `WorldGate` 的 `leaseKey` 改成只含 `profile.id`；`tabLease.ts:84` 與 `WorldLeaseProvider.tsx:36` 那兩句「要含 scene」的註解改掉並指到這份 design
- **同一個分頁換場景不放棄資格**：key 沒變，`WorldLeaseProvider` 不重掛（它用 `key={leaseKey}` 重掛）—— 這正是把 scene 拿出鍵的另一個理由：含 scene 的話，換場景會重掛 lease provider，第一次 `claim` 的競爭視窗又開一次
- 匿名不協調（`FE-R06-S01` 不變）：匿名進不了房間（`manager.py:67-69`：票的持有人比對讓匿名連線不可能對上任何一張票），但匿名在大廳的多分頁照舊合法
- **射程**跟 `multi-tab` 那條一樣：同一個瀏覽器、同一個 origin、共用 `BroadcastChannel`／storage 的分頁。不同裝置、不同瀏覽器、storage 被隔離的情況（`FE-R06-S04`）前端保證不了，根治在後端。第一版的標題「一個身分一條世界連線」讀起來像全域保證 —— 正文補了射程
- `S12` 的突變不是「加回 `/lobby`」（固定字尾、換場景不變，資格照樣不釋放，那條會綠 —— 審查抓到），是**把當前 `wsScene` 加進鍵**：hall→room、room→hall 都要紅
- 這條的證據同時暴露一個後端缺口：`disconnect()` 只查同 scene 的兄弟連線，跨 scene 的同一人會被清掉。它跟 `BE-G31` 同根（presence 以 `user_id` 為鍵、不以連線為鍵）。**要開 `governance/` PR 在 `docs/WBS.md` 記成一條 `BE-G`**（這個 change 不能動那張表）—— 記在 tasks 6.4

## D7｜門的動作：請求進入，票在就走、票不在就交給門禁

`ProjectDoors` 註冊的互動物件今天沒有動作（`FE-W12` 的設計決定：不造沒有讀取者的 callback）。現在有讀取者了：

```
onInteract(door) → requestEntry(projectId)
  heldRoomToken(projectId) 有 → enterRoom(projectId, token)        （D3）
  沒有                       → gate.needsToken(projectId)          （FE-N08 接手）
```

`gate` 是一個 context（`EntryGateProvider`），**預設實作**是一則通知：「這間房需要房間密碼。輸入密碼的功能還沒開放。」（`role="status"`，不是 alert —— 這不是錯誤，是還沒做）。`FE-N08` 用自己的 provider 蓋掉預設，開密碼 Modal，成功後 `holdRoomToken()` ＋ `enterRoom()`。

**為什麼不是「門今天仍然什麼都不做」**：`FE-W12-S16` 的血統是「不造沒有讀取者的抽象」。現在讀取者存在了（票在就進去），而「票不在」的那半邊**對玩家必須有回應** —— 對著門按 E 沒反應，跟門壞了長得一樣（`ui-ux-pro-max` ux「Error without recovery path」）。

一次按下只請求一次：`keydown` 的 `repeat` 事件與雙 provider 都不得觸發第二次過場（`S10` 驗）。

`FE-W12-S16` 不退役、改前提：它斷言的「沒有請求、沒有導覽」在「沒有票」的前提下仍然成立（多的只是一句說明）。`openspec` 的 MODIFIED 也不准在 archive 時丟掉既有 Scenario。`tests/world-rooms-press-e.test.tsx` 那兩條 `it` 保留 ID、GIVEN 補「沒有票」；持有票的那半邊是新的 `FE-V01-S10`，說明那半邊是 `S11`。

## 這一份怎麼驗（突變）

每一條「把防禦拿掉，測試要變紅」：

| 拿掉什麼 | 哪條要紅 |
|---|---|
| `sceneOf` 對 `room` 回 `wsScene: 'room'`（少了 id）；或不驗 `projectId` 的形狀 | `S01` |
| `projectRoomLayout` 少一面邊界牆 | `S02`（`FE-W11-S08` 的判準跑在房間配置上） |
| 房間分支仍然掛 `ProjectDoors`；或 `useRooms` 在房間裡照樣輪詢 | `S03` |
| 新 socket 在舊 `close()` 之前建立；或舊監聽器沒移除；或碰撞體沒換；或 Strict Mode 下建了兩條 | `S04` |
| 新 socket 不等舊 close 事件；或 1 秒上限拿掉 | `S18` |
| 過場不比對代號（舊 socket 遲到的 close 被當成失敗） | `S15` |
| 覆蓋層最短 300 ms 拿掉；或 300 ms 延後了狀態提交 | `S05` |
| 過場中不鎖輸入；或解鎖跟著覆蓋層而不是跟著提交 | `S17` |
| 10 秒逾時拿掉；或失敗時網址沒 `replaceState`；或失敗時丟票 | `S06` |
| 失敗後重試（任何排程中的計時器會再建 socket）；或通知在再按門時就消失；或第二則疊在第一則上；或成功進入不清通知 | `S07` |
| popstate 進到被拒的房不 `replaceState` | `S19` |
| 回大廳失敗時覆蓋層不消失 | `S16` |
| canonical 少任何一條（未知參數、重複、大寫、順序、`room` 時去面板） | `S08` |
| 進房間不 `pushState`；或 popstate 不走過場；或面板沒歸零 | `S09` |
| 門的 `onInteract` 拿掉；或 `repeat` 沒擋 | `S10` |
| 預設門禁的說明拿掉；或替身沒收到 `project_id` | `S11` |
| 把 `wsScene` 加進資格的鍵 | `S12` |
| 回大廳按鈕改 `replaceState`／`back()` | `S13` |
| 票的鍵不含身分；或 URL writer 把票寫進網址 | `S14` |

## 測試會連到什麼

- 單元（vitest ＋ jsdom）：`RealtimeClient` 注入假 socket（既有的 `createSocket` 口），假時鐘；`sessionStorage` 是 jsdom 的。**不連任何服務**
- 瀏覽器（`tests/e2e/scene-switch.mjs`）：只打**本機自己起的** dev server，`/ws` 用 `page.routeWebSocket` 偽造（同 `deep-link.mjs`／`rooms-fixture.mjs` 的做法）；`GET /api/rooms` 用 `page.route` 偽造。**不連任何團隊共用的位址**，不需要 Postgres。`S04` 的「Canvas 是同一個節點」主判準在這裡（jsdom 掛不了 WebGL，`FE-B09-S12` 的同一個理由）
