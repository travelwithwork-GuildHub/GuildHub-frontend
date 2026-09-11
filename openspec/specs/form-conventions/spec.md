# form-conventions Specification

## Purpose
所有表單走同一套機制（`src/forms/useForm`：react-hook-form ＋ Zod），所以「什麼時候說錯、送出中能不能按、失敗了值還在不在」
是全站一致的行為，不是每個表單各自的決定。驗證分兩層：超過上限、格式非法即時說（也擋送出）；缺必填、太短要按下去才說（永不擋送出）。
送出開始立刻 busy、連按只送一次；失敗留值、錯誤在送出鈕上方取得焦點、不自動重送。文案來自 `toUiError`；前端自己定義的領域錯誤
（如 `NicknameLengthError`）可由呼叫端用 `describeError` 給字，但只准是前端寫的字。

前端自訂的上限（後端沒 check 的欄位）另立 `FORM_LIMITS`，契約 schema 永遠只看 `LIMITS`（lint 守著）；`createOptimistic` 訂好樂觀更新的回滾規則，
今天沒有表單啟用它。`LoginForm` 是第一個遷到這套的表單，既有的 `FE-A01`／`FE-O06` 判準一條沒動。

## Requirements

### Requirement: 驗證時機是全站規則

所有以 `useForm`（react-hook-form）建立的表單 SHALL 遵守同一套時機：
- **即時**（每次輸入）：超過上限、超出數值範圍、格式非法 → 該欄位下方 SHALL 顯示錯誤，送出鈕 SHALL 禁用。
- **送出時**：缺必填、低於下限 → 按送出之後 SHALL 在該欄位下方顯示錯誤、SHALL NOT 送出請求、焦點 SHALL 移到第一個有錯誤的欄位；
  **之後**該欄位的錯誤 SHALL 隨輸入即時更新（修好就消失，不必再按一次）。
- 送出鈕 SHALL 只因「有即時錯誤」或「送出中」禁用；缺必填／太短時 SHALL 可按（讓錯誤說出來）—— **送出過之後**還有必填／太短的錯誤，鈕仍 SHALL 可按。
長度一律以 code point 計（Zod 4.5 的 `.max()` 數 code point —— `tests/contract-limits.test.ts` 釘著：20 個 emoji 通過、21 個不過）。

#### Scenario: [FE-X05-S01] 超過上限即時顯示、送出禁用

- **WHEN** 在一個上限 20 的文字欄輸入 21 個字
- **THEN** 該欄位下方 SHALL 立刻出現錯誤，送出鈕 SHALL 是 disabled；刪到 20 個字 SHALL 都消失

#### Scenario: [FE-X05-S02] 太短要按下去才說

- **WHEN** 一個必填欄位是空的，使用者不按送出
- **THEN** SHALL 沒有錯誤顯示、送出鈕 SHALL 可按
- **WHEN** 按送出
- **THEN** 該欄位下方 SHALL 出現錯誤、SHALL 沒有請求送出、`document.activeElement` SHALL 是那個欄位、送出鈕 SHALL 仍可按

#### Scenario: [FE-X05-S03] 送出過一次之後，錯誤隨輸入更新

- **WHEN** `S02` 之後在那個欄位輸入一個字
- **THEN** 錯誤 SHALL 消失（不必再按送出）

#### Scenario: [FE-X05-S04] 焦點到第一個錯誤欄位

- **WHEN** 兩個必填欄位都空著，按送出
- **THEN** 焦點 SHALL 在 DOM 順序較前的那一個

#### Scenario: [FE-X05-S14] 下限大於 1 的欄位：送出前不說、送出時擋、不足時錯誤留著、夠了才消失

- **WHEN** 一個下限 3 的欄位輸入 2 個字，不按送出
- **THEN** SHALL 沒有錯誤、送出鈕可按
- **WHEN** 按送出
- **THEN** SHALL 顯示錯誤、沒有請求；再輸入到 2 個字（刪一個再打一個）錯誤 SHALL 還在；到 3 個字 SHALL 消失

### Requirement: 送出中、失敗、重試

送出開始 SHALL 立刻進入 busy：送出鈕禁用、handler 內部 SHALL 忽略進行中的第二次 submit（連按 Enter 不送兩次）。
送出失敗 SHALL 保留全部輸入、SHALL NOT 關閉或重設表單、錯誤 SHALL 以 `toUiError(cause).message` 顯示在送出鈕**上方**、`role="alert"`、
`tabIndex=-1` 且**焦點 SHALL 移到它**（長表單按了底部的鈕、錯誤出現在看不到的地方 —— 螢幕閱讀器與鍵盤使用者要知道發生了什麼）；
再按送出就是重試。表單 SHALL NOT 自動重送。
呼叫端 MAY 以 `describeError(cause)` 為**前端自己定義的領域錯誤**（如 `NicknameLengthError`、`RecoveryKeyRejectedError`）提供文案：
回字串就用它、回 `null` 就退回 `toUiError(cause).message`；那個字串 SHALL 是前端寫的字，SHALL NOT 是後端的 `detail` 或例外的原始訊息
（`FE-X03` 的邊界不變 —— 它擋的是後端字串與 schema 語彙，不是前端自己寫給使用者的話）。
欄位錯誤（`visibleErrors`）SHALL 以 `aria-invalid` ＋ `aria-describedby` 關聯到欄位、SHALL NOT 各自加 `role="alert"`：
一個表單同一時刻 SHALL 只有送出鈕上方那一個 `role="alert"`。

#### Scenario: [FE-X05-S05] 連按兩次只送一次

- **WHEN** 送出後請求還沒回來，再觸發一次 submit
- **THEN** 後端 SHALL 只收到一個請求

#### Scenario: [FE-X05-S06] 失敗留值、alert 在送出鈕上方、可重試

- **WHEN** 後端回 500
- **THEN** 每個欄位的值 SHALL 不變、`role="alert"` 的元素 SHALL 出現在送出鈕之前（DOM 順序）、內容 SHALL 是 `toUiError` 對 500 的那一句、`document.activeElement` SHALL 是它；再按送出 SHALL 再送一次

#### Scenario: [FE-X05-S07] 不自動重送

- **WHEN** 後端回 500 之後 2 秒內使用者什麼都不做
- **THEN** 後端 SHALL 只收到那一個請求

### Requirement: 樂觀更新的回滾（hook 層規則，今天沒有表單啟用）

`createOptimistic({ snapshot, apply, request, restore })` SHALL 回一個物件 `{ run, inFlight }`。`run(input)`：先 `snapshot()`，`apply(input)`，`await request(input)`；
失敗 → `restore(snapshot)` 並 resolve `{ ok: false, reason: 'failed', error, input }`（提交值保留給重試）；成功 → resolve `{ ok: true, value }`，`value` 是伺服器回的（**不是** `input`）；
同一個實例 SHALL 一次只允許一個 in-flight：第一次還沒結束時再 `run` SHALL **同步地** resolve `{ ok: false, reason: 'in-flight' }`（不 throw），`apply`／`request` SHALL NOT 被第二次呼叫。

#### Scenario: [FE-X05-S08] 失敗還原快照、保留提交值

- **WHEN** `apply` 把值從 A 改成 B，`request` 拒絕
- **THEN** 狀態 SHALL 回到 A，回傳的 `input` SHALL 是 B

#### Scenario: [FE-X05-S09] 成功以伺服器值為準

- **WHEN** `request` 回 C（跟送出的 B 不同）
- **THEN** 回傳的值 SHALL 是 C

#### Scenario: [FE-X05-S10] 一次一個 in-flight

- **WHEN** 第一次還沒結束就再 `run` 一次
- **THEN** 第二次 SHALL resolve `{ ok: false, reason: 'in-flight' }`，`apply` 與 `request` SHALL 各只被呼叫一次；第一次結束後 `inFlight` SHALL 是 false

### Requirement: 前端自訂的上限另立一個模組，契約永遠只看 `LIMITS`

`src/forms/limits.ts` 的 `FORM_LIMITS` SHALL 只包含後端沒有 check 的欄位：`projectTitle.max = 60`、`projectBody.max = 2000`、
`skillCount.max = 10`、`skillLength.max = 40`、`hoursPerWeek = { min: 0, max: 80 }`（code point／整數）。
表單 schema SHALL 用 `effectiveLimit(field)`：後端有上限用 `LIMITS`，沒有才用 `FORM_LIMITS`；`FORM_LIMITS` 的每一項 SHALL NOT 比 `LIMITS` 的同名上限寬。
`src/api/contract/**` SHALL NOT 引用 `FORM_LIMITS`（既有 lint：契約 schema 的 `.min/.max` 只能接 `LIMITS.*`）。
前端自訂上限的錯誤文案 SHALL 說明是本站的限制（不是後端的）。

#### Scenario: [FE-X05-S11] FORM_LIMITS 只覆蓋後端沒有上限的欄位

- **WHEN** 列舉 `FORM_LIMITS` 的鍵
- **THEN** 每一個對應的 `LIMITS[key].max` SHALL 是 `UNBOUNDED`（或 `LIMITS` 沒有那個鍵，如 `hoursPerWeek`）；`effectiveLimit('displayName')` SHALL 是 `LIMITS.displayName`（後端有）

#### Scenario: [FE-X05-S12] 契約 schema 引用 FORM_LIMITS 被擋

- **WHEN** 以 repo 的 ESLint 設定 lint 一段放在 `src/api/contract/rest.ts` 路徑下的 `z.string().max(FORM_LIMITS.projectTitle.max)`
- **THEN** SHALL 報錯（只能接 `LIMITS.*`）

### Requirement: `LoginForm` 遷到同一套，行為不變

`LoginForm` SHALL 改用 `useForm` ＋ Zod schema；`FE-A01-S01`／`S02`／`S03` 與 `FE-O06-S06`～`S08` 的判準 SHALL 全部照舊通過。

#### Scenario: [FE-X05-S13] 登入表單遷移後既有判準不變，欄位由 RHF 註冊

- **WHEN** 跑 `tests/login-form.test.tsx`、`tests/login-form-limits*.test.tsx`
- **THEN** SHALL 全綠
- **AND** 暱稱欄的 `input` SHALL 有 `name="nickname"`（RHF 的 `register` 給的；`useState` 版沒有 name）
