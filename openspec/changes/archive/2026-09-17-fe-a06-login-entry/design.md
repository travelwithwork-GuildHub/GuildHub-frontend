## Context

`src/app/login/LoginForm.tsx` 在 `identity.state === 'signed-in'` 時渲染自己的 `RecoveryKeyPanel`
（金鑰、兩句警語，沒有按鈕）。`src/first-entry/FirstEntryFlow.tsx` 在同一個狀態下渲染
「帶走這把鑰匙，再進去」（金鑰、兩句警語、複製、填回 6 碼、預設 disabled 的「進入世界」）。
兩份畫面的前半段逐字一樣，後半段一份有閘、一份沒有。

`FirstEntryFlow` 的檔頭註解逐字：「**同一個流程，兩種呈現**⋯⋯不得為了兩個入口各寫一套狀態機 ——
那是封存前審查時 codex 的條件（design D1），而理由是兩套一定會漂」。這個 change 是第三個入口。

## D1｜把「帶走鑰匙」那一半從 `FirstEntryFlow` 抽成一個元件，三種呈現共用

`FirstEntryFlow` 拆成兩半：取名字的表單（留在原檔）與 `KeyHandoff({ identity, clipboard?, onDone })`
（新檔 `src/first-entry/KeyHandoff.tsx`）。`FirstEntryFlow` 在 `signed-in` 之後渲染 `KeyHandoff`；
`LoginForm` 在暱稱路 `signed-in` 之後渲染**同一個** `KeyHandoff`，`onDone` 做的事跟 `RootEntry` 一樣
（`markFirstEntryDone()`、`router.replace('/world')`）。`RecoveryKeyPanel` 刪掉。
`LoginForm` 開一個可選的 `clipboard?: ClipboardPort` 往下傳，讓它的判準跟 `tests/first-entry-flow.test.tsx` 用同一種替身、不靠 `vi.mock`。

三種呈現是：`/` 整頁（`RootEntry`）、`/world` 引導層（`FirstEntryNotice`）、`/login` 暱稱路 —— 都是「剛建了一張新名片」。
恢復金鑰路與帳號密碼路**刻意不用它**：那兩條路的人手上已經有回來的憑證。

**不採的做法**：在 `LoginForm` 裡把 `RecoveryKeyPanel` 補上複製與填回尾碼 —— 那就是第二套狀態機，
`PROOF_LENGTH`、「寫入成功之後才設 copied」、「填錯不放行」三條都會有兩份，而其中一份一定會漂。

`fe-a06-first-entry` 對 `FirstEntryFlow` 的判準（`tests/first-entry-flow.test.tsx`，`S07`～`S12`）**不改一個字**：
拆完之後它們仍然透過 `FirstEntryFlow` 走到 `KeyHandoff`，紅了就是拆壞了。

## D2｜恢復金鑰路不顯示金鑰畫面

貼金鑰進來的人手上就是那把金鑰；顯示它等於要他證明一次自己剛貼的東西。
`LoginForm` 的 `recovery` 表單 `onSubmit` 成功之後直接 `router.replace('/world')`，
跟帳號密碼路（`FE-A08`）一樣不顯示 `data-testid="recovery-key"`。

`replace` 而不是 `push`：登入頁不該留在返回鍵的歷史裡（回上一頁看到一個空的登入頁沒有意義）。
帳號密碼路今天用 `push`，這個 change **不改它**（`FE-A08-S02` 逐字寫了 `router.push('/world')`）。

## D3｜端到端腳本的實作層斷言要換，但身分同一性的證據不能降級

`tests/e2e/identity-flow.mjs` 4.4c 那段在 `/login` 貼金鑰之後 `waitForSelector('[data-testid="recovery-key"]')`
再讀金鑰比對 `keyBack === keyA` —— 「畫面上有那把金鑰」是實作細節，但 **`keyBack === keyA` 是 `FE-A01-S17`
「同一張名片」的證據**，不能只換成「badge 顯示原本的名字」：一個拿到有效金鑰卻建一張同名新名片的實作，
名字對、id 錯（審查抓到的）。改成：第一條路建立身分之後就用 `page.request.get('/api/me')`（帶 context 的 cookie）讀回 `idA`；
金鑰路等網址變成 `/world`，再讀 `/api/me` 得 `idB`，斷言 `idB === idA`；badge 的名字照舊比。
**不斷言 `idB === keyA`**：今天 `session.ts` 的 `persist(store, profile.id, …)` 確實把名片 id 當金鑰，
但主規格只說金鑰「指向」名片、沒保證編碼 —— 靠它的話，後端哪天把 `resume_token` 換成不透明字串，這條斷言會把正確的實作打紅（第二輪審查抓到的）。返回上一頁 SHALL NOT 回到 `/login`（`page.goBack()` 後網址不是 `/login`）。

## D4｜量過的事實

- `FE-A08-S02`／`S07` 已把密碼路寫成「導向 `/world`、SHALL NOT 顯示 `recovery-key`」—— 這個 change 把金鑰路對齊到它。
- `FirstEntryNotice`（`/world` 的引導層）只在 `identity.state === 'guest'` 顯示；從 `/login` 進來的人已經是 `signed-in`，
  所以 `markFirstEntryDone()` 在這條路上只是對稱，不影響畫面。

## 驗證方式

- 單元（jsdom）：`tests/login-entry.test.tsx` —— `S13` 暱稱路建立身分後有 `KeyHandoff`（金鑰、預設 disabled 的「進入世界」、
  按之前儲存裡沒有 `first-entry-done`；複製成功後可用且有「已經複製」；按下去 `router.replace('/world')` 且記下）；
  `S14` 金鑰路成功後 `replace('/world')`（不是 `push`）且 DOM 上沒有 `recovery-key`、沒有金鑰文字；
  `S15` 複製失敗不導向；`S17` 填錯尾碼不導向（各自全新 render）。`next/navigation` 與 `src/identity/session` 用替身（跟 `tests/login-account.test.tsx` 同一套）。
- 端到端（真瀏覽器、`next start`、本機 internal 後端）：`tests/e2e/identity-flow.mjs` 補三條路各到 `/world`
  且 badge 是名片上的名字、金鑰路的 `/api/me` id 等於第一條路建立身分後從 `/api/me` 取得的 id、`goBack()` 不回 `/login`（`S16`）；
  剪貼簿在 Chromium 授權 `clipboard-read`／`clipboard-write` 後真讀回（沿用 `first-entry.mjs` 的做法）。
- 突變：`KeyHandoff` 的「進入世界」`disabled` 拿掉 → `S13` 紅；渲染金鑰畫面時就 `markFirstEntryDone()` → `S13` 紅；
  金鑰路改回顯示 `RecoveryKeyPanel` → `S14` 紅；金鑰路改 `push` → `S14` 紅；
  `copy()` 把 `setTaken({how:'copied'})` 搬到 `await` 前 → `S15` 紅；尾碼比對改成「有填就放行」→ `S17` 紅；
  e2e：金鑰路改成用同名建新名片（本機替身）→ `S16` 的 id 斷言紅。
