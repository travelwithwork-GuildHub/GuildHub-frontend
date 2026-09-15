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

`enterProject(projectId, { password })` → `holdRoomToken(profileId, projectId, room_token)` → `enterRoom(projectId, { title })` → 關 Modal。
**順序不能反**：`SceneProvider` 的 `resolved.scene` 只在「desired 是房間 ∧ 身分已解析 ∧ 持有票」時才是房間，
先 `enterRoom()` 會被判成沒票留在大廳（`SceneProvider.tsx` 的註解就是這句）。
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
本地比真後端聰明就是假象（`internal-backend` 的原則）。這件事不寫成 Requirement：那是後端的漏洞，不是產品義務；
記在這裡，`FE-O07` 銜接清單會列。

## D5｜握手失敗後由使用者決定要不要換票；系統仍然不丟票

`world-scenes`〈進不去就回 Guild Hall…〉已定：票過期、房間關了、後端沒起來三種長一樣（1006／`opened=false`），
所以**系統** MUST NOT 丟票、MUST NOT 自動重試，那條 Requirement 自己寫了「換票是 `FE-N08` 的事」。

落地：失敗通知上多一個「重新輸入密碼」動作（通知的**那句話不變**）。只有使用者按下它才：
丟掉這個身分對這間房的票 → 關閉通知 → 開這間房的密碼 Modal（欄位空白）。
不按它、再走到門前按 E → 用同一張票再試（`FE-V01-S07` 的行為原封不動）。
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
替身用 `tsx` 跑，`server-only` 在 Next 之外會拋）。**不**把格式改成真後端那種：
前端的契約只觀察「本地簽的票本地替身收、錯房間的票不收」，票的格式是各自後端 process 內的事（`roomTokens.ts` 檔頭）。
代價：本地票不綁人、不過期 —— `FE-R12` 要測「票過期後重連」時得用替身的旋鈕，不是等時間。這是**系統邊界**的決定
（票只在簽發者的 process 內有意義；前端不解析），要補 ADR。

本地 handler 的判斷順序照真後端：session 無效 → 401；`password_hash IS NULL`（不存在或未成軍）→ 404；
`verifyPassword` 失敗 → 403；否則簽票。本地 session 是無狀態簽章 cookie（`session.ts`），**沒有** server-side
`room_tokens`，也**沒有**座位 API —— 真後端把票另存進 session 是給座位端點用的，那是 `FE-J13` 的事。

## D8｜Modal 開著就持有世界命令鎖，不只靠輸入框的焦點

`keyboard-focus` 已定「焦點在能輸入文字的控制上時世界命令鎖住」——但 Modal 裡焦點會落在「送出」「取消」按鈕上，
那時 W／方向鍵／E 不能動到世界（人在按 Enter 送密碼，不是在走路）。所以 Modal 用 `holdInputLock` 自己持一把
可合成的鎖（跟 `SceneTransitionOverlay` 同一個 API），開就持、關就放；別的持有者不受影響。
焦點邊界沿用 `panel/focusTrap.ts`、關閉後回世界焦點錨、Esc 只關最上層 —— 都是 `FE-X06` 既有的。

## D9｜送出中也可以關；晚到的結果一律丟棄

視窗持有世界命令鎖（D8），所以「送出中不能關」等於「一個卡住的請求把人鎖在視窗裡，連走路都不行」——
審查者退回了第一版的這個決定。改成：任何時候都能 Esc／關閉；關閉時記下「這一輪已作廢」（generation），
晚到的成功不存票、不 `enterRoom`、不重開視窗，晚到的失敗不顯示。不用 `AbortSignal`：取消 fetch 不代表後端沒簽票
（真後端還會把票寫進 session），丟棄結果就夠了。代價：使用者關掉之後後端可能已經簽了一張他拿不到的票 —— 無害，再送一次就好。

## D10｜存票要讀回確認

`roomTokens.ts` 的 `withStorage` 在 `sessionStorage` 不可用時吞掉例外、不拋（`FE-V01` 的決定：票只是可用性）。
但門禁這一步「存不進去」的後果是 `resolved.scene` 判成沒票 → 使用者剛輸對密碼卻留在大廳，看到的是「這間房需要房間密碼」——
像門壞了。所以存完要 `heldRoomToken()` 讀回；讀不回就當失敗，視窗留著、說清楚是瀏覽器存不了通行證。不改 `roomTokens.ts` 的 API。

## 待答問題

- 401 之後要不要記住「登入完自動回來開這扇門」？不做（Non-goal）；使用者登入後再走到門前。
- Modal 的視覺（寬度、間距、標題層級）過 `ui-ux-pro-max` 之後決定；不進規格。
