## Why

`docs/WBS.md` 的 `FE-N08`：「進房：密碼 Modal、錯誤回饋、取得 room token、進出。**W4 就要有**，
因為 W4 的 Project Room 場景需要它」。

`FE-V01` 把場景切換做完並封存了：`enterRoom`／`returnToHall`、票的持有（`roomTokens.ts`，
`sessionStorage`、鍵含身分、不進網址）、深連結、過場、失敗處置。門前按 E 的入口也在
（`EntryGate.tsx` 的 `useRequestEntry()`）：**有票直接進；沒票交給 `EntryGateProvider`**，
而今天沒有任何 provider，預設回應是一句 `role="status"` 的「這間房需要房間密碼。輸入密碼的功能還沒開放。」。
`world-scenes` 的 Purpose 與 `roomTokens.ts` 的註解都明寫「票怎麼拿到是 `FE-N08`」——
**這個 change 就是那個刻意留下的洞**。

**不做會怎樣**：W4 的 Project Room（`FE-W16`）與座位（`FE-J13`）都在房間裡，
而一般使用者走到門前只會看到「功能還沒開放」。真後端的 `POST /api/projects/{id}/enter`、
前端的 `enterProject()` operation、場景切換三者各自存在，但沒有一條使用者走得完的路把它們接起來 ——
Vercel 上的人永遠進不了房間，`FE-V01` 只有測試進得去。

## What Changes

- 新增 capability `room-entry-gate`：
  - Canvas 外掛上正式的 `EntryGateProvider`：沒票時開一個 DOM 的密碼 Modal（`role="dialog"`），
    吃既有的表單慣例（`FE-X05`）、焦點與鍵盤規則（`FE-X06`）、控制項外觀（`FE-X13`）
  - 送出走 `src/api/operations.enterProject()`；成功後**先** `holdRoomToken()` **再** `enterRoom()`；
    Modal 自己不建連線、不寫網址
  - 錯誤回饋：403 說「密碼不對」（真後端這個端點的 403 只有這一個意思）、404 說「進不了」不猜原因、
    401 與服務失敗不偽裝成密碼錯；後端的 `detail` 不進畫面
  - 密碼只活在當次表單：不進 storage、不進網址、關閉或成功就清
  - `world-scenes` 的握手失敗通知多一個**使用者發起**的「重新輸入密碼」動作：啟動才丟票、才開 Modal
  - 本地後端補 `POST /api/projects/{project_id}/enter`（`FE-O03` 的 Route Handler ＋ 可拋棄 DB），
    簽出的票本地即時層替身收得下；`local` 與 `guildhub` 兩個目標跑同一份契約測試
- **既有規格只動一句**：`world-scenes`〈進不去就回 Guild Hall…〉開最小 MODIFIED delta，通知的消失條件多列「使用者從通知啟動重新輸入密碼」，
  其餘正文與 `FE-V01-S06`／`S07`／`S16` 逐字不動（archive 時整條取代，對 diff 要看得到只多那一句）。
  `world-interactive-objects`〈門與看板都註冊進互動系統〉也開最小 MODIFIED：只在 `FE-V01-S11` 的 GIVEN 補上「門禁是預設的」
  （它本來就是測預設 provider，正文也這樣寫，但 GIVEN 沒寫 —— archive 之後同一個 GIVEN 下一邊要 `role="status"`、一邊要 `role="dialog"` 會打架）；其餘逐字。

## Non-goals

- 不做 `FE-N07`（Offer 接受後免密碼進房）、不做成員制或角色判斷：房間密碼**綁專案不綁人**（`rest.ts` 的 `EnterIn` 註解）。
- 不做 `FE-J13`：座位清單、認領、409、「滿了」——**座位滿不等於不能進房**（真後端 `enter_room` 不看座位）。
- 不做 `FE-W16`：房間裡有什麼。
- 不做設定、重設、顯示、提示房間密碼（成軍時由發起人設，`formTeam` 已存在）。
- 不解析票的內容、不做續期、不倒數、不背景換票；過期只有握手會告訴我們（`FE-V01` 已定）。
- 不替後端發明「房間已滿」「已關閉」「嘗試次數過多」等它沒有的錯誤；不做 rate limit（`BE-G16`）、CAPTCHA、鎖定。
- 不改 `returnToHall`：離開房間票不作廢（`world-scenes`〈房間裡隨時回得了 Guild Hall〉已定）。
- 不在前端加密碼長度規則：後端 `EnterIn.password` 與 `FormTeamIn.password` 都只是 `str`（design D6）。
- 不新增第二套 E 鍵監聽、第二個場景狀態機、第二條 WebSocket。
- 不做 `FE-R10`、`FE-J14`。
