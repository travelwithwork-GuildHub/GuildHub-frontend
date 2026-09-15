# 0008. 房間的票只在簽發者的 process 內有意義：前端不解析，本地與真後端各自簽

- **Status**: Accepted
- **Date**: 2026-09-15
- **Deciders**: 實作 `FE-N08` 的那個 session；兩位外部審查（規格 PR #421／#423）
- **邊界狀態**: 已強制
- **證據**: tests/contract/rest/enter.contract.ts:88、src/server/roomToken.ts:19、scripts/realtime-stub.ts:118、src/world/scenes/roomTokens.ts:9

> `邊界狀態` 與 `證據` 兩欄由 `bash .github/scripts/arch-view.sh` 讀。
> 三種狀態的意思見 `docs/adr/README.md`。

## 背景

進房要票：`POST /api/projects/{id}/enter` 用房間密碼換一張 `room_token`，接在 WebSocket 的 `?token=` 上。
真後端（`app/room_token.py`）簽的是 `base64url(project|user|expires)`.`HMAC`，握手驗簽章、期限、房間、持有人。

前端有自己的後端（`FE-O03`：Route Handlers ＋ 可拋棄資料庫 ＋ 即時層替身 `scripts/realtime-stub.ts`）。
替身在 `FE-N08` 之前驗的是 `HMAC(secret, "room:<uuid>")` —— **不綁人、不過期**，票由測試自己算。
`FE-N08` 把 `enter` 接上時得決定：本地要不要模仿真後端的票格式？票的內容是誰的事？

## 選項

### A. 本地照抄真後端的三段式格式（含 `expires`），前端也解析它
- 好：兩邊的票長得一樣；前端可以自己看「快過期了」。
- 壞：前端從此依賴一種**後端內部**的格式 —— 真後端換格式（或換 secret 派發方式）前端就壞；
  過期由前端判斷會跟握手的判斷漂（兩個時鐘、兩份規則）；本地替身要多養一份跟真後端一模一樣的 verify。

### B. 票是不透明字串：只在簽發者的 process 內有意義；本地與真後端各自簽、各自驗；前端只轉手
- 好：前端唯一要守的契約是**可觀察行為**（同房同人收、換房或換人拒）；兩個後端各自的格式互不相干；
  本地可以用最短的簽法（`HMAC(secret, "room:<uuid>|<profileId>")`），只要跟自己的替身共用一份函式。
- 壞：本地票**不過期**（已知差異）—— 要測「票過期後重連」（`FE-R12`）得靠替身的旋鈕，不能等時間。

## 決定

選 B。

**理由**：`roomTokens.ts` 檔頭在 `FE-V01` 就寫了「不解析票的內容：那是後端的格式，只在它的 process 裡有意義。
過期與否由握手告訴我們」；`FE-N08` 沿用並補上另一半 —— 簽的那一邊也是 process 內的事。
兩個後端唯一被要求相同的是**握手的可觀察語意**：票綁房間也綁人。所以本地 handler 與替身**共用同一個簽章模組**
（`src/server/roomToken.ts`，刻意不 import `server-only`，替身用 `tsx` 在 Next 之外跑），替身**先解析 cookie 的身分、再驗票**。
審查指出「本地不綁人」是安全語意的可觀察差異（P 的票給 Q：本地收、真後端拒）—— 所以綁。

## 邊界

- `src/` 裡**沒有任何地方**解析 `room_token`（`grep -rn 'room_token\|roomToken' src | grep -i 'split\|decode\|atob'` 是空的）；
  票只被存（`holdRoomToken`）、讀回、接在 `?token=` 上。
- 簽票只在 `src/server/roomToken.ts`；`enter` 的 handler 與 `realtime-stub.ts` 都 import 它。第二份簽章就是「handler 簽的票替身不認」的起點。
- 契約測試（`tests/contract/rest/enter.contract.ts` 的「票的效力」）對 `internal` 與 `guildhub` 兩個目標跑同一份：
  同房同人 → `hello`；另一間房、另一個人的 cookie、沒有 cookie → 拒絕握手。**格式不在契約裡。**

突變紀錄（2026-09-15）：替身換一把 secret → 握手那段紅；簽章去掉 `|<profileId>` → 「別人拿著這張票進了房」紅；
handler 回 `{ token }` → `EnterOut` 那列紅。

## 代價

- 本地票不過期。`FE-R12`（重連）要測過期，得給替身一個旋鈕（例如環境變數讓它拒絕某張票），契約測試**不得宣稱涵蓋過期**。
- 兩個 `session` 語意上還有一個已知差異（`FE-N08` design D7）：真後端的 `get_current_user` 不查名片，`enter` 對已刪名片的 session 照簽；
  本地走 `handle()` 管線回 401。這一列不進共用矩陣，由本地獨有的 `FE-N08-S16` 守。
- 本地沒有 server-side `room_tokens`（真後端存進 session 給座位端點用）—— 那是 `FE-J13` 的事，到時要另外決定本地怎麼給座位端點驗票。

## 什麼情況下要重新考慮

- 前端需要在握手之前就知道票的狀態（例如「票快過期了，先換一張」的 UX）—— 那時要嘛後端多給一個 `expires_at` 欄位（契約層），
  要嘛前端開始解析票（違反本 ADR，要新開一份取代它）。
- 真後端改成跨 process 驗票（JWT／公鑰）—— 那時「只在簽發者的 process 內有意義」不再成立。
