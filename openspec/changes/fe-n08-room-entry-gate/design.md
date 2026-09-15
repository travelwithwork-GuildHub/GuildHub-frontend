# `FE-N08` 房間門禁 —— 設計

只寫難逆轉、有取捨的決定。事實來源：真後端 `app/api/projects.py:enter_room`、`app/room_token.py`、
`app/realtime/manager.py`；前端 `src/world/scenes/EntryGate.tsx`、`roomTokens.ts`、`SceneProvider.tsx`；
本地後端 `src/server/session.ts`、`scripts/realtime-stub.ts`。

## D1｜門禁只是接上既有的 `EntryGateProvider`，不新增第二套互動

`FE-V01` 把入口留好了：`useRequestEntry()` 有票 → `enterRoom()`；沒票 → `EntryGateProvider.needsToken(projectId, title)`；
沒 provider → `showGateNotice()`（那句「還沒開放」）。本 change 在 Canvas **外**掛一個正式 provider，
`needsToken` 記下目標房間、開 DOM Modal。門、互動範圍、E 的去重、`role="status"` 的預設回應**一行都不動**。

代價：門禁 UI 依賴 `world-scenes` 的 context 邊界，不能獨立於世界存在。換來的是：
Canvas 元件不 import 表單、沒有第二個 E 監聽、`FE-W12-S16`／`FE-V01-S11` 的預設門禁測試不用改。
`CONTEXT.md`：3D 負責空間與入口，表單是 DOM 的事 —— 密碼欄位 MUST NOT 畫在 Canvas 裡。

## D2｜成功的順序固定：先存票，再請求進房；Modal 不碰連線與網址

`enterProject(projectId, { password })` → `holdRoomToken(profileId, projectId, room_token)` → 讀回確認 → `enterRoom(projectId, { title })` → 關 Modal。
**順序是本能力定的義務，不是既有程式的保證**：`SceneProvider` 的 `resolved.scene` 只在「desired 是房間 ∧ 身分已解析 ∧ 持有票」時才是房間；
在同一個同步 handler 裡先 `enterRoom()` 再存票，React 多半要到 handler 結束才 render，`resolved` 那時可能已經讀到票 —— 「反過來一定進不去」不成立，
所以不拿它當理由。理由是：存票是進房的前提，把前提放在後面靠的是 React 的批次行為，那是實作細節；判準用呼叫順序 spy。
WebSocket、網址、過場都是 `SceneProvider`／`WorldUrlSync` 的事，Modal 一個都不做。

`profileId` 從身分 context 拿（`{state:'signed-in', profile}`）；沒登入的人按 E 一樣開 Modal，
送出會拿到 401 —— 那是後端說的，不是前端先擋（D4）。

## D3｜密碼只活在當次表單

密碼不進 `sessionStorage`、`localStorage`、網址、log、票的儲存。只在 `useForm` 的欄位狀態裡：
失敗**保留**（人要改一個字再送）、成功清、關閉清、換另一扇門不沿用。
票繼續走 `FE-V01` 的 `roomTokens.ts`（`sessionStorage`，鍵含身分）；密碼與票的生命週期不混。

## D4｜錯誤照 `kind` 分類，這個端點的 403 與 404 各自只有一個意思

`toUiError(cause).kind` 是唯一的分類點（`FE-X03-S16`）；元件不看 HTTP status。跟 `FE-A08` design D2 同一個寫法
（「403 在這一次請求上只有一個意思」）：

| kind | 真後端的來源（`enter_room`） | 使用者看到 |
|---|---|---|
| `permission-denied` | `verify_password` 失敗 → 403「房間密碼錯誤」——**這個端點唯一的 403** | 密碼不對；保留輸入，可改可重送 |
| `not-found` | `password_hash IS NULL` → 404「專案不存在或房間尚未開啟」 | 這間房目前進不了；**不猜**是不存在、還沒成軍、還是關了 |
| `authentication-required` | `get_current_user` → 401 | 語彙表那句（要先登入）；**不是**「密碼錯」 |
| 其他（`server-error`、`network-unavailable`、`validation`、`contract-drift`…） | — | 語彙表那句；保留輸入，人工重試 |

文案是前端受控的（`error-vocabulary`），後端的 `detail` 不進 DOM —— 整合指南說 detail 是中文可直接顯示，
但 `form-conventions` 與 `FE-X03-S12` 都禁止把後端原始字串當 UI。

**真後端的一個事實**：`enter_room` 不看 `status`。`closed` 但有 `password_hash` 的專案照樣簽票
（門不會出現在走廊，因為 `GET /api/rooms` 只列 active；深連結或舊票打得到）。本地版**照抄**這個行為 ——
本地比真後端聰明就是假象（`internal-backend` 的原則）。它被 S12 寫成本地與真後端的**相容義務**（closed 有密碼 → 200）；
那是「兩個目標一致」的義務，不是「產品應該讓人進關閉的房」——後端哪天補了 status 檢查，重開 spec PR 把那列改掉。`FE-O07` 銜接清單列它。

## D5｜握手失敗後由使用者決定要不要換票；系統仍然不丟票

`world-scenes`〈進不去就回 Guild Hall…〉已定：票過期、房間關了、後端沒起來三種長一樣（1006／`opened=false`），
所以**系統** MUST NOT 丟票、MUST NOT 自動重試，那條 Requirement 自己寫了「換票是 `FE-N08` 的事」。

落地：失敗通知上多一個「重新輸入密碼」動作（通知的**那句話不變**）。只有使用者按下它才：
丟掉這個身分對這間房的票 → 關閉通知 → 開這間房的密碼 Modal（欄位空白）。
不按它、再走到門前按 E → 用同一張票再試（`FE-V01-S07` 的行為原封不動）。
實作細節：`SceneProvider` 今天的失敗通知只記 `room: projectId`，重開視窗需要標題 —— 通知要連 `title` 一起記（`enterRoom` 本來就收到它）。
取捨：多一個按鈕，換來「網路瞬斷的人不用重輸密碼」與「票真的過期的人有路可走」同時成立。

## D6｜前端不加密碼長度規則

後端 `EnterIn.password: str`、`FormTeamIn.password: str`，沒有 `min_length`、沒有非空檢查；
前端 `EnterIn = z.object({ password: z.string() })`。這裡加任何限制都可能擋掉房間真正設定的密碼。
要限制，先改成軍那端與後端（`spec/` 另談），不在門禁單方面做。**空字串也照送**——後端會回 403。

## D7｜本地 enter：同一把 HMAC，跟替身共用；不模仿真後端的票格式

真後端：`room_token.issue(project_id, user_id)` = `base64url(project|user|expires)`.`HMAC`；WS 握手驗簽章、期限、
project 與 user 都要對。本地替身（`scripts/realtime-stub.ts`）今天驗的是 `HMAC(INTERNAL_SESSION_SECRET, "room:<uuid>")`，
**不綁人、不過期**，註解寫「`FE-W16` 把 enter 接上之後由它簽發（同一把）」（筆誤，是 `FE-N08`）。

決定：本地 handler 與替身**共用同一個簽章函式**（抽成一個不 import `server-only` 的模組，兩邊 import 它；
替身用 `tsx` 跑，`server-only` 在 Next 之外會拋），簽的是 `HMAC(secret, "room:<uuid>|<profileId>")` —— **綁房間也綁人**：
替身今天是先 `sceneAllowed()` 再 `identify()`（`realtime-stub.ts:124` 與 `:132`）—— 要改成**先解析 cookie 的身分、再驗票**，不只是多比一個欄位；
沒有 cookie 或無效的人握房間會被拒（大廳照舊不驗）。審查者指出「本地不綁人」是安全語意的可觀察差異
（P 的票給 Q，本地收、真後端拒），跟「兩個目標可觀察行為相同」矛盾 —— 所以綁。
**不**把格式改成真後端那種 base64url 三段式：前端的契約只觀察「同房同人收、換房或換人拒」，票的格式是各自後端 process 內的事（`roomTokens.ts` 檔頭）。
**已知差異**：本地票不過期（真後端 8 小時）—— `FE-R12` 要測「票過期後重連」時得用替身的旋鈕，不是等時間；契約測試不得宣稱涵蓋過期。
這是**系統邊界**的決定（票只在簽發者的 process 內有意義；前端不解析），要補 ADR。
`roomToken(scene)` 改簽名會動到既有用它算票的測試（`FE-V01` 的 e2e 是偽造 WS，不受影響；契約測試的 ws 那組要跟著改）。

本地 handler 的判斷順序照真後端：session 無效 → 401；`password_hash IS NULL`（不存在或未成軍）→ 404；
`verifyPassword` 失敗 → 403；否則簽票。**第二個已知差異**（實作前核對 `deps.get_current_user` 才發現）：真後端只看 session 裡有沒有 `user_id`，**不查名片還在不在**，
`enter_room` 對已刪名片的 session 照簽（200，而且那張票在真後端的握手也收）；本地走 `handle()` 管線一律 401（`FE-O03-S08` 守的是管線）。
契約測試兩個目標同一份，所以這一列**不進矩陣** —— 不在共用的檔案裡寫「本地 401」（在真後端會紅），也不把真後端這個洞複製進本地（那是把漏洞規格化）。
本地的 401 仍要有自己的判準（審查指出 `FE-O03-S08` 只驗 `/api/me`，證不了 `enter` 有走 `handle()`）：`S16` 用假資料層對本地 handler 驗「名片查不到 → 401、沒有第二道 SQL」。本地 session 是無狀態簽章 cookie（`session.ts`），**沒有** server-side
`room_tokens`，也**沒有**座位 API —— 真後端把票另存進 session 是給座位端點用的，那是 `FE-J13` 的事。

## D8｜Modal 開著就持有世界命令鎖，不只靠輸入框的焦點

`keyboard-focus` 已定「焦點在能輸入文字的控制上時世界命令鎖住」——但 Modal 裡焦點會落在「送出」「取消」按鈕上，
那時 W／方向鍵／E 不能動到世界（人在按 Enter 送密碼，不是在走路）。所以 Modal 用 `holdInputLock` 自己持一把
可合成的鎖（跟 `SceneTransitionOverlay` 同一個 API），開就持、關就放；別的持有者不受影響。
焦點邊界沿用 `panel/focusTrap.ts`、關閉後回世界焦點錨、Esc 只關最上層 —— 都是 `FE-X06` 既有的。

## D9｜送出中也可以關；晚到的結果一律丟棄

視窗持有世界命令鎖（D8），所以「送出中不能關」等於「一個卡住的請求把人鎖在視窗裡，連走路都不行」——
審查者退回了第一版的這個決定。改成：任何時候都能 Esc／關閉；關閉時記下「這一輪已作廢」，
晚到的成功不存票、不 `enterRoom`、不重開視窗，晚到的失敗不顯示。機制是**每一輪一個代號**：關閉、換房、身分改變都換代號，回應只在代號還是現行的那個時採用 ——
所以「關了再開同一間房」舊回應也不採用（只比「開著、同房、同人」會錯採，S15 第一段），「P→Q→P」也不採用（代號換過了）。
身分改變不關視窗（訪客本來就能開視窗，D2）；S15 的身分段刻意不關視窗，才驗得到代號是看身分的。
**busy 的所有權跟著代號走**：換代號的那一刻舊輪就不能再控制視窗（busy 解除、可以馬上再送），舊回應晚到也不能動新輪的 busy／欄位／alert ——
否則換身分之後一個卡住的舊請求會讓 Q 永遠按不了送出。不用 `AbortSignal`：取消 fetch 不代表後端沒簽票。
**副作用要誠實記**：真後端成功時已把票寫進 server session（給座位端點用），前端丟棄結果只是「不採用」，不是「沒發生」——
今天沒有讀得回來的端點，所以看不到；`FE-J13` 接座位時要知道這件事。

## D10｜存票要讀回確認

`roomTokens.ts` 的 `withStorage` 在 `sessionStorage` 不可用時吞掉例外、不拋（`FE-V01` 的決定：票只是可用性）。
但門禁這一步「存不進去」的後果是 `resolved.scene` 判成沒票 → 使用者剛輸對密碼卻留在大廳，看到的是「這間房需要房間密碼」——
像門壞了。所以存完要 `heldRoomToken()` 讀回，而且要**嚴格等於這一次的票**：只檢查非 null 的話，「原本有舊票、這次寫失敗」會拿舊票去撞握手，
然後把票失效呈現成連不上。讀回不對就當失敗，視窗留著、說清楚是瀏覽器存不了通行證。
`dropRoomToken` 對稱處理，但今天的 API 分不出「確定不在」與「讀不到」（`withStorage` 把兩者都壓成 `null`）——
所以 `roomTokens.ts` 的 drop 要**回報三態**（不在了／還在／無法確認），只有「不在了」才開視窗；這是 `FE-V01` 那個模組的一個小擴充，不改既有三個函式的語意。
標題：`SceneProvider` 的失敗通知多記 `title`；深連結／上一頁失敗時沒有 title，退而查大廳的房間清單（`useRooms`），都沒有就開沒有房名的視窗（S11 末段）。

## 待答問題

- 401 之後要不要記住「登入完自動回來開這扇門」？不做（Non-goal）；使用者登入後再走到門前。
- Modal 的視覺（寬度、間距、標題層級）過 `ui-ux-pro-max` 之後決定；不進規格。
