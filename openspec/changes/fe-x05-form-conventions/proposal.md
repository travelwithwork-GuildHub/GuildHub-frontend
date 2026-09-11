# `FE-X05` 表單一致性

## Why

今天有兩個表單（`LoginForm`、`AvatarPicker`），各自用 `useState` 長出各自的「什麼時候顯示錯誤、送出中怎樣、失敗留不留值」。
第三個表單（`FE-A04` 的名片編輯）來的時候如果再長一套，三個表單三種行為 —— 使用者在同一個產品裡學三次。
`src/design/controls.ts` 的檔頭明寫「完整表單一致性是 `FE-X05`，不要在這裡長出帶 API 的元件」——這一列就是那件事。

另外，後端對 `projects.title`／`body`、`skills` 的數量與長度**完全沒有上限**（`LIMITS` 是 `UNBOUNDED`）。
WBS：「前端自己訂並寫進規格」。沒訂的話，第一個案件表單會讓人貼一本書進標題。

不做會怎樣：`FE-A04` 只能再發明一次；`FE-B02` 的建案件表單第三次。

## What Changes

- **驗證時機是全站規則**（兩位審查者兩輪一致，延續 `FE-A01-S02` 的裁決）：
  即時顯示＝超過上限、超出範圍、格式非法（欄位下方，且送出鈕禁用）；
  **送出時才顯示**＝缺必填、太短（按下去 → 欄位錯誤、焦點到第一個錯誤欄位；之後隨輸入即時更新）；
  送出鈕只因「有即時錯誤」或「送出中」禁用。不做 `onBlur` 那一層（今天沒有 email／URL 那種欄位）。
- **送出狀態**：送出中禁用＋handler 自己 guard（連按 Enter 不會送兩次）；失敗值不清、錯誤用 `toUiError(cause).message`、
  放在送出鈕上方、`role="alert"`；**不自動重送**（後端沒有 rate limit，也沒有冪等鍵）。
- **樂觀更新的回滾**寫成 hook 層的規則與判準（快照 → 套用 → 失敗還原並保留提交值 → 成功以伺服器值為準、一次一個 in-flight），
  **今天沒有任何表單啟用它**（`FE-A04` 是悲觀更新）。
- **表單機制用 react-hook-form ＋ Zod**（WBS 明寫；兩位審查者第二輪一致：RHF 處理過 touched／errors／submitting／重複送出，
  React Compiler 的規則對第三方庫不管、對自製 hook 會管）。`LoginForm` 遷到同一套，`FE-A01` 的可觀察行為不變；`AvatarPicker` **不改**（它是草稿式 picker，不是提交表單）。
- **`FORM_LIMITS`**：前端自訂的上限另立一個模組（不放進 `LIMITS` —— 那張表每個數字都要有後端出處，測試守著）：
  `projectTitle 60`、`projectBody 2000`、`skillCount 10`、`skillLength 40`、`hoursPerWeek 0–80`。契約 schema 與契約測試永遠只看 `LIMITS`。

## ⚠️ 不做什麼

- **SHALL NOT 做設計系統**（欄位尺寸、間距、responsive 的完整規範）—— `controls.ts` 的下限照舊。
- **SHALL NOT 做 422 的 per-field 對映**：前端已先驗，422 是契約漂移或 bug，顯示成一般送出錯誤（`FE-X03`）。
- **SHALL NOT 改 `AvatarPicker`。**
- **SHALL NOT 自動重送任何 mutation。**
- **SHALL NOT 在這一列做任何產品表單**（名片編輯是 `FE-A04`，建案件是 `FE-B02`）。
