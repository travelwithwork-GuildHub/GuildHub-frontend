## Applicability

權限：**不適用** —— 表單規則對所有人一樣
併發：**適用** —— 同一個表單的第二次送出、樂觀更新的失敗與成功交錯
持久資料相容性：**不適用** —— 不讀寫持久資料
失敗路徑：**適用** —— 驗證失敗、送出失敗、重複送出、樂觀更新失敗

測試連到什麼：jsdom ＋ `tests/support/contract-server`（本機自己起的 HTTP server，只給 `LoginForm` 的判準）；**不連任何外部服務。**

## ADDED Requirements

### Requirement: 驗證時機是全站規則

所有以 `useForm`（react-hook-form）建立的表單 SHALL 遵守同一套時機：
- **即時**（每次輸入）：超過上限、超出數值範圍、格式非法 → 該欄位下方 SHALL 顯示錯誤，送出鈕 SHALL 禁用。
- **送出時**：缺必填、低於下限 → 按送出之後 SHALL 在該欄位下方顯示錯誤、SHALL NOT 送出請求、焦點 SHALL 移到第一個有錯誤的欄位；
  **之後**該欄位的錯誤 SHALL 隨輸入即時更新（修好就消失，不必再按一次）。
- 送出鈕 SHALL 只因「有即時錯誤」或「送出中」禁用；缺必填／太短時 SHALL 可按（讓錯誤說出來）。
長度一律以 code point 計（`FE-O06` 的 helper／Zod 4 的 `.max()`）。

#### Scenario: [FE-X05-S01] 超過上限即時顯示、送出禁用

- **WHEN** 在一個上限 20 的文字欄輸入 21 個字
- **THEN** 該欄位下方 SHALL 立刻出現錯誤，送出鈕 SHALL 是 disabled；刪到 20 個字 SHALL 都消失

#### Scenario: [FE-X05-S02] 太短要按下去才說

- **WHEN** 一個必填欄位是空的，使用者不按送出
- **THEN** SHALL 沒有錯誤顯示、送出鈕 SHALL 可按
- **WHEN** 按送出
- **THEN** 該欄位下方 SHALL 出現錯誤、SHALL 沒有請求送出、`document.activeElement` SHALL 是那個欄位

#### Scenario: [FE-X05-S03] 送出過一次之後，錯誤隨輸入更新

- **WHEN** `S02` 之後在那個欄位輸入一個字
- **THEN** 錯誤 SHALL 消失（不必再按送出）

#### Scenario: [FE-X05-S04] 焦點到第一個錯誤欄位

- **WHEN** 兩個必填欄位都空著，按送出
- **THEN** 焦點 SHALL 在 DOM 順序較前的那一個

### Requirement: 送出中、失敗、重試

送出開始 SHALL 立刻進入 busy：送出鈕禁用、handler 內部 SHALL 忽略進行中的第二次 submit（連按 Enter 不送兩次）。
送出失敗 SHALL 保留全部輸入、SHALL NOT 關閉或重設表單、錯誤 SHALL 以 `toUiError(cause).message` 顯示在送出鈕**上方**、`role="alert"`；
再按送出就是重試。表單 SHALL NOT 自動重送。

#### Scenario: [FE-X05-S05] 連按兩次只送一次

- **WHEN** 送出後請求還沒回來，再觸發一次 submit
- **THEN** 後端 SHALL 只收到一個請求

#### Scenario: [FE-X05-S06] 失敗留值、alert 在送出鈕上方、可重試

- **WHEN** 後端回 500
- **THEN** 每個欄位的值 SHALL 不變、`role="alert"` 的元素 SHALL 出現在送出鈕之前（DOM 順序）、內容 SHALL 是 `toUiError` 對 500 的那一句；再按送出 SHALL 再送一次

#### Scenario: [FE-X05-S07] 不自動重送

- **WHEN** 後端回 500 之後 2 秒內使用者什麼都不做
- **THEN** 後端 SHALL 只收到那一個請求

### Requirement: 樂觀更新的回滾（hook 層規則，今天沒有表單啟用）

`optimistic({ snapshot, apply, request, restore })` SHALL：先 `snapshot()`，`apply(input)`，`await request(input)`；
失敗 → `restore(snapshot)` 並回傳 `{ ok: false, error, input }`（提交值保留給重試）；成功 → 回傳伺服器的值（**不是** `input`）供呼叫端當最終狀態；
同一個 optimistic 實例 SHALL 一次只允許一個 in-flight（第二次呼叫在第一次結束前 SHALL 被拒絕，不套用）。

#### Scenario: [FE-X05-S08] 失敗還原快照、保留提交值

- **WHEN** `apply` 把值從 A 改成 B，`request` 拒絕
- **THEN** 狀態 SHALL 回到 A，回傳的 `input` SHALL 是 B

#### Scenario: [FE-X05-S09] 成功以伺服器值為準

- **WHEN** `request` 回 C（跟送出的 B 不同）
- **THEN** 回傳的值 SHALL 是 C

#### Scenario: [FE-X05-S10] 一次一個 in-flight

- **WHEN** 第一次還沒結束就再呼叫一次
- **THEN** 第二次 SHALL 立刻被拒絕，`apply` SHALL 沒有被第二次呼叫

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

#### Scenario: [FE-X05-S13] 登入表單遷移後既有判準不變

- **WHEN** 跑 `tests/login-form.test.tsx`、`tests/login-form-limits*.test.tsx`
- **THEN** SHALL 全綠，而且 `LoginForm` 裡 SHALL 沒有 `useState` 管欄位值（欄位值在 RHF）
