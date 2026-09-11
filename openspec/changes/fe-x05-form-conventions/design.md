# `FE-X05` 設計：難逆轉的決定與代價

## D1｜react-hook-form ＋ Zod，不自製（兩位審查者第二輪一致）

第一輪一位主張自製小 hook（5 欄的表單不值得 10 KB）。第二輪看了事實收回：WBS 明寫 RHF＋Zod；RHF 處理過 touched／errors／
isSubmitting／欄位陣列；**React Compiler 的規則對第三方庫不管、對自製 hook 會管**（ref 不可在 render 讀、effect 不可同步 setState），
自製版本會一路踩。代價：+10 KB gzip、多一個依賴要跟 React 版本走。
`@hookform/resolvers/zod` 接 Zod 4。**兩層時機不是靠 RHF 的 `mode`／`reValidateMode` 做的**（審查抓到：單一 resolver 在 `onChange` 會一次回報
required／too_small，`reValidateMode` 延後不了）—— 是 `useForm` 的封裝依 Zod issue 的 `code` 分流：
`too_big`／`invalid_format`／`invalid_type`／數值範圍 → 即時（一律顯示，且算進「送出禁用」）；`too_small`（含空字串的必填）→ 只在
`formState.submitCount > 0` 之後顯示、永不算進禁用。RHF 本身 `mode: 'onChange'`、`criteriaMode: 'all'`，`handleSubmit` 在有任何錯誤時不呼叫 onValid
並把焦點放到第一個錯誤欄位（`shouldFocusError`）。`canSubmit = !busy && !hasImmediateErrors`；**不用 `formState.isValid`**（它含 too_small）。

## D2｜驗證時機的兩層，不是三層

即時＝上限／範圍／格式；送出時＝必填／太短。一位審查者第一輪提 `onBlur` 給 email／URL 那種格式 —— 今天沒有那種欄位，
第二輪同意不做。哪天有了再加第三層，規格那時再改。

## D3｜`FORM_LIMITS` 是另一個模組，不是 `LIMITS.uiMax`

`LIMITS` 的每一個數字都有後端出處（`LIMIT_SOURCES`，測試守著）；前端自訂的上限沒有後端出處，放進去就是讓那張表出現「出處：我們自己」。
`effectiveLimit(field)`：後端有上限用它，沒有才用 `FORM_LIMITS`；兩邊都有時前端的不得比後端寬（測試守）。
數字（第二輪定案）：title 60、body 2000、skillCount 10、skillLength 40（「React Native (TypeScript)」要放得下）、hours 0–80（168 是無效資訊）。
文案要說「本站的上限」—— 不假裝是後端的。

## D4｜樂觀回滾只寫 hook 層

WBS 有這一條，但今天沒有表單該用它（`FE-A04` 悲觀更新：成功才 adopt identity）。規則與判準現在定好（`src/forms/optimistic.ts`），
第一個需要它的表單（可能是狀態文字）直接用。**不為了證明它而讓某個表單樂觀。**

## D5｜錯誤在送出鈕上方

一位審查者：表單長、送出鈕在下面、錯誤在頂端 → 按了看不到。所以 alert 放送出鈕**上方**（DOM 順序在鈕之前），`role="alert"`。
文案唯一來源 `toUiError`（`FE-X03`）；不做 422 的 per-field 對映（前端已先驗，422 是漂移或 bug）。

## D6｜`LoginForm` 遷、`AvatarPicker` 不遷

`AvatarPicker` 是草稿式 picker（點了就套用、失焦就丟），不是「多欄填好按送出」的表單；硬塞 RHF 只會模糊它的互動模型。

## 待答問題

1. **RHF 在 React 19 ＋ Compiler 下的 `register` ref 寫法**：`{...register('x')}` 直接展開到 `<input>` 是否觸發 `react-hooks/refs`？實作時量，會的話用 `Controller`。
2. **`@hookform/resolvers` 對 Zod 4 的版本**：實作時釘。

## 這一份怎麼驗

- `S01`～`S07`：一個測試用的 `Fixture` 表單（兩個必填文字欄、一個上限 20 的欄、一個 number 欄）＋ `contract-server` 收請求；不是 `LoginForm`（它只有一個欄位，測不到 `S04`）。
- `S08`～`S10`：`optimistic()` 純函式。
- `S11`、`S12`：純函式 ＋ ESLint API。
- `S13`：既有測試檔 ＋ `input[name=nickname]`。
- `S14`：Fixture 表單的下限 3 欄位。
- **不連任何外部服務。**
- 驗收不是全綠：guard 拿掉 → `S05` 紅；失敗 reset → `S06` 紅；自動重送 → `S07` 紅；太短即時擋 → `S02` 紅；回滾不還原 → `S08` 紅；`FORM_LIMITS` 加一個後端有上限的鍵 → `S11` 紅。
