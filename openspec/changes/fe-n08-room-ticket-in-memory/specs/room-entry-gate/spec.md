## Applicability

權限：不適用 —— 存票／進房不做授權判斷（`/enter` 的 401 是拿票的事）。
併發：適用 —— 每一輪送出一個代號的 race 邏輯不變；記憶體票的權威跨 scene 不重置。
持久資料相容性：**適用** —— 票的權威從 `sessionStorage` 移到記憶體，storage 降為 best-effort 持久層。
失敗路徑：適用 —— 反轉了「storage 存不進＝失敗」；進房唯一剩下的存票失敗是後端回空 `room_token`。

## REMOVED Requirements

### Requirement: 成功先存票再進房；票存不進去就不算成功；有票的人不再被問

**移除理由**：這不是規格缺陷，是需求標題裡一句**明確的產品承諾被反轉了**。原標題與 prose 定的是
「把票寫進 `sessionStorage`、讀回嚴格一致才算存成功；**存不進去就 MUST NOT 進房**，還要顯示一則
『這個瀏覽器存不了通行證』的 `role="alert"`」。2026-09-22 demo 實測證明這條承諾本身是錯的：真實瀏覽器擋掉
DOM storage 的情況下，使用者輸對密碼、後端也發了票，卻因為 storage 寫不進去被判成失敗、整隊只有無痕能進房。
新的承諾是相反的：**storage 寫入失敗 SHALL 照樣進房**（票以記憶體為主）。「票存不進去就不算成功」這句不再成立，
MUST 用 REMOVED + ADDED 換掉，不能用 MODIFIED 保留一個已經不真的標題。

**這條被下面同義改名的〈成功先持有票再進房（票以記憶體為主…）〉取代，不是單純刪掉。**

退場的 scenario ID 處置（`FE-N08-S06`／`S07`／`S11`／`S14`／`S15`）：

- `FE-N08-S06`／`S07`／`S11`／`S15` 的**核心語意未變**，在下面的 ADDED 需求**沿用同一個 ID**（退役後同義重用是允許的）：
  S06 先持有後進、S07 有票不再問、S11 被拒後確認才丟票重輸、S15 送出中換房／換身分作廢 —— 只更新與「storage＝權威」
  綁死的斷言字眼（改為以 `heldRoomToken` 為準）。
- `FE-N08-S14` 的核心語意就是「storage 寫入失敗不可進房」，**已被反轉**：這個 ID **隨本條退場、MUST NOT 被重新使用**。
  反轉後的新行為在 ADDED 需求用新的 `FE-N08-S17`。
- 舊 `FE-N08-S11` 裡「`removeItem` 失敗三種 → 沒有視窗、通知還在」那段**子斷言也反轉了**（墓碑保證丟得掉、照樣開視窗）：
  這段獨立成 ADDED 需求的新 `FE-N08-S18`；S11 本身保留未變的主語意。

## ADDED Requirements

### Requirement: 成功先持有票再進房（票以記憶體為主，storage 寫入失敗仍進得去）；有票的人不再被問

`enterProject` 成功後，系統 SHALL 先以 `holdRoomToken(profileId, projectId, room_token)` 持有票，並 SHALL 以
`heldRoomToken(profileId, projectId)` 讀回、**嚴格等於這一次回傳的 `room_token`** 才算成功，**再**呼叫
`enterRoom(projectId, { title })`；「先持有後進」是本能力定下的順序義務，用呼叫順序驗。**票的權威是記憶體**：
`heldRoomToken` 在持有之後一定讀得回這一次的票，**即使 `sessionStorage` 被擋、寫不進去**（storage 只是重整後
撿票的持久層，寫不進不影響這一場進房 —— 這正是修掉「一整隊只有無痕能進」的關鍵）。
視窗 MUST NOT 自己建 WebSocket、MUST NOT 寫網址；成功後視窗 SHALL 關閉。

進房唯一剩下的存票失敗是**後端回空的 `room_token`**（`''`）：SHALL 視同失敗（獨立的檢查 —— 空字串存得進也讀得回，
比對抓不到它），MUST NOT 呼叫 `enterRoom`、MUST NOT 把空字串當票持有、視窗 SHALL 留著，
SHALL 顯示一則受控的 `role="alert"`（說這間房目前拿不到通行證、請稍後再試，**不說是密碼錯、也不說是瀏覽器存不了**
—— storage 被擋已不再是失敗原因）。讀回不等於本次的票時也 SHALL 視同失敗（記憶體權威下，只有代號在讀回之間換掉才可能發生）。

每一輪送出 SHALL 有自己的代號；結果 SHALL 只在「這一輪還是現行的那一輪」時被採用。下列任一件事發生就換代號、
舊的一輪作廢（不持有票、不進房、不顯示）：視窗關閉（**即使之後重開同一間房**，舊回應也不採用）、目標房間換了、
身分改變（換人、登出；**回應到達時的身分跟送出時不同**——中間換了又換回來也算作廢，因為代號已經換過）。
身分改變**不**關視窗（訪客本來就能開視窗、送出會拿到 401，D2），只是那一輪作廢。
換代號的同時，舊的一輪 SHALL 立刻失去對視窗的控制：busy 解除、送出控制可按、欄位與 alert 維持現況；
新的一輪可以馬上送出；舊回應晚到 MUST NOT 解除、覆蓋或清掉新一輪的 busy、欄位、alert。
同一身分、同一分頁已持有那間房的票時，門前按 E SHALL 直接走既有 `enterRoom`，MUST NOT 開視窗、MUST NOT 呼叫 `/enter`。

> 拔掉什麼會紅：反轉兩個呼叫的順序 → S06 的順序斷言；持有票時鍵不含身分 → 換身分讀到別人的票（`world-scenes` S14）；
> 有票也開視窗 → S07；storage 被擋就擋住進房 → S17 的「storage 拋也進得去」；空 `room_token` 也進房 → S17 的空字串那段；
> 被拒後系統自己丟票、或用舊票再試 → S11；`removeItem` 失敗就用舊票撞握手（不放記憶體墓碑）→ S18；
> 只比「現在開著、同房、同人」不比代號 → S15 的「關了重開同一間房」；身分改變不換代號 → S15 的 P→Q→P；
> 換代號不解除舊輪的 busy → S15 的「送出控制立刻可按」；舊回應晚到清掉新輪的 busy → S15 的「仍是 busy」。

#### Scenario: [FE-N08-S06] 密碼對了：先持有票、過場開始、房間連線帶著票、網址沒有票

- **GIVEN** 已登入為 P，沒有房間 R 的票
- **WHEN** 在 R 的視窗送出密碼，`/enter` 回 `200 { "room_token": "T" }`
- **THEN** `holdRoomToken(P, R, "T")` SHALL 在 `enterRoom(R, …)` 之前被呼叫（順序 spy）；`heldRoomToken(P, R)` SHALL 回 `T`（票的權威在記憶體）；接著 SHALL 開始進入 R 的過場（覆蓋層出現）
- **AND** 新 socket 的位址 SHALL 含 `scene=room:R` 與 `token=T`；每一次寫入的網址 MUST NOT 含 T
- **AND** 視窗 SHALL 關閉
- → 驗於：jsdom（順序、`heldRoomToken`）、e2e（連線與網址）

#### Scenario: [FE-N08-S17] storage 寫入失敗照樣進房；只有空 `room_token` 才失敗

- **WHEN** `/enter` 回 `200 { "room_token": "T" }`，而 `sessionStorage` 分別是：`setItem` 拋；`setItem` 靜默沒寫、`getItem` 回 `null`；原本已有舊票 `OLD`、`setItem` 失敗、`getItem` 仍回 `OLD`；`setItem` 成功但 `getItem` 拋
- **THEN** 四種都 SHALL 照樣進房：`holdRoomToken` 在 `enterRoom` 之前各一次、視窗關閉、SHALL 沒有 `role="alert"`
- **AND** `heldRoomToken(P, R)` SHALL 回 `T`（storage 存不進也讀回這一次的票，不是殘留的 `OLD`）；T MUST NOT 出現在 DOM 或網址
- **AND WHEN** `/enter` 回 `200 { "room_token": "" }`
- **THEN** SHALL 視同失敗：MUST NOT 呼叫 `enterRoom`、MUST NOT 把空字串持有成票、視窗 SHALL 還開著、送出控制之前 SHALL 恰好一個 `role="alert"`、內容 MUST NOT 含「密碼」
- → 驗於：jsdom（全部）、e2e（`setItem` 拋那一種：init script 讓 `sessionStorage.setItem` 拋 → 仍進得了房、沒有 alert）

#### Scenario: [FE-N08-S15] 送出中換了房間或身分：晚到的結果作廢

- **GIVEN** 對房間 A 的 `/enter` 尚未回應
- **WHEN** 按 Esc 關閉，再對房間 B 的門按 E 開視窗，接著 A 的請求回 `200 { "room_token": "TA" }`
- **THEN** `heldRoomToken` 對 A、B 都 SHALL 回 `null`（也 MUST NOT 寫進 storage）；SHALL 沒有 `enterRoom`；B 的視窗 SHALL 還開著、欄位空白、沒有 alert
- **AND WHEN** 對 B 送出、尚未回應時按 Esc 關閉，**再對同一扇 B 的門按 E 重開**（現在：開著、同房、同人），接著剛才那個請求回 `200 { "room_token": "TB0" }`
- **THEN** SHALL 沒有持有票、沒有 `enterRoom`、沒有 alert；重開的視窗 SHALL 還開著、欄位空白（只比「開著、同房、同人」會錯採 —— 要比代號）
- **AND WHEN** 以 P 的身分對 B 送出、尚未回應時身分變成 Q（視窗**不**關、不重掛）
- **THEN** 送出控制 SHALL 立刻可按（busy 解除）、欄位內容不變
- **AND WHEN** Q 立刻送出（第二個請求 pending），接著 P 的舊請求回 `200 { "room_token": "TB" }`
- **THEN** `heldRoomToken` 對 P＋B、Q＋B 都 SHALL 回 `null`、沒有 `enterRoom`、沒有 alert；視窗 SHALL 還開著、SHALL 仍是 busy（Q 那一輪還在等）
- **AND WHEN** Q 的請求回 403
- **THEN** SHALL 出現 alert（Q 那一輪的結果被採用）
- **AND WHEN** 以 P 送出、身分變成 Q 又變回 P、接著回 `200 { "room_token": "TB1" }`
- **THEN** 同樣不採用（代號換過了）：`heldRoomToken` 都 SHALL 回 `null`
- **AND WHEN** 再以 Q 送出、尚未回應時登出成訪客，接著回 `200 { "room_token": "TB2" }`
- **THEN** 同樣沒有持有票、沒有 `enterRoom`；視窗 SHALL 還開著
- → 驗於：jsdom（全部）、e2e（第一段：`page.route` 延遲回應、Esc、重開同一扇門、延遲的 200 到達 → 沒有房間連線、視窗還開著且空白）

#### Scenario: [FE-N08-S07] 有票的人回大廳再按 E，直接進、不問密碼

- **GIVEN** P 經 S06 進了 R，按「回到 Guild Hall」回到大廳
- **WHEN** 再走到 R 的門前按 E
- **THEN** SHALL 直接開始進入 R 的過場；SHALL 沒有視窗、沒有 `/enter` 請求
- → 驗於：e2e

#### Scenario: [FE-N08-S11] 被拒之後：不按就用舊票再試；按了才丟票開視窗

- **GIVEN** P 持有 R 的票 T，進入 R 的新 socket 在 `open` 前就關（`code=1006`）
- **THEN** SHALL 回到大廳並顯示通知（`FE-V01-S07`）；`heldRoomToken(P, R)` SHALL 仍是 T；通知裡 SHALL 有「重新輸入密碼」的控制
- **AND WHEN** 不按它，再走到 R 的門前按 E
- **THEN** 新 socket 的位址 SHALL 仍帶 `token=T`
- **AND WHEN** 第二次也被拒，使用者啟動「重新輸入密碼」
- **THEN** `heldRoomToken(P, R)` SHALL 回 `null`（丟票）；SHALL 沒有 `role="alert"`；SHALL 出現 R 的密碼視窗，可及名稱含 R 的標題、欄位空白（通知要記得那間房的標題，不只 id）
- **AND** 在啟動之前，系統 MUST NOT 呼叫 `/enter`、MUST NOT 自己丟票
- **AND WHEN** 失敗來自深連結（`/world?room=R` 帶票、沒有 `title`）、房間清單還沒回來，使用者啟動「重新輸入密碼」
- **THEN** SHALL 開視窗，可及名稱 SHALL 可辨識是房間密碼視窗（不含房名）
- **AND WHEN** 視窗還開著，`GET /api/rooms` 回來了、裡面有 R 的標題
- **THEN** 同一個視窗（同一個 DOM 節點）的可及名稱 SHALL 變成含 R 的標題，欄位內容不變
- → 驗於：jsdom、e2e（前半）

#### Scenario: [FE-N08-S18] 丟票即使 `sessionStorage.removeItem` 失敗也生效：墓碑令讀回為 null、視窗照開、舊票不可用

- **GIVEN** P 持有 R 的票 T、被拒回大廳、通知有「重新輸入密碼」
- **WHEN** `sessionStorage.removeItem` 拋、或 `removeItem` 靜默沒刪（storage 仍殘留 T）、或刪完 `getItem` 拋 —— 三種各一次，使用者啟動「重新輸入密碼」
- **THEN** 三種都 SHALL 照樣開視窗、通知關掉（不再被「storage 刪不掉」擋住）
- **AND** `heldRoomToken(P, R)` SHALL 回 `null`（記憶體墓碑蓋過 storage 殘留 —— 舊票 MUST NOT 被拿去撞握手）
- **AND** 在啟動之前系統 MUST NOT 呼叫 `/enter`
- → 驗於：jsdom
