# `FE-A08` 設計：難逆轉的決定與代價

## D1｜三種入場方式在同一頁；帳號密碼那一塊是登入／註冊切換

`/login` 今天是兩個 `<form>`（暱稱、恢復金鑰）。加第三塊「用帳號密碼」，裡面**一次只渲染一個**表單（登入或註冊），用兩個 `button`（`aria-pressed`）切換；預設登入。
四個表單同時攤開會讓「取一個名字就可以進去」（發表日的主路）被淹掉。切換不清掉另一個表單的值：兩個 `useForm` 都掛在 `LoginForm`（hook 不卸載，值留在 RHF 的 control 裡），
**DOM 上只渲染一個 `<form>`** —— 不用 `hidden`（兩個含密碼欄的表單同時在 DOM 上會弄亂密碼管理員與無障礙樹，審查者抓到）。
任一入場表單送出中，當下在 DOM 上的三個送出鈕與兩個切換鈕都禁用（今天暱稱／金鑰就是共用一個 busy）：送出中切走，回來的 403 會掛在看不見的表單上。

## D2｜403 與 409 是領域錯誤，文案是前端的；對映只在那兩個函式裡

`toUiError` 的 403 是「你沒有權限做這件事。」、409 是「這件事跟目前的狀態衝突了⋯⋯」—— 對登入頁都不對。
**只在** `signInWithPassword` 把**那一次** `POST /api/login` 的 403 轉成 `CredentialsRejectedError`、**只在** `registerAccount` 把那一次 `POST /api/register` 的 409 轉成 `LoginIdTakenError`
（跟 `signInWithRecoveryKey` 的 404 → `RecoveryKeyRejectedError` 同一個做法）；其他 status 原樣拋、走 `toUiError`。不在 transport 或 `session.ts` 的通用位置按 status 全域轉 —— 那會把別的端點的 403 說成密碼錯。
文案由 `LoginForm` 的 `describeError` 給（`FE-X05` 規格修正 #354 開的那條路：前端自己定義的領域錯誤、前端寫的字）。**不用後端的 `detail`**（`FE-X03`：message 永遠不是後端的字；一位審查者主張直接顯示 detail，跟已合併的 `FE-X03` 衝突，不採）。
對映只看 status，所以「帳號不存在」與「密碼錯」在畫面上一樣 —— 後端刻意回同一句（不送出帳號存在性），前端沒有別的訊號可分、也不該找。

## D3｜密碼欄在失敗後不清

一般網站失敗會清密碼欄。這裡不清：`FE-X05` 全站規則是「失敗 SHALL 保留全部輸入」，而登入頁的密碼欄是 `type="password"`（看不到），保留的代價是零、重打的代價是一次。
**送出成功後**表單整個卸載（進 `signed-in` 畫面），密碼不會留在 DOM 裡。

## D4｜本地後端的 `register`

`FE-O03` 沒做 `POST /api/register`（當時沒有呼叫端）。這裡補：照 `auth.py` —— insert 帶 `login_id`、`password_hash`（`hashPassword`，同參數），
unique violation **只認 `profiles_login_id_key`**（`23505` ＋ `constraint`；別的 unique 違反照 `FE-O03` 回 500）→ 409 `{"detail":"這個帳號已經有人用了"}`，成功寫 session cookie、回 `ProfileOut`。
不先查再寫（後端守則 §1 規則 4）—— 這條**用契約測試守**：兩個 jar `Promise.all` 同時註冊同一個帳號，恰好 `[200, 409]`、不得 500（`S15`）；先查再寫的實作在這條上會出現兩個 200 或一個 500。
契約測試兩個目標（`internal`、`guildhub`）都要過：register 成功／撞名 409／併發撞名／422（`FE-O05` 的 golden 機制）；密碼登入成功／錯密碼 403／不存在的帳號 403（同一句）。

## D5｜「記住我」對帳號密碼一樣有意義；但不看金鑰畫面

帳號密碼登入之後，恢復金鑰仍然是回來的另一條路（`resume_token` ＝ 名片 id）。「記住我」的語意不變：勾了就把金鑰落地、沒勾把舊的清掉（`persist`）。所以四個表單共用同一個勾選框。
成功後**導向 `/world`**、不顯示 `FE-A01-S09` 的金鑰畫面（審查者：對有密碼的人是認知干擾）。`/login` 頁「不導向任何地方」那條（`FE-A01`）指的是**進頁時**不擋人；成功後導向是這條路自己的行為，`FE-A01` 的判準不動。

## D6｜「顯示密碼」切換

沒有密碼重設（後端決定），註冊時打錯密碼的代價是失去帳號。一位審查者要「確認密碼」或「顯示密碼」；選後者：零摩擦、一個 checkbox 切 `type`。

## 待答問題

1. `login_id` 的字元集：後端只有長度 check（3–32），沒有字元限制。前端**不加**、也不 trim／折疊（加了會拒絕後端收的東西、或讓註冊與登入對不上）。

## 這一份怎麼驗

- `S01`～`S08`、`S11`～`S14`：jsdom ＋ `tests/support/contract-server`（本機自己起的 HTTP server），走真的 `LoginForm` ＋ `src/identity/` ＋ `src/api/`；`router.push` 用 `next/navigation` 的 mock 看呼叫。**不連任何外部服務。**
- `S09`、`S10`、`S15`：契約測試；`S16`：本地後端資料層的單元測試（注入 pg 錯誤）； `npm run test:contract:internal`（CI）、`npm run test:contract:guildhub`（本機，自起真後端）。
- 驗收不是全綠：403 走 `toUiError` → `S05` 紅；夾帶 detail → `S03`／`S05` 紅；失敗清密碼欄 → `S06` 紅；register 帶 `avatar_id` → `S02` 紅；切換清值 → `S01` 紅；`hidden` 切 → `S01` 紅；送出中可切 → `S12` 紅；先查再寫 → `S15` 紅（或兩個 200）；成功顯示金鑰畫面 → `S02` 紅。
