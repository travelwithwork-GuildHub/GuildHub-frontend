## Applicability

權限：**適用（但不擋）** —— `/login` 對所有人開放（`FE-A01`：這一頁不擋任何人）；已登入的人再登入／註冊另一個帳號，session 換成新的那張名片（後端 `_remember` 覆寫），本 change 不擋、不問
併發：**適用** —— 同一個表單的第二次送出（`FE-X05` 的 guard）；四個入場表單共用一個「送出中」，任一送出中不得從別的表單再送；兩個人同時註冊同一個帳號（後端 unique 決定）
持久資料相容性：**適用** —— 寫入 `profiles.login_id`／`password_hash`（既有匿名名片這兩欄是 `null`，不動）；密碼雜湊參數與真後端相容（`FE-O03` design `D4`）；「記住我」的落地沿用 `FE-A01-S07`
失敗路徑：**適用** —— 帳號或密碼錯（403）、帳號已存在（409）、欄位不合法（前端先擋；契約 422）、後端失敗（5xx）、連不上

測試連到什麼：jsdom ＋ `tests/support/contract-server`（本機自己起的 HTTP server）；契約測試連本機自己起的 `next start`＋Postgres（`internal`）與本機自起的真後端（`guildhub`）。**不連任何團隊共用位址。**

## ADDED Requirements

### Requirement: 登入頁有帳號密碼的入口，匿名路仍是主路

`/login` SHALL 在既有的兩個表單（暱稱、恢復金鑰）之後多一個區塊「用帳號密碼」，區塊內 SHALL 以兩個 `button`（`aria-pressed`）在**登入**與**註冊**之間切換，預設顯示登入；
**同一時刻 DOM 上只有其中一個 `<form>`**（不是 `hidden`：兩個含密碼欄的表單同時在 DOM 上會弄亂瀏覽器的密碼管理員與無障礙樹）；切換 SHALL NOT 清掉另一個表單已輸入的值。
暱稱表單 SHALL 仍是頁面上第一個 `form`（DOM 順序）；`FE-A01`、`FE-O06`、`FE-X05-S13` 的判準 SHALL 全部照舊通過。
**任何一個入場表單送出中**（暱稱、金鑰、登入或註冊）SHALL 禁用**當下已渲染的**所有入場送出鈕（三個：暱稱、金鑰、登入或註冊）**與**兩個切換鈕（送出中切走的話，回來的錯誤會掛在看不見的表單上）。

#### Scenario: [FE-A08-S01] 預設登入、切到註冊、切回來值還在；DOM 上一次只有一個

- **WHEN** 開 `/login`
- **THEN** SHALL 看到「用帳號密碼」區塊，登入表單在（`data-testid="account-login-form"`）、註冊表單**不在 DOM 上**；「登入」切換鈕 `aria-pressed="true"`、「註冊」`aria-pressed="false"`
- **WHEN** 在登入表單的帳號欄輸入 `alice`，按「註冊」切換鈕
- **THEN** 註冊表單在 DOM 上（`data-testid="account-register-form"`）、登入表單不在
- **WHEN** 再按「登入」切換鈕
- **THEN** 登入表單的帳號欄 SHALL 仍是 `alice`
- **AND** 暱稱表單 SHALL 是頁面上的第一個 `form`

#### Scenario: [FE-A08-S12] 送出中：所有入場鈕與切換鈕都禁用

- **WHEN** 登入表單送出、後端還沒回
- **THEN** 當下在 DOM 上的三個送出鈕（暱稱、金鑰、登入）SHALL 都是 disabled，兩個切換鈕 SHALL 都是 disabled；後端回來（403）之後 SHALL 全部恢復、alert 在登入表單裡

### Requirement: 註冊建立一張帶帳號密碼的名片，成功即登入

註冊表單 SHALL 有 `login_id`（`LIMITS.loginId`：3–32 code point）、`password`（`LIMITS.password`：最少 8 code point、**沒有上限**，前端 SHALL NOT 自加上限；`type="password"`）、`nickname`（`LIMITS.displayName`：1–20）三欄，
驗證時機照 `FE-X05`（太短送出才說、超過上限即時說、焦點到 DOM 順序第一個有錯的欄位）。三欄 SHALL **原值原樣**送出：SHALL NOT trim、大小寫折疊、Unicode 正規化（後端沒有這些規則，前端加了會讓註冊與登入的值對不上）。
註冊表單 SHALL 有一個「顯示密碼」切換（`checkbox`）把密碼欄在 `type="password"` 與 `type="text"` 之間切換 —— 沒有密碼重設管道，打錯了註冊不知道，這是唯一的自我檢查；不做「確認密碼」欄（多一欄的摩擦，`Non-goals`）。
送出 SHALL 是 `POST /api/register`，body **正好**是 `{login_id, password, nickname}`（SHALL NOT 含 `avatar_id` 或其他鍵）。
成功 SHALL 進入 `signed-in`、依「記住我」處置金鑰（`FE-A01-S07` 的規則：勾了落地 `id`；沒勾 SHALL 把持久儲存裡**既有的**金鑰也清掉 —— `session.ts` 的 `persist` 就是這樣做的），然後 SHALL 導向 `/world`：
帳號密碼就是這個人回來的路，**不顯示恢復金鑰畫面**（那是匿名路的義務，`FE-A01-S09`；對有密碼的人是認知干擾）。
後端回 409 SHALL 以前端自己寫的一句話說「這個帳號已經有人用了。」（`role="alert"`，`FE-X05` 的位置與焦點），alert 的文字（trim 後）SHALL **逐字等於**那一句 —— SHALL NOT 夾帶後端的 `detail` 或其他字；值 SHALL 保留。

#### Scenario: [FE-A08-S02] 註冊送出的 body 與成功後的去向

- **WHEN** 填 `login_id=Alice_01`、`password=correct horse`、`nickname=愛麗絲`，不勾記住我（持久儲存裡先放一把舊金鑰），送出
- **THEN** 後端 SHALL 收到 `POST /api/register` 一次，body SHALL 正好是 `{"login_id":"Alice_01","password":"correct horse","nickname":"愛麗絲"}`（大小寫原樣）
- **AND** 後端回 200 的 `ProfileOut` 後 SHALL 導向 `/world`（`next/navigation` 的 `router.push('/world')`），SHALL NOT 顯示 `data-testid="recovery-key"`；持久儲存中 SHALL NOT 有任何恢復金鑰（舊的也被清掉）

#### Scenario: [FE-A08-S03] 帳號已存在

- **WHEN** 後端回 409 `{"detail":"後端寫的字"}`
- **THEN** SHALL 出現 `role="alert"`，文字（trim 後）SHALL 逐字等於「這個帳號已經有人用了。」；三欄的值 SHALL 不變、表單 SHALL 仍在；`document.activeElement` SHALL 是那個 alert

#### Scenario: [FE-A08-S04] 太短送出才說、超過上限即時擋、焦點到第一個錯的

- **WHEN** `login_id` 輸入 2 個字、`password` 輸入 7 個字、`nickname` 空著，不按送出
- **THEN** SHALL 沒有錯誤顯示、送出鈕可按
- **WHEN** 按送出
- **THEN** SHALL 沒有請求，三欄下方 SHALL 各有錯誤，焦點 SHALL 在 `login_id` 欄（DOM 順序第一個）
- **WHEN** `login_id` 輸入 33 個字、`nickname` 輸入 21 個字
- **THEN** SHALL 立刻各有錯誤、送出鈕 SHALL 禁用；`password` 輸入 200 個字 SHALL **沒有**錯誤（沒有上限）
- **WHEN** `login_id` 輸入 32 個 emoji（`.length` 是 64）、`nickname` 輸入 20 個 emoji
- **THEN** SHALL **沒有**錯誤（長度以 code point 計 —— 用 `.length` 算的實作在這裡會擋）

#### Scenario: [FE-A08-S13] 顯示密碼切換

- **WHEN** 勾「顯示密碼」
- **THEN** 註冊表單的密碼欄 `type` SHALL 是 `text`；取消勾選 SHALL 回到 `password`；值 SHALL 不變

#### Scenario: [FE-A08-S11] 註冊時後端失敗（500）：`toUiError` 的句子、值保留

- **WHEN** 註冊送出，後端回 500
- **THEN** alert 的文字 SHALL 逐字等於 `toUiError` 對 500 的那一句（不是「這個帳號已經有人用了。」），三欄的值 SHALL 保留，再送 SHALL 再打一次

### Requirement: 帳號密碼登入驗證身分，錯了不透露哪一個錯

登入表單 SHALL 有 `login_id`、`password` 兩欄，限制與時機**跟註冊表單相同**（`LIMITS.loginId`、`LIMITS.password`、`FE-X05`），原值原樣送出；也有「顯示密碼」切換。
送出 SHALL 是 `POST /api/login`，body **正好**是 `{login_id, password}`（SHALL NOT 含 `nickname`／`resume_token`）。
後端回 403 SHALL 以前端自己寫的一句話說「帳號或密碼錯誤。」（`role="alert"`，文字 trim 後 SHALL 逐字等於它），SHALL NOT 夾帶後端的 `detail`；
這個對映 SHALL **只看 status**（403 → 那一句），所以「帳號不存在」與「密碼錯」在畫面上 SHALL 完全一樣（後端刻意回同一句）。
**兩欄的值 SHALL 保留**（含密碼欄 —— `FE-X05` 的全站規則），焦點 SHALL 在 alert；再按送出 SHALL 再打一次。
成功 SHALL 進入 `signed-in`、依「記住我」處置金鑰（同註冊）、導向 `/world`，SHALL NOT 顯示恢復金鑰畫面。

#### Scenario: [FE-A08-S05] 密碼錯：同一句、不用後端的字、兩種 detail 畫面一樣

- **WHEN** 填 `login_id=alice`、`password=wrong-pass`，後端回 403 `{"detail":"後端寫的字 A"}`
- **THEN** SHALL 出現 `role="alert"`，文字（trim 後）SHALL 逐字等於「帳號或密碼錯誤。」；後端 SHALL 收到 `POST /api/login` 一次，body 正好 `{"login_id":"alice","password":"wrong-pass"}`
- **WHEN** 另起一次：填 `login_id=nobody`、`password=wrong-pass`，後端回 403 `{"detail":"後端寫的字 B"}`
- **THEN** alert 的文字 SHALL 跟上一次**完全相同**

#### Scenario: [FE-A08-S06] 失敗後兩欄的值都在，可以再試

- **WHEN** 填 `login_id=alice`、`password=wrong-pass`，後端回 403，送出
- **THEN** alert 出現後 `login_id` 欄 SHALL 是 `alice`、`password` 欄 SHALL 是 `wrong-pass`、`document.activeElement` SHALL 是 alert
- **WHEN** 改密碼為 `right-pass`，後端回 200，送出
- **THEN** 後端 SHALL 收到第二次 `POST /api/login`（body 的 `password` 是 `right-pass`），然後 SHALL 導向 `/world`

#### Scenario: [FE-A08-S07] 登入成功、勾了記住我就落地；沒勾就清掉舊的

- **WHEN** 勾「在這台裝置上記住我」，填帳號密碼，後端回 200 的 `ProfileOut`
- **THEN** 持久儲存中的恢復金鑰 SHALL 是回應的 `id`；SHALL 導向 `/world`
- **WHEN** 換一次：持久儲存裡先放一把舊金鑰、不勾、登入成功
- **THEN** 持久儲存中 SHALL NOT 有恢復金鑰

#### Scenario: [FE-A08-S08] 登入時後端失敗（500）／連不上：`toUiError` 的句子、值保留

- **WHEN** 登入送出，後端回 500
- **THEN** alert 的文字 SHALL 逐字等於 `toUiError` 對 500 的那一句（不是「帳號或密碼錯誤。」），兩欄的值 SHALL 保留
- **WHEN** 登入送出，連線被拒（伺服器已關）
- **THEN** alert 的文字 SHALL 逐字等於 `toUiError` 對 `network-unavailable` 的那一句

#### Scenario: [FE-A08-S14] 登入表單的太短不送、超長即時擋

- **WHEN** 登入表單 `login_id` 輸入 2 個字、`password` 輸入 7 個字，按送出
- **THEN** SHALL 沒有請求，兩欄下方 SHALL 各有錯誤
- **WHEN** `login_id` 輸入 33 個字
- **THEN** SHALL 立刻有錯誤、送出鈕 SHALL 禁用

### Requirement: 本地後端與契約測試補上 register 與密碼登入

本地後端（`FE-O03`）SHALL 有 `POST /api/register`：成功 200 回 `ProfileOut` 並寫 session cookie；`profiles.login_id` 的 unique 違反（**只認那一個 constraint**：`23505` 且 `constraint = 'profiles_login_id_key'`；其他 unique 違反照 `FE-O03` 的規則回 500）SHALL 回 409 `{"detail":"這個帳號已經有人用了"}`（不先查再寫，靠 unique）；
形狀不合 SHALL 回 Pydantic 形狀的 422（`FE-O05` 的 golden 機制：比 status／content-type／`detail[{type,loc}]`，兩個目標同一組案例）。密碼 SHALL 以 `hashPassword`（跟真後端同參數）存。
契約測試（`FE-O05`）SHALL 對兩個目標各驗：register 成功、撞名 409、422 golden、**併發撞名**；密碼登入成功、錯密碼 403、不存在的帳號 403 且 `detail` 逐字相同。

#### Scenario: [FE-A08-S09] 註冊之後就是登入狀態；撞名 409（新的 cookie jar）

- **WHEN** 對 `POST /api/register` 送一組新的 `{login_id, password(≥8), nickname}`
- **THEN** SHALL 回 200 `ProfileOut`（`display_name` 是 `nickname`），同一個 cookie jar 接著 `GET /api/me` SHALL 回同一個 `id`
- **WHEN** 用**新的** cookie jar 再送同一個 `login_id`（別的密碼與暱稱）
- **THEN** SHALL 回 409，`detail` SHALL 是「這個帳號已經有人用了」

#### Scenario: [FE-A08-S16] 別的 unique 違反不是 409（本地後端的資料層）

- **WHEN** 本地後端的 register 資料層收到一個 `23505` 但 `constraint` 不是 `profiles_login_id_key`（測試注入）
- **THEN** SHALL NOT 轉成 409；SHALL 照 `FE-O03` 的規則回 500

#### Scenario: [FE-A08-S15] 兩個人同時註冊同一個帳號：恰好一個 200、一個 409

- **WHEN** 兩個獨立的 cookie jar **同時**（`Promise.all`）對 `POST /api/register` 送同一個 `login_id`
- **THEN** 回應的 status 排序後 SHALL 是 `[200, 409]`（不得有 500）；`GET /api/profiles?page=0` 裡那個 `login_id` 對應的名片 SHALL 只有一張（以 200 回應的 `id` 找得到、且暱稱是 200 那次送的）

#### Scenario: [FE-A08-S10] 錯密碼與不存在的帳號回同一句 403

- **WHEN** 對剛註冊的帳號送錯的密碼（≥8 字）、以及對一個不存在的 `login_id` 送一個 ≥8 字的密碼
- **THEN** 兩次 SHALL 都是 403，兩次的 `detail` SHALL 逐字相同；用對的密碼 SHALL 回 200 且 `id` 是註冊時那張
